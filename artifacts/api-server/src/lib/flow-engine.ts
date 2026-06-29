/**
 * Flow Engine — executes the active bot flow for a single incoming message.
 *
 * Design rules:
 * • If the conversation is already mid-booking (bot asked for phone/address),
 *   skip the flow entirely — let the caller handle it with the full AI.
 * • Saved-reply matching is conservative: requires ≥3-char keywords and
 *   full-word boundary checking.
 * • The AI prompt inside nodes mirrors the strict rules from webhook.ts.
 */

import { db } from "@workspace/db";
import { botFlowsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";

// ── Cache active flow (invalidated after save / activate) ─────────────────
let _cachedFlow: { nodes: FlowNode[]; edges: FlowEdge[] } | null = null;
let _cacheTs = 0;
const FLOW_CACHE_TTL = 60_000;

export interface FlowNode {
  id: string;
  data: {
    type: string;
    label?: string;
    keywords?: string[];
    intents?: string[];
    prompt?: string;
    maxTokens?: number;
    message?: string;
    productCode?: string;
  };
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  label?: string;
}

export interface FlowResult {
  replies: string[];
  productCodes: string[];
  handover: boolean;
  handoverMessage?: string;
}

// ── Load / invalidate cache ───────────────────────────────────────────────

export async function loadActiveFlow(): Promise<{ nodes: FlowNode[]; edges: FlowEdge[] } | null> {
  if (_cachedFlow && Date.now() - _cacheTs < FLOW_CACHE_TTL) return _cachedFlow;
  try {
    const rows = await db.select().from(botFlowsTable).where(eq(botFlowsTable.isActive, true)).limit(1);
    if (!rows.length) { _cachedFlow = null; _cacheTs = Date.now(); return null; }
    const nodes: FlowNode[] = JSON.parse(rows[0].nodes || "[]");
    const edges: FlowEdge[] = JSON.parse(rows[0].edges || "[]");
    if (!nodes.length) { _cachedFlow = null; _cacheTs = Date.now(); return null; }
    _cachedFlow = { nodes, edges };
    _cacheTs = Date.now();
    console.log(`[FLOW_ENGINE] Flow loaded: "${rows[0].name}" (${nodes.length} nodes)`);
    return _cachedFlow;
  } catch (err: any) {
    console.log(`[FLOW_ENGINE] loadActiveFlow error: ${err?.message}`);
    return null;
  }
}

export function invalidateFlowCache() {
  _cachedFlow = null;
  _cacheTs = 0;
}

// ── Arabic normalization ───────────────────────────────────────────────────

function norm(text: string): string {
  return text
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/گ/g, "ك")
    .replace(/چ/g, "ج")
    .replace(/پ/g, "ب")
    .replace(/ڤ/g, "ف")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

// ── Edge resolution helpers ───────────────────────────────────────────────

function outEdges(nodeId: string, edges: FlowEdge[]): FlowEdge[] {
  return edges.filter(e => e.source === nodeId);
}

function yesEdge(outs: FlowEdge[]): FlowEdge | undefined {
  return outs.find(e =>
    e.sourceHandle === "yes" ||
    (e.label && (e.label.includes("✓") || norm(e.label).includes("نعم") || norm(e.label).includes("تطابق")))
  ) || outs[0];
}

function noEdge(outs: FlowEdge[]): FlowEdge | undefined {
  return outs.find(e =>
    e.sourceHandle === "no" ||
    (e.label && (e.label.includes("✗") || norm(e.label).includes("لا") || norm(e.label).includes("تطابق") === false))
  ) || outs[1] || outs[0];
}

// ── Detect mid-booking state ──────────────────────────────────────────────
// If the bot's last message asked for phone/address, we are mid-booking.
// The flow engine must NOT take over — let the full AI handle it.

const BOOKING_ASKS = [
  "دزي الرقم", "دزيلي رقم", "دزيلنا رقم", "ارسلي رقم", "رقم الهاتف",
  "العنوان كامل", "العنوان الكامل", "للحجز دزي", "للحجز ارسلي",
  "تدللين عيني، للحجز", "محتاجه للتوصيل", "اكمل الحجز", "أكمل الحجز",
  "لإكمال الحجز", "لاكمال الحجز", "المحافظة والمنطقة",
];

// Phrases that indicate we are already inside an active product/booking exchange
const ACTIVE_EXCHANGE_PHRASES = [
  "شوفي هذول", "عيني شوفي", "عيني تدللين", "تحبين أحجز",
  "نحجزه لج", "متوفر لهذا العمر", "سعره", "الف", "تم الحجز",
  "[SEND_PRODUCTS", "عيني كم عمر", "يا عمر",
];

/**
 * Returns true when:
 * - The bot's last message asked for booking info (phone/address), OR
 * - The conversation has 2+ bot replies and the last one looks like an
 *   active product/booking exchange (to avoid restarting the flow).
 */
export function isMidBooking(history: Array<{ role: string; content: string }>): boolean {
  const botMessages = history.filter(h => h.role === "assistant");
  if (!botMessages.length) return false;

  const lastBot = botMessages[botMessages.length - 1];

  // Explicit booking request
  if (BOOKING_ASKS.some(phrase => lastBot.content.includes(phrase))) return true;

  // Active product/booking exchange with at least 2 prior bot turns
  if (botMessages.length >= 2) {
    if (ACTIVE_EXCHANGE_PHRASES.some(phrase => lastBot.content.includes(phrase))) return true;
  }

  return false;
}

// ── Conservative saved-reply matching ─────────────────────────────────────
// Requires keyword length ≥ 3 chars and word-boundary (space or start/end).

function matchSaved(
  userMessage: string,
  savedReplies: any[],
): { reply: string; title: string } | null {
  const normMsg = " " + norm(userMessage) + " ";
  for (const r of savedReplies) {
    if (!r.isActive || !r.triggerKeywords) continue;
    const kws = r.triggerKeywords
      .split(/[,،\n]+/)
      .map((k: string) => norm(k.trim()))
      .filter((k: string) => k.length >= 3);
    for (const kw of kws) {
      // Escape special regex chars to prevent ReDoS from user-controlled keywords
      const escapedKw = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // nosemgrep: detect-non-literal-regexp — input is properly escaped above
      const re = new RegExp(`(^|\\s|[^\\u0600-\\u06FF])${escapedKw}(\\s|$|[^\\u0600-\\u06FF])`);
      if (re.test(normMsg)) {
        return { reply: r.replyAr, title: r.titleAr };
      }
    }
  }
  return null;
}

// ── Classify intent with GPT ──────────────────────────────────────────────

async function classifyIntent(
  userMessage: string,
  history: Array<{ role: string; content: string }>,
  intents: string[],
  settings: any,
): Promise<number> {
  if (!intents.length) return 0;
  const recent = history.slice(-4)
    .map(h => `${h.role === "user" ? "زبون" : "موظف"}: ${h.content}`)
    .join("\n");
  const prompt = `صنّف هدف رسالة الزبون. أجب برقم فقط (1–${intents.length}).

السياق:
${recent || "—"}

رسالة الزبون: "${userMessage}"

الخيارات:
${intents.map((t, i) => `${i + 1}. ${t}`).join("\n")}`;

  try {
    const res = await openai.chat.completions.create({
      model: settings?.aiModelText || "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 3,
      temperature: 0,
    });
    const num = parseInt((res.choices[0]?.message?.content || "1").replace(/\D/g, ""));
    if (!isNaN(num) && num >= 1 && num <= intents.length) return num - 1;
  } catch (err: any) {
    console.log(`[FLOW_ENGINE] classifyIntent error: ${err?.message}`);
  }
  return 0;
}

// ── AI reply generator — full strict rules ────────────────────────────────

async function generateNodeReply(
  userMessage: string,
  history: Array<{ role: string; content: string }>,
  products: any[],
  savedReplies: any[],
  trainingNotes: any[],
  settings: any,
  nodePrompt: string,
  maxTokens: number,
): Promise<string> {
  // Build product list (same format as webhook.ts)
  const fmtPrice = (n: any) => {
    const v = Number(n); if (!v || isNaN(v)) return "غير محدد";
    return v >= 1000 ? `${(v / 1000).toFixed(0)} الف` : `${v}`;
  };
  const productContext = products.map((p, i) => {
    const pa = p as any;
    let ln = `[${String(i + 1).padStart(2, "0")}] كود: ${p.productId}\n` +
      `     فئة: ${p.category} | جنس: ${p.gender}\n` +
      `     أعمار: ${pa.ageMin ?? "—"}–${pa.ageMax ?? "—"} سنة\n` +
      `     ألوان: ${pa.colors || "غير محدد"}\n` +
      `     سعر: ${fmtPrice(p.price)} | مخزون: ${p.stock} قطعة`;
    if (p.publicImageUrl) ln += " ✓صورة";
    return ln;
  }).join("\n\n");

  // Build saved replies (flagged with ⭐ if keyword hits current message)
  const msgLower = norm(userMessage);
  const repliesCtx = savedReplies.filter((r: any) => r.isActive).map((r: any, i) => {
    const kws = (r.triggerKeywords || "").split(/[,،\n]+/).map((k: string) => norm(k)).filter((k: string) => k.length >= 2);
    const star = kws.some((k: string) => msgLower.includes(k)) ? "⭐ " : "";
    return `${star}[${i + 1}] ${r.titleAr} [كلمات: ${kws.join("،")}]\nالرد: ${r.replyAr}`;
  }).join("\n\n");

  const trainingCtx = trainingNotes.filter((n: any) => n.active)
    .map((n: any, i) => `${i + 1}. ${n.note}`).join("\n");

  // Phone/address from history
  const phoneRe = /(?:\+9647|07)\d{9}/g;
  const knownPhones = new Set<string>();
  const knownAddr: string[] = [];
  const addrKws = ["بغداد","بصره","موصل","نجف","كربلاء","اربيل","كركوك","ديالي","سليمانيه","الانبار","واسط","ميسان","ذي قار","دهوك","حله","تكريت","زاخو","عقره","شارع","حي","محله","زقاق","حاره"];
  for (const m of history) {
    if (m.role !== "user") continue;
    const phones = m.content.match(phoneRe);
    if (phones) phones.forEach(p => knownPhones.add(p));
    if (addrKws.some(kw => norm(m.content).includes(kw))) knownAddr.push(m.content.trim());
  }
  const knownInfoSec = (knownPhones.size > 0 || knownAddr.length > 0)
    ? `\n\n📋 معلومات الزبون من المحادثة (لا تطلبها مجدداً):\n` +
      (knownPhones.size > 0 ? `- الهاتف: ${[...knownPhones].join(" / ")}\n` : "") +
      (knownAddr.length > 0 ? `- العنوان: "${knownAddr[knownAddr.length - 1]}"\n` : "")
    : "";

  const systemPrompt = `أنت بوت ردود آلي لمتجر سنبلة لملابس الأطفال العراقي. اللهجة عراقية فقط (عيني، تدللين).

${nodePrompt ? `=== تعليمات المرحلة الحالية (أولوية قصوى) ===\n${nodePrompt}\n=== نهاية التعليمات ===\n` : ""}
═══════════════════════════════════
🔒 قواعد صارمة — لا استثناء أبداً:
═══════════════════════════════════
1. الردود المحفوظة (أعلى أولوية): الردود ذات ⭐ هي ردك — انسخها حرفياً. لا تغيّر حرفاً.
   إذا لم يوجد ⭐: اختر الأقرب موضوعاً وأعده كما هو.
   إذا لم يقترب أي رد: قل فقط "تفضلي اختي كيف أقدر أساعدج؟"
   ممنوع اختراع جمل جديدة أو سياسات أو معلومات غير موجودة في الردود المحفوظة.

2. الصور (إلزامية): إذا سأل الزبون عن منتج محدد وكان ✓صورة → أضف [SEND_PRODUCTS:الكود].
   ممنوع إرسال قائمة نصية للمنتجات.

3. العمر أولاً: ممنوع عرض موديل أو سعر بدون معرفة عمر الطفل.
   إذا ما ذُكر العمر → اسألي: "عيني كم عمر الطفل؟"

4. الحجز: عند طلب الحجز → اطلب الرقم والعنوان فقط إذا لم يُذكرا في المحادثة.
   عند اكتمال الرقم والعنوان → "تم الحجز بنجاح عيني، وتدللين" — هذه الجملة فقط.

5. ممنوع قوله أبداً:
   • "خلصت القياسات" أو "انتهى المخزون" — قل "غير متوفر حالياً".
   • "ارجعي بالسلامة" أو "تفضلي بالسلامة".
   • "لا أقدر أراجع المحادثات السابقة".
   • ذكر أي معلومة لم تأتِ من المخزون أو الردود المحفوظة.
   • الهلوسة عن قياسات أو أعمار لم يذكرها الزبون.

6. رسالة واحدة مختصرة فقط في كل رد. ممنوع التكرار.${knownInfoSec}

${repliesCtx ? `\n=== الردود المحفوظة ===\n${repliesCtx}\n=== نهاية الردود المحفوظة ===` : "[لا توجد ردود محفوظة — رد مختصر ومهذب]"}

${trainingCtx ? `\n=== ملاحظات التدريب ===\n${trainingCtx}\n===` : ""}

=== المخزون الحالي (${products.length} موديل) ===
${productContext || "المخزون فارغ"}`;

  const msgs: any[] = [
    { role: "system", content: systemPrompt },
    ...history.slice(-8).map(h => ({ role: h.role as any, content: h.content })),
    { role: "user", content: userMessage },
  ];

  try {
    const res = await openai.chat.completions.create({
      model: settings?.aiModelText || "gpt-4o-mini",
      messages: msgs,
      max_completion_tokens: maxTokens,
      temperature: 0.1,
    });
    return res.choices[0]?.message?.content?.trim() || "تفضلي اختي كيف أقدر أساعدج؟";
  } catch (err: any) {
    console.log(`[FLOW_ENGINE] generateNodeReply error: ${err?.message}`);
    return "تفضلي اختي كيف أقدر أساعدج؟";
  }
}

// ── Extract [SEND_PRODUCTS:...] tags ─────────────────────────────────────

function extractProductCodes(reply: string): { codes: string[]; cleaned: string } {
  const matches = [...reply.matchAll(/\[SEND_PRODUCTS:([^\]]+)\]/gi)];
  const codes = matches.flatMap(m => m[1].split(",").map(c => c.trim()).filter(Boolean));
  const cleaned = reply.replace(/\[SEND_PRODUCTS:[^\]]+\]/gi, "").trim();
  return { codes, cleaned };
}

// ── Main flow execution ───────────────────────────────────────────────────

export async function executeFlow(
  nodes: FlowNode[],
  edges: FlowEdge[],
  userMessage: string,
  history: Array<{ role: string; content: string }>,
  savedReplies: any[],
  products: any[],
  trainingNotes: any[],
  settings: any,
): Promise<FlowResult> {
  const result: FlowResult = { replies: [], productCodes: [], handover: false };

  const nodesById: Record<string, FlowNode> = {};
  for (const n of nodes) nodesById[n.id] = n;

  const startNode = nodes.find(n => n.data.type === "start");
  if (!startNode) return result;

  let currentId: string | null = startNode.id;
  let steps = 0;
  const MAX_STEPS = 20;

  while (currentId && steps++ < MAX_STEPS) {
    const node = nodesById[currentId];
    if (!node) break;

    const outs = outEdges(currentId, edges);
    const type = node.data.type;
    console.log(`[FLOW_ENGINE] Step ${steps}: node "${type}" (${node.id})`);

    // ── start ─────────────────────────────────────────────────────────────
    if (type === "start") {
      currentId = outs[0]?.target ?? null;
      continue;
    }

    // ── saved_reply ───────────────────────────────────────────────────────
    if (type === "saved_reply") {
      const match = matchSaved(userMessage, savedReplies);
      if (match) {
        console.log(`[FLOW_ENGINE] saved_reply HIT: "${match.title}"`);
        result.replies.push(match.reply);
        currentId = yesEdge(outs)?.target ?? null;
      } else {
        console.log(`[FLOW_ENGINE] saved_reply MISS`);
        currentId = noEdge(outs)?.target ?? null;
      }
      continue;
    }

    // ── classify ──────────────────────────────────────────────────────────
    if (type === "classify") {
      const intents = node.data.intents || [];
      const idx = await classifyIntent(userMessage, history, intents, settings);
      const classified = intents[idx] || intents[0] || "";
      console.log(`[FLOW_ENGINE] classify → "${classified}" (${idx})`);

      const normClassified = norm(classified);
      const words = normClassified.split(/\s+/).filter(w => w.length >= 2);

      let targetEdge = outs.find(e => {
        const el = norm(e.label?.toString() || "");
        return words.some(w => el.includes(w));
      });
      if (!targetEdge) targetEdge = outs[idx] || outs[0];
      currentId = targetEdge?.target ?? null;
      continue;
    }

    // ── condition ─────────────────────────────────────────────────────────
    if (type === "condition") {
      const keywords = node.data.keywords || [];
      const normMsg = norm(userMessage);
      const recentHistory = history.slice(-4).map(h => norm(h.content)).join(" ");
      const matched = keywords.some((kw: string) =>
        normMsg.includes(norm(kw)) || recentHistory.includes(norm(kw))
      );
      console.log(`[FLOW_ENGINE] condition "${node.data.label}" → ${matched ? "YES" : "NO"}`);
      currentId = matched ? yesEdge(outs)?.target ?? null : noEdge(outs)?.target ?? null;
      continue;
    }

    // ── ai_reply ──────────────────────────────────────────────────────────
    if (type === "ai_reply") {
      let reply = await generateNodeReply(
        userMessage, history, products, savedReplies, trainingNotes, settings,
        node.data.prompt || "", node.data.maxTokens || 150,
      );
      if (reply.includes("تفضلي اختي كيف أقدر أساعدج")) {
        result.handover = true;
        result.handoverMessage = reply;
        currentId = null;
        continue;
      }
      const { codes, cleaned } = extractProductCodes(reply);
      if (codes.length) result.productCodes.push(...codes);
      result.replies.push(cleaned || reply);
      currentId = outs[0]?.target ?? null;
      continue;
    }

    // ── send_image ────────────────────────────────────────────────────────
    if (type === "send_image") {
      let reply = await generateNodeReply(
        userMessage, history, products, savedReplies, trainingNotes, settings,
        node.data.prompt || "", node.data.maxTokens || 180,
      );
      const { codes, cleaned } = extractProductCodes(reply);
      if (codes.length) result.productCodes.push(...codes);
      if (node.data.productCode) result.productCodes.push(node.data.productCode);
      result.replies.push(cleaned || reply);
      currentId = outs[0]?.target ?? null;
      continue;
    }

    // ── handover ──────────────────────────────────────────────────────────
    if (type === "handover") {
      result.handover = true;
      result.handoverMessage = node.data.message || "تفضلي اختي كيف أقدر أساعدج؟";
      console.log(`[FLOW_ENGINE] handover: "${result.handoverMessage?.slice(0, 60)}"`);
      currentId = null;
      continue;
    }

    // ── end ───────────────────────────────────────────────────────────────
    if (type === "end") {
      console.log(`[FLOW_ENGINE] end: "${node.data.label}"`);
      currentId = null;
      continue;
    }

    currentId = outs[0]?.target ?? null;
  }

  return result;
}
