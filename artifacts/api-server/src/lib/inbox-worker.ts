/**
 * Automated Inbox Processor — Inbox Zero Logic
 *
 * Scans the Meta (Facebook + Instagram) inbox every 3 minutes for
 * unread / unanswered conversations and processes them with the bot.
 *
 * Flow per conversation:
 *  1. Fetch last 10 messages from Meta API
 *  2. If last message is from user AND our DB has no recent bot reply → process
 *  3. Priority 1: Saved Replies exact match
 *  4. Priority 2: AI with full inventory + system prompt
 *  5. Human Handover: if AI falls back to "no match" phrase → escalate, skip reply
 *  6. After sending reply → send mark_seen to clear from admin inbox
 *  7. Rate-limit: max 5 conversations per batch, 1.5 s delay between each
 */

import { db } from "@workspace/db";
import {
  settingsTable,
  savedRepliesTable,
  inventoryTable,
  chatConversationsTable,
  chatMessagesTable,
  botTrainingNotesTable,
} from "@workspace/db/schema";
import { eq, desc, and, or, ilike } from "drizzle-orm";

import { openai } from "@workspace/integrations-openai-ai-server";
import { randomUUID } from "crypto";

const META_API_VERSION = "v21.0";
const WORKER_INTERVAL_MS = 90 * 1000;       // Phase 2: scan every 90 seconds
const LEARNING_INTERVAL_MS = 30 * 60 * 1000; // Phase 1: learn every 30 minutes
const MAX_BATCH = 5;
const BATCH_DELAY_MS = 1500;
const HISTORY_LIMIT = 15; // Phase 2: fetch 15 messages per thread for context

// Human-handover phrase — if bot's reply contains this, skip reply and escalate
const HUMAN_HANDOVER_TRIGGER = "تفضلي اختي كيف أقدر أساعدج";

let isRunning = false;

// ── Meta API helpers ───────────────────────────────────────────────────────

async function markAsSeen(
  recipientId: string,
  pageId: string,
  accessToken: string,
): Promise<void> {
  try {
    await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/${pageId}/messages?access_token=${accessToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: { id: recipientId },
          sender_action: "mark_seen",
        }),
      },
    );
  } catch (err: any) {
    console.log(`[INBOX] mark_seen failed for ${recipientId}: ${err?.message}`);
  }
}

async function sendReply(
  recipientId: string,
  pageId: string,
  accessToken: string,
  text: string,
): Promise<void> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/${pageId}/messages?access_token=${accessToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient: { id: recipientId }, message: { text } }),
      },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.log(`[INBOX] sendReply failed status=${res.status} body=${body.slice(0, 200)}`);
    } else {
      console.log(`[INBOX] Sent reply to ${recipientId}: "${text.slice(0, 60)}"`);
    }
  } catch (err: any) {
    console.log(`[INBOX] sendReply error: ${err?.message}`);
  }
}

async function sendImageAttachment(
  recipientId: string,
  pageId: string,
  accessToken: string,
  imageUrl: string,
): Promise<void> {
  try {
    await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/${pageId}/messages?access_token=${accessToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { attachment: { type: "image", payload: { url: imageUrl, is_reusable: true } } },
        }),
      },
    );
  } catch { /* silent */ }
}

// ── Fetch unread conversations from Meta ────────────────────────────────────

interface MetaMessage {
  from: { id: string };
  message: string;
  created_time: string;
}

interface MetaConversation {
  id: string;
  unread_count: number;
  participants?: { data: Array<{ id: string; name: string }> };
  messages?: { data: MetaMessage[] };
}

async function fetchUnreadConversations(
  pageId: string,
  accessToken: string,
  platform: "facebook" | "instagram",
): Promise<MetaConversation[]> {
  try {
    const platformParam = platform === "instagram" ? "&platform=instagram" : "";
    const url =
      `https://graph.facebook.com/${META_API_VERSION}/me/conversations` +
      `?fields=id,unread_count,participants,messages.limit(${HISTORY_LIMIT}){from,message,created_time}` +
      `${platformParam}` +
      `&access_token=${accessToken}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) {
      console.log(`[INBOX] fetchUnreadConversations failed: ${res.status}`);
      return [];
    }
    const data = (await res.json()) as { data?: MetaConversation[] };
    return (data.data || []).filter((c) => (c.unread_count ?? 0) > 0);
  } catch (err: any) {
    console.log(`[INBOX] fetchUnreadConversations error: ${err?.message}`);
    return [];
  }
}

// ── Resolve sender ID from conversation ────────────────────────────────────

function resolveSenderId(conv: MetaConversation, pageId: string): string | null {
  const participants = conv.participants?.data ?? [];
  const user = participants.find((p) => p.id !== pageId);
  if (user) return user.id;

  // Fallback: extract from messages
  const messages = conv.messages?.data ?? [];
  const userMsg = messages.find((m) => m.from?.id !== pageId);
  return userMsg?.from?.id ?? null;
}

// ── Check if we already replied (in our DB) after the last user message ────

async function alreadyReplied(
  senderId: string,
  platform: string,
  lastUserMessageTime: Date | null,
): Promise<boolean> {
  const convId = `${platform}_${senderId}`;
  const rows = await db
    .select()
    .from(chatMessagesTable)
    .where(eq(chatMessagesTable.conversationId, convId))
    .orderBy(desc(chatMessagesTable.createdAt))
    .limit(2);

  if (rows.length === 0) return false;

  // If the most recent message in our DB is from the assistant → already replied
  if (rows[0].role === "assistant") return true;

  // If last user message time is old enough (> 2 minutes) and we have a recent assistant reply
  if (lastUserMessageTime) {
    const recentCutoff = new Date(Date.now() - 2 * 60 * 1000);
    if (lastUserMessageTime < recentCutoff) {
      const hasAssistant = rows.some((r) => r.role === "assistant");
      if (hasAssistant) return true;
    }
  }

  return false;
}

// ── Fetch DB history for context ───────────────────────────────────────────

async function getDbHistory(senderId: string, platform: string, limit = HISTORY_LIMIT) {
  const convId = `${platform}_${senderId}`;
  const rows = await db
    .select()
    .from(chatMessagesTable)
    .where(eq(chatMessagesTable.conversationId, convId))
    .orderBy(desc(chatMessagesTable.createdAt))
    .limit(limit);
  return rows.reverse();
}

// ── Save bot reply to DB ────────────────────────────────────────────────────

async function saveBotReply(
  senderId: string,
  platform: string,
  userMessage: string,
  botReply: string,
) {
  const convId = `${platform}_${senderId}`;
  const now = new Date();

  // Upsert conversation
  await db
    .insert(chatConversationsTable)
    .values({
      id: convId,
      platform,
      senderId,
      lastMessage: botReply,
      lastMessageAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: chatConversationsTable.id,
      set: { lastMessage: botReply, lastMessageAt: now, updatedAt: now },
    });

  // Save user message
  await db.insert(chatMessagesTable).values({
    id: randomUUID(),
    conversationId: convId,
    role: "user",
    content: userMessage,
    createdAt: now,
  }).onConflictDoNothing();

  // Save bot reply
  await db.insert(chatMessagesTable).values({
    id: randomUUID(),
    conversationId: convId,
    role: "assistant",
    content: botReply,
    createdAt: new Date(now.getTime() + 1),
  });
}

// ── Escalate conversation for human review ─────────────────────────────────

async function escalateForHuman(senderId: string, platform: string, reason: string) {
  const convId = `${platform}_${senderId}`;
  try {
    await db
      .insert(chatConversationsTable)
      .values({
        id: convId,
        platform,
        senderId,
        isEscalated: true,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: chatConversationsTable.id,
        set: { isEscalated: true, updatedAt: new Date() },
      });
    console.log(`[INBOX] Escalated ${convId} for human review — reason: ${reason}`);
  } catch (err: any) {
    console.log(`[INBOX] escalateForHuman error: ${err?.message}`);
  }
}

// ── Arabic normalisation (mirrors webhook.ts) ─────────────────────────────

function normalizeArabic(text: string): string {
  return text
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/گ/g, "ك")
    .replace(/چ/g, "ج")
    .replace(/پ/g, "ب")
    .replace(/ڤ/g, "ف")
    .replace(/ق/g, "ك")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

// ── Priority 1: Match saved replies ───────────────────────────────────────

function matchSavedReply(
  userMessage: string,
  savedReplies: Array<{ titleAr: string; titleEn: string; triggerKeywords: string | null; replyAr: string; isActive: boolean | null }>,
): { reply: string; keyword: string; title: string } | null {
  const normMsg = normalizeArabic(userMessage);
  for (const r of savedReplies) {
    if (!r.isActive || !r.triggerKeywords) continue;
    // Only match against explicit triggerKeywords (not titles) for precision
    const kws = r.triggerKeywords
      .split(/[,،]+/)
      .map((k) => normalizeArabic(k))
      .filter((k) => k.length >= 2);
    const hit = kws.find((k) => normMsg.includes(k));
    if (hit) return { reply: r.replyAr, keyword: hit, title: r.titleAr };
  }
  return null;
}

// ── Priority 2: AI with inventory + system prompt ─────────────────────────

function formatPrice(price: number | null | undefined): string {
  if (!price) return "—";
  return price >= 1000 ? `${(price / 1000).toFixed(0)} ألف` : `${price}`;
}

async function generateAIReply(
  userMessage: string,
  history: Array<{ role: string; content: string }>,
  savedReplies: any[],
  products: any[],
  trainingNotes: any[],
  settings: any,
): Promise<string> {
  const productContext = products.map((p, i) => {
    const ages: string[] = [];
    if (p.minAge != null) ages.push(`${p.minAge}–${p.maxAge ?? "+"} سنة`);
    let line =
      `[${String(i + 1).padStart(2, "0")}] كود: ${p.productId}\n` +
      `     فئة: ${p.category} | جنس: ${p.gender}\n` +
      `     أعمار: ${ages.join(", ") || "—"}\n` +
      `     ألوان: ${(p as any).colors || "غير محدد"}\n` +
      `     سعر: ${formatPrice(p.price)} | مخزون: ${p.stock} قطعة`;
    if (p.publicImageUrl) line += " ✓صورة";
    return line;
  }).join("\n\n");

  const repliesContext = savedReplies
    .filter((r) => r.isActive)
    .map((r: any) => `【${r.titleAr}】\n${r.replyAr}`)
    .join("\n\n---\n\n");

  const trainingContext = trainingNotes
    .filter((n) => n.active)
    .map((n: any, i: number) => `${i + 1}. ${n.note}`)
    .join("\n");

  const systemPrompt = `أنت مساعدة متجر سنبولة لملابس الأطفال. اسمك "سنبولة" وتتحدثين باللهجة العراقية.

===الردود المحفوظة (أجيبي منها حرفياً عند التطابق)===
${repliesContext || "لا يوجد"}

===المخزون الحالي===
${productContext || "لا يوجد مخزون"}

${trainingContext ? `===ملاحظات التدريب===\n${trainingContext}` : ""}

القواعد الصارمة:
1. أجيبي من الردود المحفوظة أولاً إذا كان السؤال مطابقاً.
2. للأسعار والموديلات: استخدمي المخزون فقط. ممنوع اختراع أرقام.
3. إذا سأل الزبون عن منتج محدد وعنده ✓صورة: أضيفي [SEND_PRODUCTS:الكود] في نهاية ردك.
4. إذا طلب "دزيلي المتوفرين": قولي "اختاري من الصفحة عيني وأنا أقلج متوفره لو لا، أكثر من 100 موديل بالصفحة 😊"
5. إذا ما عندج جواب مناسب: قولي فقط "تفضلي اختي كيف أقدر أساعدج؟"
6. ممنوع تماماً: "خلصت القياسات" أو أي جملة تقول إن شيئاً خلص من المخزون.
7. رد واحد قصير فقط.`;

  const messages: any[] = [
    { role: "system", content: systemPrompt },
    ...history.slice(-10).map((h) => ({ role: h.role as any, content: h.content })),
    { role: "user", content: userMessage },
  ];

  const completion = await openai.chat.completions.create({
    model: settings?.aiModelText || "gpt-4o-mini",
    messages,
    max_completion_tokens: 120,
    temperature: 0.2,
  });

  return completion.choices[0]?.message?.content?.trim() || "تفضلي اختي كيف أقدر أساعدج؟";
}

// ── Process a single conversation ─────────────────────────────────────────

async function processConversation(
  conv: MetaConversation,
  platform: "facebook" | "instagram",
  pageId: string,
  accessToken: string,
  savedReplies: any[],
  products: any[],
  trainingNotes: any[],
  settings: any,
): Promise<void> {
  const messages = (conv.messages?.data ?? []).filter((m) => m.message?.trim());
  if (messages.length === 0) return;

  // Sort oldest → newest
  const sorted = [...messages].sort(
    (a, b) => new Date(a.created_time).getTime() - new Date(b.created_time).getTime(),
  );

  const lastMsg = sorted[sorted.length - 1];

  // If last message is from the page → already handled
  if (lastMsg.from?.id === pageId) {
    await markAsSeen(lastMsg.from.id, pageId, accessToken);
    return;
  }

  const senderId = lastMsg.from?.id;
  if (!senderId) return;

  const lastUserTime = new Date(lastMsg.created_time);
  const userMessage = lastMsg.message?.trim() || "";
  if (!userMessage) return;

  // Ignore very old messages (> 24 hours)
  if (Date.now() - lastUserTime.getTime() > 24 * 60 * 60 * 1000) return;

  // Check if we already replied
  if (await alreadyReplied(senderId, platform, lastUserTime)) {
    await markAsSeen(senderId, pageId, accessToken);
    return;
  }

  console.log(`[INBOX] Processing ${platform} sender=${senderId} msg="${userMessage.slice(0, 60)}"`);

  // ── INBOX Worker: Saved-Replies only ─────────────────────────────────
  // The primary bot (webhook handler) uses GPT for all AI replies.
  // The INBOX worker must NEVER escalate, NEVER call AI independently —
  // it only fires saved-reply matches for messages the webhook missed.
  // Escalation is the webhook handler's responsibility (isComplaintHandover check).

  // If welcome flow or saved-replies are disabled, skip all automated processing
  if ((settings as any).welcomeFlowEnabled || (settings as any).disableSavedReplies) {
    await markAsSeen(senderId, pageId, accessToken);
    console.log(`[INBOX] Welcome flow/saved replies disabled — skipping inbox worker for ${senderId}`);
    return;
  }

  const savedReplyMatch = matchSavedReply(userMessage, savedReplies);
  if (!savedReplyMatch) {
    // No saved-reply match — webhook handler will handle this via GPT.
    // Do NOT escalate, do NOT call AI. Just mark seen and exit.
    await markAsSeen(senderId, pageId, accessToken);
    console.log(`[INBOX] No saved-reply match for "${userMessage.slice(0, 40)}" — leaving for webhook GPT handler`);
    return;
  }

  const reply = savedReplyMatch.reply;
  console.log(`[REPLY_MATCH] Found keyword "${savedReplyMatch.keyword}" → "${savedReplyMatch.title}"`);
  if (!reply) return;

  // ── Send reply ──
  await sendReply(senderId, pageId, accessToken, reply);

  // ── Save to DB ──
  await saveBotReply(senderId, platform, userMessage, reply);

  // ── Mark as seen ──
  await markAsSeen(senderId, pageId, accessToken);
}

// ── Main inbox scan ────────────────────────────────────────────────────────

async function runInboxScan(): Promise<void> {
  if (isRunning) {
    console.log("[INBOX] Previous scan still running, skipping this cycle");
    return;
  }
  isRunning = true;

  try {
    // Load settings
    const settingsRows = await db.select().from(settingsTable).limit(1);
    const settings = settingsRows[0];
    if (!settings?.metaAccessToken || !settings?.facebookPageId) {
      console.log("[INBOX] No Meta credentials configured, skipping scan");
      return;
    }

    const { metaAccessToken: accessToken, facebookPageId: pageId } = settings;

    // Load shared data
    const [savedReplies, products, trainingNotes] = await Promise.all([
      db.select().from(savedRepliesTable).where(eq(savedRepliesTable.isActive, true)),
      db.select().from(inventoryTable).where(eq(inventoryTable.available, true)),
      db.select().from(botTrainingNotesTable).where(eq(botTrainingNotesTable.active, true)).catch(() => []),
    ]);

    // Scan both platforms
    const platforms: Array<"facebook" | "instagram"> = ["facebook", "instagram"];
    let totalProcessed = 0;

    for (const platform of platforms) {
      if (totalProcessed >= MAX_BATCH) break;

      const unread = await fetchUnreadConversations(pageId, accessToken, platform);

      for (const conv of unread.slice(0, MAX_BATCH - totalProcessed)) {
        try {
          await processConversation(
            conv,
            platform,
            pageId,
            accessToken,
            savedReplies,
            products,
            trainingNotes as any[],
            settings,
          );
          totalProcessed++;
          // Rate limit: delay between messages
          if (totalProcessed < MAX_BATCH) {
            await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
          }
        } catch (err: any) {
          console.log(`[INBOX] Error processing conv ${conv.id}: ${err?.message}`);
        }
      }
    }

    if (totalProcessed > 0) {
      console.log(`[INBOX] Scan complete — processed ${totalProcessed} conversations`);
    }
  } catch (err: any) {
    console.log(`[INBOX] Scan error: ${err?.message}`);
  } finally {
    isRunning = false;
  }
}

// ══════════════════════════════════════════════════════════════════════════
// PHASE 1: Human-Style Learning — extract booking patterns from Follow-Up threads
// ══════════════════════════════════════════════════════════════════════════

let lastLearnedNotes = new Set<string>(); // Dedup: don't add the same note twice

async function fetchFollowUpConversations(
  pageId: string,
  accessToken: string,
): Promise<MetaConversation[]> {
  try {
    // Meta Graph API: conversations with "follow_up" label / folder
    const url =
      `https://graph.facebook.com/${META_API_VERSION}/me/conversations` +
      `?folder=follow_up&fields=id,participants,messages.limit(30){from,message,created_time}` +
      `&access_token=${accessToken}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      // Try alternate: label parameter
      const url2 =
        `https://graph.facebook.com/${META_API_VERSION}/me/conversations` +
        `?label=follow_up&fields=id,participants,messages.limit(30){from,message,created_time}` +
        `&access_token=${accessToken}`;
      const res2 = await fetch(url2, { signal: AbortSignal.timeout(15_000) });
      if (!res2.ok) return [];
      const d2 = (await res2.json()) as { data?: MetaConversation[] };
      return d2.data ?? [];
    }
    const d = (await res.json()) as { data?: MetaConversation[] };
    return d.data ?? [];
  } catch (err: any) {
    console.log(`[LEARNING] fetchFollowUpConversations error: ${err?.message}`);
    return [];
  }
}

async function runHumanLearning(): Promise<void> {
  try {
    const settingsRows = await db.select().from(settingsTable).limit(1);
    const settings = settingsRows[0];
    if (!settings?.metaAccessToken || !settings?.facebookPageId) return;

    const { metaAccessToken: accessToken, facebookPageId: pageId } = settings;

    const conversations = await fetchFollowUpConversations(pageId, accessToken);
    if (conversations.length === 0) return;

    // Build conversation texts for analysis
    const convTexts: string[] = [];
    for (const conv of conversations.slice(0, 10)) {
      const msgs = (conv.messages?.data ?? [])
        .filter((m) => m.message?.trim())
        .sort((a, b) => new Date(a.created_time).getTime() - new Date(b.created_time).getTime());

      if (msgs.length < 4) continue; // Need at least 4 messages to extract patterns

      const text = msgs
        .map((m) => `${m.from?.id === pageId ? "خدمة الزبائن" : "زبون"}: ${m.message.trim()}`)
        .join("\n");
      convTexts.push(text);
    }

    if (convTexts.length === 0) return;

    const combinedText = convTexts.slice(0, 5).join("\n\n===محادثة جديدة===\n\n");

    // Use GPT to extract booking patterns and Iraqi phrases
    const extraction = await openai.chat.completions.create({
      model: settings?.aiModelText || "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: `أنت خبير في تحليل محادثات خدمة الزبائن. حلل هذه المحادثات من متجر سنبولة للملابس الأطفال واستخرج:

1. تسلسل تأكيد الطلبيات الناجح (كيف تطلب العنوان والهاتف بأسلوب لطيف)
2. العبارات العراقية المستخدمة في خدمة الزبائن (مثل: عيني، تدللين، بإذن الله)
3. كيفية الرد على أسئلة الأسعار والمقاسات بشكل طبيعي
4. طريقة إغلاق المحادثة وتأكيد الطلبية

المحادثات:
${combinedText}

أخرج النتائج كقائمة نقاط (5-10 نقاط) باللغة العربية. كل نقطة يجب أن تكون تعليمة عملية قصيرة للبوت.
مثال: "عند طلب رقم الهاتف: قولي 'عيني ممكن رقمك احتاجه للتوصيل؟'"
ابدأ كل نقطة بـ "•"`,
        },
      ],
      max_completion_tokens: 600,
      temperature: 0.3,
    });

    const rawOutput = extraction.choices[0]?.message?.content?.trim() || "";
    if (!rawOutput) return;

    // Parse bullet points into individual training notes
    const bullets = rawOutput
      .split("\n")
      .map((line) => line.replace(/^[•\-\*]\s*/, "").trim())
      .filter((line) => line.length > 15);

    let added = 0;
    for (const note of bullets) {
      // Skip if already in our dedup set or already in DB
      const key = note.slice(0, 50);
      if (lastLearnedNotes.has(key)) continue;

      // Check if similar note already in DB
      const existing = await db
        .select()
        .from(botTrainingNotesTable)
        .where(ilike(botTrainingNotesTable.note, `%${note.slice(0, 30)}%`))
        .limit(1);
      if (existing.length > 0) continue;

      await db.insert(botTrainingNotesTable).values({
        note: `[مُتَعَلَّم تلقائياً] ${note}`,
        active: true,
      });

      lastLearnedNotes.add(key);
      added++;
    }

    console.log(`[LEARNING] Extracted ${bullets.length} patterns, added ${added} new training notes`);
  } catch (err: any) {
    console.log(`[LEARNING] Error: ${err?.message}`);
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

export function startInboxWorker(): void {
  console.log("[INBOX_WORKER] Started — inbox scan every 90s");

  // Inbox scan every 90 seconds (first run after 45s)
  // Auto-learning (runHumanLearning) is permanently disabled
  setTimeout(() => runInboxScan().catch(() => {}), 45_000);
  setInterval(() => runInboxScan().catch(() => {}), WORKER_INTERVAL_MS);
}
