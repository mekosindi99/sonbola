import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  settingsTable,
  inventoryTable,
  botTrainingNotesTable,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();

// In-memory session history for the test simulator
const testSessions: Record<string, Array<{ role: string; content: any }>> = {};
// Track which sessions already have inventory images injected
const inventoryInjected = new Set<string>();

// ─── Helpers ───────────────────────────────────────────────────────────────

function detectReturnExchange(text: string): boolean {
  const kw = ["return", "exchange", "استبدال", "إرجاع", "ارجاع", "استبدل", "ارجع"];
  return kw.some(k => text.toLowerCase().includes(k));
}

function parseSendProductsTag(reply: string): { cleanReply: string; productIds: string[] | null } {
  const match = reply.match(/\[SEND_PRODUCTS:([^\]]+)\]/i);
  if (!match) return { cleanReply: reply, productIds: null };
  const cleanReply = reply.replace(/\[SEND_PRODUCTS:[^\]]+\]/gi, "").trim();
  const ids = match[1].split(",").map(s => s.trim()).filter(Boolean);
  return { cleanReply, productIds: ids.length > 0 ? ids : null };
}

function parseSavedReplyTag(reply: string): { isSavedReply: boolean; cleanReply: string } {
  const tagRe = /^\[SAVED_REPLY\]\s*/i;
  if (tagRe.test(reply)) return { isSavedReply: true, cleanReply: reply.replace(tagRe, "").trim() };
  return { isSavedReply: false, cleanReply: reply };
}

/**
 * Extract the customer's requested age from their message.
 * Returns age in years (fractions supported, e.g. 0.5 = 6 months).
 */
function extractCustomerAge(text: string): number | null {
  // "سنتين" = 2 years
  if (/سنتين/.test(text)) return 2;
  // "سنة واحدة" / "سنه وحدة" = 1 year
  if (/سنة?\s*(واحدة?|وحدة?)/.test(text)) return 1;

  // months → convert to fractional years
  const monthRe = /(\d+(?:\.\d+)?)\s*(?:شهر|شهور|أشهر|شهرًا|شهراً|month|months)/i;
  const mMonth = text.match(monthRe);
  if (mMonth) return parseFloat(mMonth[1]) / 12;

  // years (explicit keyword)
  const yearRe = /(\d+(?:\.\d+)?)\s*(?:سنة|سنه|سنوات|سنين|year|years)/i;
  const mYear = text.match(yearRe);
  if (mYear) return parseFloat(mYear[1]);

  // "عمره/عمرها/عمر X" or "ابني/بنتي X"
  const contextRe = /(?:عمر[هها]?|عمرهم|aged?)\s*(\d+(?:\.\d+)?)/i;
  const mCtx = text.match(contextRe);
  if (mCtx) return parseFloat(mCtx[1]);

  return null;
}

/**
 * Parse a stored age-range value string into decimal years.
 * Handles: "1", "6", "0.5", "6شهر", "6 شهر", "6months", "6m"
 */
function parseStoredAgeValue(val: string | number): number {
  const s = String(val).trim().toLowerCase();
  if (/شهر|month|^\d+m$/.test(s)) {
    const n = parseFloat(s.replace(/[^0-9.]/g, ""));
    return isNaN(n) ? 0 : n / 12;
  }
  const n = parseFloat(s.replace(/[^0-9.]/g, ""));
  return isNaN(n) ? 0 : n;
}

type Product = {
  productId: string;
  category: string | null;
  gender: string | null;
  ageMin: number | null;
  ageMax: number | null;
  ageRanges: string | null;
  price: number | null;
  stock: number | null;
  publicImageUrl: string | null;
  imageUrl: string | null;
  available: boolean | null;
};

/**
 * Returns true if the customer's age (in years) falls within ANY of the
 * product's stored age ranges.
 */
function productMatchesAge(product: Product, customerAgeYears: number): boolean {
  try {
    const ranges = product.ageRanges ? JSON.parse(product.ageRanges) : null;
    if (Array.isArray(ranges) && ranges.length > 0) {
      for (const r of ranges) {
        const minY = parseStoredAgeValue(r.min ?? 0);
        const maxY = parseStoredAgeValue(r.max ?? 99);
        if (customerAgeYears >= minY && customerAgeYears <= maxY) return true;
      }
      return false;
    }
  } catch {}
  // Fallback to flat ageMin / ageMax columns
  const minY = parseStoredAgeValue(product.ageMin ?? 0);
  const maxY = parseStoredAgeValue(product.ageMax ?? 99);
  return customerAgeYears >= minY && customerAgeYears <= maxY;
}

/** Convert raw price number to "X الف" Arabic format */
function formatPrice(price: number | string | null): string {
  if (price === null || price === undefined) return "غير محدد";
  const n = Number(price);
  if (isNaN(n)) return String(price);
  if (n < 1000) return `${n}`;
  const thousands = n / 1000;
  return Number.isInteger(thousands) ? `${thousands} الف` : `${thousands.toFixed(1)} الف`;
}

/** Build readable age-range label for a product */
function buildAgeLabel(product: Product): string {
  try {
    const ranges = product.ageRanges ? JSON.parse(product.ageRanges) : null;
    if (Array.isArray(ranges) && ranges.length > 0) {
      return ranges.map((r: any) => `${r.min} ← ${r.max}`).join(" | ");
    }
  } catch {}
  return `${product.ageMin} ← ${product.ageMax}`;
}


// ─── Route ─────────────────────────────────────────────────────────────────

router.post("/bot-test", async (req, res) => {
  try {
    const {
      message,
      platform = "instagram",
      sessionId = "default",
      imageBase64,
      history: clientHistory,
    } = req.body as {
      message: string;
      platform?: string;
      sessionId?: string;
      imageBase64?: string;
      history?: Array<{ role: "user" | "assistant"; content: string }>;
    };

    if (!message?.trim() && !imageBase64) {
      return res.status(400).json({ error: "Message or image is required" });
    }

    // ── Load settings ────────────────────────────────────────────────
    const settingsRows = await db.select().from(settingsTable).limit(1);
    const settings = settingsRows[0];
    if (!settings) return res.json({ reply: "Settings not configured yet.", type: "text" });

    // ── Stage 0: Return / exchange escalation ────────────────────────
    if (detectReturnExchange(message)) {
      const replyMsg = "تم تحويل محادثتك إلى الإدارة للمساعدة في طلب الاستبدال/الإرجاع. سنتواصل معك قريباً.";
      testSessions[sessionId] = [...(testSessions[sessionId] ?? []),
        { role: "user", content: message }, { role: "assistant", content: replyMsg }];
      return res.json({ reply: replyMsg, type: "escalation" });
    }

    // ── Load inventory ────────────────────────────────────────────────
    const rawProducts = await db
      .select()
      .from(inventoryTable)
      .where(eq(inventoryTable.available, true));
    const products: Product[] = rawProducts.map(p => ({
      ...p,
      price: Number(p.price),
      discountPrice: p.discountPrice != null ? Number(p.discountPrice) : null,
    }));

    // ── SERVER-SIDE AGE FILTER ────────────────────────────────────────
    const customerAge = extractCustomerAge(message);
    let ageFilterSection = "";

    if (customerAge !== null) {
      const matched = products.filter(p => productMatchesAge(p, customerAge));
      const notMatched = products.filter(p => !productMatchesAge(p, customerAge));

      const displayAge = customerAge < 1
        ? `${Math.round(customerAge * 12)} شهر`
        : `${customerAge} سنة`;

      if (matched.length > 0) {
        const matchedList = matched
          .map(p =>
            `  ┌ كود: ${p.productId}\n` +
            `  │ أعمار: ${buildAgeLabel(p)}\n` +
            `  │ سعر: ${formatPrice(p.price)}\n` +
            `  └ مخزون: ${p.stock} قطعة${p.publicImageUrl ? " ✓صورة" : ""}`
          )
          .join("\n");
        ageFilterSection = `

╔══ فلترة العمر التلقائية ══╗
║ طلب العمر: ${displayAge}
║ نتيجة: ${matched.length} موديل مطابق — الإرسال الوحيد المسموح به
╚══════════════════════════╝
${matchedList}

⚠️ الأكواد المسموح إرسالها فقط: ${matched.map(p => p.productId).join(" , ")}
⛔ ممنوع إرسال: ${notMatched.map(p => p.productId).join(" , ") || "لا يوجد"}
الأمر للإرسال: [SEND_PRODUCTS:${matched.map(p => p.productId).join(",")}]`;
      } else {
        // No exact match — find nearest ranges
        const nearest = products
          .slice()
          .sort((a, b) => {
            const aMid = (parseStoredAgeValue(a.ageMin ?? 0) + parseStoredAgeValue(a.ageMax ?? 0)) / 2;
            const bMid = (parseStoredAgeValue(b.ageMin ?? 0) + parseStoredAgeValue(b.ageMax ?? 0)) / 2;
            return Math.abs(aMid - customerAge) - Math.abs(bMid - customerAge);
          })
          .slice(0, 4);

        ageFilterSection = `

╔══ فلترة العمر التلقائية ══╗
║ طلب العمر: ${displayAge}
║ نتيجة: لا يوجد موديل مطابق بالضبط
╚══════════════════════════╝
أقرب الموديلات المتاحة:
${nearest.map(p => `  • كود: ${p.productId} | أعمار: ${buildAgeLabel(p)} | سعر: ${formatPrice(p.price)}`).join("\n")}
اعتذر بأدب وأعرض هذه الأعمار البديلة أو: [SEND_PRODUCTS:${nearest.map(p => p.productId).join(",")}]`;
      }
    }

    // ── Build product context (all products for reference) ───────────
    const productContext = products.map((p, i) => {
      const pAny = p as any;
      let line =
        `[${String(i + 1).padStart(2, "0")}] كود: ${p.productId}\n` +
        `     فئة: ${p.category} | جنس: ${p.gender}\n` +
        `     أعمار: ${buildAgeLabel(p)}\n` +
        `     ألوان: ${pAny.colors || "غير محدد"}\n` +
        `     سعر: ${formatPrice(p.price)} | مخزون: ${p.stock} قطعة${p.publicImageUrl ? " ✓صورة" : ""}`;
      if (pAny.descriptionAr) line += `\n     ملاحظة: ${pAny.descriptionAr}`;
      return line;
    }).join("\n\n");

    // ── Training notes ────────────────────────────────────────────────
    const trainingNotes = await db
      .select()
      .from(botTrainingNotesTable)
      .where(eq(botTrainingNotesTable.active, true));
    const trainingContext = trainingNotes.length > 0
      ? `\n\n===ملاحظات التدريب الخاصة (أولوية عليا)===\n${trainingNotes.map((n, i) => `${i + 1}. ${n.note}`).join("\n")}\n===نهاية ملاحظات التدريب===`
      : "";

    const ageMax = settings.customAgeFilter || `${settings.ageFilterMin}-${settings.ageFilterMax}`;

    // ── System prompt ─────────────────────────────────────────────────
    const systemPrompt = `أنت مساعد مبيعات ذكي لمتجر ملابس أطفال عراقي.${trainingContext}

الفئات: صيف، شتاء، ربيع | الجنس: بنات، أولاد، اثنيناتهم.
فلترة العمر الافتراضية: ${ageMax} سنة. تحقق دائماً من المخزون قبل الاقتراح.
للحجز أطلب من الزبون:
1. رقم الهاتف
2. المحافظة
3. العنوان الكامل
المنصة الحالية: ${platform === "instagram" ? "انستقرام" : "فيسبوك"}.

⚠️ الفلترة العمرية — قاعدة صارمة: النظام يحسب تلقائياً أي منتجات تطابق عمر الزبون. استخدم قسم "نتيجة الفلترة التلقائية للعمر" أدناه إذا وُجد — لا تحاول احتساب النطاقات بنفسك.
⚠️ الايموجيات: لا تستخدم إيموجيات إطلاقاً. الاستثناء الوحيد: عند تأكيد استلام الطلبية.
⚠️ تنسيق الأسعار: "40 الف" فقط — بدون أصفار، بدون فاصلة، بدون رمز د.ع.
⚠️ قواعد مقارنة الصور — مهمة جداً:
1. صورة موديل من الزبون: حدد اللون الرئيسي في صورة الزبون أولاً → قارنه بألوان منتجاتنا → أجب بالسعر فقط.
2. إذا كان اللون مختلفاً عن كل منتجاتنا: قل للزبون أن هذا اللون غير متوفر واعرض أقرب لون متوفر.
3. "هل عندكم عمر X؟": استخدم قسم الفلترة التلقائية — إذا موجود "متوفر"، إذا غير موجود اعتذر.
4. "شنو عندج" / "ارسلي المتوفرين" / طلب عمر محدد: استخدم قسم الفلترة التلقائية وأرسل [SEND_PRODUCTS:كود1,كود2,...].
5. لا تذكر أكواداً أو أسعاراً في نص الرد عند إرسال صور المنتجات.
6. أجب بالقدر المطلوب فقط.

⚠️ قاعدة الأكواد — صارمة جداً:
- كل موديل له كود فريد مثل S356 أو S380 — هذا الكود هو الرقم الوحيد المقبول في [SEND_PRODUCTS:...]
- ممنوع اختراع كود أو تعديله — استخدم الكود كما هو من القائمة أدناه بالضبط
- قبل الإرسال تأكد: هل الكود موجود في قائمة المخزون؟ إذا لا → لا ترسله

قائمة المخزون الكاملة (${products.length} موديل):
${productContext || "لا توجد منتجات في المخزون حالياً."}${ageFilterSection}`;

    // ── Build message list ────────────────────────────────────────────
    // Prefer client-sent history (survives server restarts) over in-memory sessions
    const history: Array<{ role: "user" | "assistant"; content: any }> =
      (clientHistory && clientHistory.length > 0)
        ? (clientHistory as Array<{ role: "user" | "assistant"; content: any }>)
        : ((testSessions[sessionId] ?? []) as Array<{ role: "user" | "assistant"; content: any }>);
    const productsWithImages = products.filter(p => p.imageUrl);

    let userContent: any;
    if (imageBase64) {
      userContent = [
        {
          type: "text",
          text: message?.trim() || "الزبون أرسل صورة — قارنها بمخزوننا وحدد الموديل المطابق أو الأقرب، ثم رد فوراً بالسعر.",
        },
        { type: "image_url", image_url: { url: imageBase64, detail: "high" } },
      ];
    } else {
      userContent = message;
    }

    const messages: any[] = [
      { role: "system", content: systemPrompt },
      ...history.slice(-14),
    ];

    // Inject inventory images once per session
    if (productsWithImages.length > 0 && !inventoryInjected.has(sessionId)) {
      const visionContent: any[] = [
        {
          type: "text",
          text:
            `هذه صور منتجاتنا المتاحة في المخزون (${productsWithImages.length} منتج).\n` +
            `مهمتك: احفظ كل صورة مع كودها وألوانها — ستحتاج هذه المعلومات عند مقارنة صور الزبائن.\n` +
            `⚠️ عند مقارنة صورة زبون بمخزوننا: حدد اللون الرئيسي في صورة الزبون أولاً، ثم قارنه بألوان منتجاتنا.`,
        },
      ];
      for (const p of productsWithImages) {
        const pAny = p as any;
        visionContent.push({
          type: "text",
          text: `▪ كود: ${p.productId} | ${p.category} | ${p.gender} | أعمار: ${buildAgeLabel(p)} | ألوان: ${pAny.colors || "انظر الصورة"} | سعر: ${formatPrice(p.price)}`,
        });
        visionContent.push({ type: "image_url", image_url: { url: (p.publicImageUrl || p.imageUrl)!, detail: "auto" } });
      }
      messages.splice(1, 0, { role: "user", content: visionContent });
      messages.splice(2, 0, {
        role: "assistant",
        content: "تم. حفظت جميع صور وألوان المنتجات. عند مقارنة صورة من الزبون سأحدد اللون أولاً ثم أقارنه بمخزوننا.",
      });
      inventoryInjected.add(sessionId);
    }

    messages.push({ role: "user", content: userContent });

    // ── Call GPT-4o ───────────────────────────────────────────────────
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      max_completion_tokens: 700,
    });

    const rawReply = completion.choices[0]?.message?.content ?? "";

    // ── Parse tags ────────────────────────────────────────────────────
    const { isSavedReply, cleanReply: afterTag } = parseSavedReplyTag(rawReply);
    const { cleanReply: reply, productIds } = parseSendProductsTag(afterTag);

    const replyType = isSavedReply ? "saved_reply" : "ai";

    // ── Save to session ───────────────────────────────────────────────
    const userEntry = {
      role: "user",
      content: imageBase64 ? `[صورة] ${message || ""}`.trim() : message,
    };
    testSessions[sessionId] = [...history, userEntry, { role: "assistant", content: reply }];
    if (testSessions[sessionId].length > 20) {
      testSessions[sessionId] = testSessions[sessionId].slice(-20);
    }

    // ── Resolve product images ────────────────────────────────────────
    let suggestedProducts: Array<{
      productId: string;
      imageUrl: string | null;
      publicImageUrl: string | null;
      price: number | null;
    }> = [];
    if (productIds && productIds.length > 0) {
      const all = await db.select().from(inventoryTable);
      const matched = all.filter(p => productIds.includes(p.productId) && (p.stock ?? 0) > 0);
      suggestedProducts = matched.map(p => ({
        productId: p.productId,
        imageUrl: p.imageUrl ?? null,
        publicImageUrl: p.publicImageUrl ?? null,
        price: p.price != null ? Number(p.price) : null,
      }));
    }

    return res.json({ reply, type: replyType, suggestedProducts });
  } catch (err) {
    console.error("Bot test error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/bot-test/:sessionId", (req, res) => {
  delete testSessions[req.params.sessionId];
  inventoryInjected.delete(req.params.sessionId);
  res.json({ success: true });
});

export default router;
