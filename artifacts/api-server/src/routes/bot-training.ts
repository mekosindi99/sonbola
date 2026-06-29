import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db/schema";
import { sql } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();

// GPT-4o vision pricing (per 1K tokens)
const GPT4O_INPUT_PRICE  = 0.00250; // $2.50 per 1M
const GPT4O_OUTPUT_PRICE = 0.01000; // $10.00 per 1M
// Estimated tokens per training image analysis
const TRAIN_INPUT_TOKENS  = 2400; // system prompt (longer) + high-detail image
const TRAIN_OUTPUT_TOKENS =  900; // JSON algorithms response (longer than Q&A)

function calcTrainCost(inputTk: number, outputTk: number): number {
  return (inputTk / 1000) * GPT4O_INPUT_PRICE + (outputTk / 1000) * GPT4O_OUTPUT_PRICE;
}

const COST_PER_IMAGE = calcTrainCost(TRAIN_INPUT_TOKENS, TRAIN_OUTPUT_TOKENS);

const SYSTEM_PROMPT = `أنت خبير تحليل محادثات لمتجر ملابس أطفال عراقي اسمه "سنبلة" (sonbola.shop).
مهمتك: تحليل صورة المحادثة واستخراج **خوارزميات وقواعد رد** — يعني المنطق والقرارات التي يجب أن يتبعها البوت، مو مجرد نسخ ما قيل.

نوع المخرجات المطلوبة — خوارزميات ذكية بصيغة قواعد قرار وخطوات:

أنواع الخوارزميات التي تستخرجها:
1. **إذا/عندما**: "إذا طلب الزبون [موقف] → [ماذا يفعل البوت خطوة بخطوة]"
2. **تسلسل الحجز**: "عند رغبة الزبون في الحجز → اجمع: [بيانات] ثم [بيانات] ثم [بيانات]"
3. **قاعدة رد**: "عند سؤال الزبون عن [موضوع] → رد بـ[نوع الرد] ولا تذكر [استثناء]"
4. **معالجة موقف**: "إذا رفض الزبون [شيء] → [الخيار البديل الذي يقترحه البوت]"
5. **تحذير أو قيد**: "لا تتجاوز [حد] قبل [شرط]"

قواعد مهمة:
- استخرج المنطق والقرار، مو الكلام الحرفي
- كل خوارزمية تكون واضحة وقابلة للتطبيق مباشرة
- ركز على التسلسل والشروط وليس على النص
- استخرج من 3 إلى 8 خوارزميات من كل صورة

أعد النتيجة بصيغة JSON فقط:
{
  "notes": [
    "إذا طلب الزبون الحجز → اسأل أولاً عن المحافظة ثم العنوان ثم رقم الهاتف ثم أكد الطلب",
    "عندما يسأل الزبون عن التوصيل → أعطِه الوقت المتوقع أولاً قبل السعر",
    "إذا سأل عن الإرجاع → وضح أن الإرجاع عبر المندوب فقط ولا يتم نقداً"
  ]
}

لا تضف أي نص خارج JSON.`;

/* ── Analyze a single image ─────────────────────────────────────────────── */
router.post("/bot-training/analyze", async (req, res) => {
  try {
    const { imageBase64 } = req.body as { imageBase64?: string };
    if (!imageBase64) {
      return res.status(400).json({ error: "imageBase64 مطلوب" });
    }

    const imageUrl = imageBase64.startsWith("data:")
      ? imageBase64
      : `data:image/jpeg;base64,${imageBase64}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: SYSTEM_PROMPT },
            { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
          ],
        },
      ],
    });

    const text = response.choices[0]?.message?.content?.trim() || "{}";
    let parsed: { notes: string[] } = { notes: [] };
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    } catch {
      parsed = { notes: [text] };
    }

    const notes = parsed.notes || [];

    // Log this analysis to bot_training_logs
    try {
      const usedInput  = response.usage?.prompt_tokens     ?? TRAIN_INPUT_TOKENS;
      const usedOutput = response.usage?.completion_tokens ?? TRAIN_OUTPUT_TOKENS;
      const costUsd    = calcTrainCost(usedInput, usedOutput);
      await db.execute(sql`
        INSERT INTO bot_training_logs (images_analyzed, notes_extracted, input_tokens, output_tokens, cost_usd)
        VALUES (1, ${notes.length}, ${usedInput}, ${usedOutput}, ${costUsd})
      `);
    } catch (logErr: any) {
      console.warn("[BOT_TRAINING] log insert failed:", logErr?.message);
    }

    return res.json({ notes });
  } catch (err: any) {
    console.error("[BOT_TRAINING] analyze error:", err?.message);
    return res.status(500).json({ error: err?.message || "خطأ في التحليل" });
  }
});

const TRAINING_SECTION_HEADER = "## خوارزميات التدريب المدمجة";

/* ── Merge new algorithms with existing ones using GPT ── */
async function mergeAlgorithms(existing: string[], incoming: string[]): Promise<string[]> {
  if (existing.length === 0) return incoming;

  const existingText = existing.map((a, i) => `${i + 1}. ${a}`).join("\n");
  const incomingText = incoming.map((a, i) => `${i + 1}. ${a}`).join("\n");

  const mergePrompt = `أنت مساعد ذكي لمتجر ملابس أطفال عراقي "سنبلة".
لديك قائمة خوارزميات رد وحجز موجودة مسبقاً، وقائمة جديدة مستخرجة من صور محادثات.
مهمتك: دمج القائمتين بذكاء وفق هذه القواعد:
- إذا وجدت خوارزميتين تتحدثان عن نفس الموضوع → ادمجهما في خوارزمية واحدة أوضح وأشمل
- إذا كانت الخوارزمية الجديدة تضيف معلومة إضافية على قديمة → أضف الزيادة للقديمة
- إذا كانت الخوارزمية مختلفة تماماً → أضفها كما هي
- حافظ على صيغة "إذا/عندما/عند → خطوات" في كل خوارزمية
- لا تحذف أي معلومة مفيدة
- الناتج: قائمة نظيفة مدموجة بدون تكرار

الخوارزميات الموجودة:
${existingText}

الخوارزميات الجديدة:
${incomingText}

أعد النتيجة بصيغة JSON فقط:
{"merged": ["خوارزمية 1", "خوارزمية 2", ...]}
لا تضف أي نص خارج JSON.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 2000,
    messages: [{ role: "user", content: mergePrompt }],
  });

  const text = response.choices[0]?.message?.content?.trim() || "{}";
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed.merged)) return parsed.merged;
    }
  } catch { /* fallback */ }

  // If GPT fails, just combine both lists
  return [...existing, ...incoming];
}

/* ── Save approved notes to generalQaText ───────────────────────────────── */
router.post("/bot-training/save", async (req, res) => {
  try {
    const { notes } = req.body as { notes?: string[] };
    if (!notes || !Array.isArray(notes) || notes.length === 0) {
      return res.status(400).json({ error: "لا توجد خوارزميات للحفظ" });
    }

    const rows = await db.select().from(settingsTable).limit(1);
    const settings = rows[0];
    if (!settings) return res.status(404).json({ error: "الإعدادات غير موجودة" });

    const existingQa = settings.generalQaText || "";

    // Extract existing training algorithms section
    const sectionRegex = new RegExp(
      `${TRAINING_SECTION_HEADER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?(?=\\n## |$)`,
    );
    const sectionMatch = existingQa.match(sectionRegex);

    let existingAlgorithms: string[] = [];
    if (sectionMatch) {
      // Parse existing algorithms from the section (each line starting with a number or "-")
      const sectionContent = sectionMatch[0]
        .replace(TRAINING_SECTION_HEADER, "")
        .trim();
      existingAlgorithms = sectionContent
        .split("\n")
        .map(l => l.replace(/^[\d\-\•\*]+[\.\)]\s*/, "").trim())
        .filter(l => l.length > 10);
    }

    // Merge with GPT
    console.log(`[BOT_TRAINING] Merging ${existingAlgorithms.length} existing + ${notes.length} new algorithms...`);
    const merged = await mergeAlgorithms(existingAlgorithms, notes.map(n => n.trim()));

    const timestamp = new Date().toLocaleDateString("ar-IQ", {
      year: "numeric", month: "long", day: "numeric",
    });
    const newSection = `${TRAINING_SECTION_HEADER}\nآخر تحديث: ${timestamp} — ${merged.length} خوارزمية\n\n${merged.map((a, i) => `${i + 1}. ${a}`).join("\n\n")}`;

    // Replace old section or append new one
    let updatedQa: string;
    if (sectionMatch) {
      updatedQa = existingQa.replace(sectionRegex, newSection);
    } else {
      updatedQa = existingQa + "\n\n" + newSection;
    }

    await db.update(settingsTable).set({ generalQaText: updatedQa });

    const addedCount = merged.length - existingAlgorithms.length;
    console.log(`[BOT_TRAINING] Saved. Total: ${merged.length}, Added: ${addedCount}`);

    return res.json({
      success: true,
      totalCount: merged.length,
      addedCount: Math.max(0, addedCount),
      mergedCount: notes.length - Math.max(0, addedCount),
    });
  } catch (err: any) {
    console.error("[BOT_TRAINING] save error:", err?.message);
    return res.status(500).json({ error: err?.message || "خطأ في الحفظ" });
  }
});

/* ── Learn from real conversations ─────────────────────────────────────── */
router.post("/bot-training/learn", async (req, res) => {
  try {
    const { source = "bookings", limit = 20 } = req.body as {
      source?: "bookings" | "all";
      limit?: number;
    };

    const safeLimit = Math.min(Math.max(Number(limit) || 20, 5), 200);

    // 1. Fetch already-analyzed conversation IDs to exclude them
    const analyzedRows = await db.execute(sql`
      SELECT conversation_id FROM bot_training_conv_history
    `);
    const analyzedIds = new Set(
      (analyzedRows.rows as Array<{ conversation_id: string }>).map(r => r.conversation_id)
    );

    // 2. Fetch conversations based on source filter, skipping already analyzed
    const convRows = await db.execute(
      source === "bookings"
        ? sql`SELECT id, sender_name, platform FROM chat_conversations
              WHERE has_booking = true
              ORDER BY last_message_at DESC LIMIT ${safeLimit * 3}`
        : sql`SELECT id, sender_name, platform FROM chat_conversations
              ORDER BY last_message_at DESC LIMIT ${safeLimit * 3}`
    );
    const allConvs = convRows.rows as Array<{ id: string; sender_name: string; platform: string }>;

    // Filter out already-analyzed and limit to requested count
    const conversations = allConvs
      .filter(c => !analyzedIds.has(c.id))
      .slice(0, safeLimit);

    const skippedCount = allConvs.length - (allConvs.length - analyzedIds.size < 0 ? 0 : allConvs.filter(c => analyzedIds.has(c.id)).length);

    if (conversations.length === 0) {
      return res.json({
        algorithms: [], compared: [], conversationsAnalyzed: 0,
        skippedAlreadyAnalyzed: analyzedIds.size,
        message: analyzedIds.size > 0 ? "كل المحادثات المتاحة تم تحليلها مسبقاً" : "لا توجد محادثات للتحليل",
      });
    }

    // 2. Fetch messages for each conversation (batch)
    const convIds = conversations.map(c => `'${c.id}'`).join(",");
    const msgRows = await db.execute(sql`
      SELECT conversation_id, role, content
      FROM chat_messages
      WHERE conversation_id IN (${sql.raw(convIds)})
        AND content IS NOT NULL AND LENGTH(content) > 1
      ORDER BY conversation_id, created_at ASC
    `);
    const messages = msgRows.rows as Array<{ conversation_id: string; role: string; content: string }>;

    // 3. Group messages by conversation and build transcripts
    const msgMap = new Map<string, string[]>();
    for (const m of messages) {
      const label = m.role === "user" ? "الزبون" : "البوت";
      const txt = `${label}: ${(m.content || "").slice(0, 300)}`;
      if (!msgMap.has(m.conversation_id)) msgMap.set(m.conversation_id, []);
      msgMap.get(m.conversation_id)!.push(txt);
    }

    const transcripts = conversations
      .filter(c => (msgMap.get(c.id)?.length ?? 0) >= 3)
      .map((c, i) => `=== محادثة ${i + 1} ===\n${msgMap.get(c.id)!.join("\n")}`);

    if (transcripts.length === 0) {
      return res.json({ algorithms: [], compared: [], conversationsAnalyzed: 0 });
    }

    // 4. Send to GPT for algorithm extraction (truncate to ~8000 chars)
    const combinedText = transcripts.join("\n\n").slice(0, 10000);

    const extractResp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 2500,
      messages: [{
        role: "user",
        content: `أنت خبير تحليل محادثات لمتجر ملابس أطفال عراقي "سنبلة" (sonbola.shop).
لديك ${transcripts.length} محادثة حقيقية بين البوت والزبائن.

مهمتك: تحليل هذه المحادثات واستخراج خوارزميات رد وقواعد قرار يجب أن يتبعها البوت.
- ركز على الأنماط المتكررة عبر المحادثات
- استخرج الخطوات التسلسلية والشروط
- صيغة: "إذا/عندما/عند [حالة] → [خطوات]"
- استخرج 6-15 خوارزمية شاملة

المحادثات:
${combinedText}

أعد النتيجة JSON فقط:
{"algorithms": ["خوارزمية 1", "خوارزمية 2", ...]}
لا تضف أي نص خارج JSON.`,
      }],
    });

    const extractText = extractResp.choices[0]?.message?.content?.trim() || "{}";
    let algorithms: string[] = [];
    try {
      const m = extractText.match(/\{[\s\S]*\}/);
      if (m) {
        const p = JSON.parse(m[0]);
        if (Array.isArray(p.algorithms)) algorithms = p.algorithms;
      }
    } catch { /* ignore */ }

    if (algorithms.length === 0) {
      return res.json({ algorithms: [], compared: [], conversationsAnalyzed: transcripts.length });
    }

    // 5. Compare with existing knowledge base
    const settingsRows = await db.select().from(settingsTable).limit(1);
    const existingQa = settingsRows[0]?.generalQaText || "";
    const existingSnippet = existingQa.slice(0, 4000);

    let compared: Array<{ algorithm: string; status: "new" | "enhances" | "duplicate" }> = [];

    if (existingSnippet.length > 50) {
      const compareResp = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 2000,
        messages: [{
          role: "user",
          content: `قارن كل خوارزمية من القائمة الجديدة بالمعرفة الموجودة وصنّف كل منها:
- "new": لا يوجد ما يشابهها في المعرفة الموجودة
- "enhances": تشابه موضوعها لكنها تضيف تفصيلاً أو حالة جديدة
- "duplicate": معناها موجود بالكامل

الخوارزميات الجديدة:
${algorithms.map((a, i) => `${i + 1}. ${a}`).join("\n")}

المعرفة الموجودة (مقتطف):
${existingSnippet}

أعد JSON فقط:
{"compared": [{"algorithm": "...", "status": "new"}, ...]}`,
        }],
      });

      const cmpText = compareResp.choices[0]?.message?.content?.trim() || "{}";
      try {
        const m = cmpText.match(/\{[\s\S]*\}/);
        if (m) {
          const p = JSON.parse(m[0]);
          if (Array.isArray(p.compared)) compared = p.compared;
        }
      } catch { /* ignore */ }
    }

    // If comparison failed, mark all as new
    if (compared.length !== algorithms.length) {
      compared = algorithms.map(a => ({ algorithm: a, status: "new" as const }));
    }

    // Save analyzed conversations to history (one record per conversation)
    const algorithmsPerConv = Math.ceil(algorithms.length / conversations.length);
    const analyzedConversations: Array<{ id: string; name: string; platform: string; algorithmsExtracted: number }> = [];
    try {
      for (const conv of conversations) {
        if (!msgMap.has(conv.id)) continue;
        const convAlgCount = Math.ceil(algorithmsPerConv);
        await db.execute(sql`
          INSERT INTO bot_training_conv_history (conversation_id, sender_name, platform, algorithms_extracted)
          VALUES (${conv.id}, ${conv.sender_name || 'غير معروف'}, ${conv.platform || 'unknown'}, ${convAlgCount})
          ON CONFLICT (conversation_id) DO UPDATE SET algorithms_extracted = EXCLUDED.algorithms_extracted, analyzed_at = NOW()
        `);
        analyzedConversations.push({
          id: conv.id,
          name: conv.sender_name || 'غير معروف',
          platform: conv.platform || 'unknown',
          algorithmsExtracted: convAlgCount,
        });
      }
    } catch (saveErr: any) {
      console.warn("[BOT_TRAINING] conv history save failed:", saveErr?.message);
    }

    // Log to bot_training_logs
    try {
      await db.execute(sql`
        INSERT INTO bot_training_logs (images_analyzed, notes_extracted, input_tokens, output_tokens, cost_usd)
        VALUES (${transcripts.length}, ${algorithms.length},
                ${extractResp.usage?.prompt_tokens ?? 0},
                ${extractResp.usage?.completion_tokens ?? 0},
                ${calcTrainCost(extractResp.usage?.prompt_tokens ?? 0, extractResp.usage?.completion_tokens ?? 0)})
      `);
    } catch { /* ignore */ }

    return res.json({
      algorithms,
      compared,
      conversationsAnalyzed: transcripts.length,
      skippedAlreadyAnalyzed: analyzedIds.size,
      analyzedConversations,
    });
  } catch (err: any) {
    console.error("[BOT_TRAINING] learn error:", err?.message);
    return res.status(500).json({ error: err?.message || "خطأ في التحليل" });
  }
});

/* ── Analyzed conversations stats ──────────────────────────────────────── */
router.get("/bot-training/conv-history", async (_req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT
        conversation_id,
        sender_name,
        platform,
        algorithms_extracted,
        analyzed_at
      FROM bot_training_conv_history
      ORDER BY analyzed_at DESC
    `);
    const history = rows.rows as Array<{
      conversation_id: string;
      sender_name: string;
      platform: string;
      algorithms_extracted: number;
      analyzed_at: string;
    }>;

    const totalAlgorithms = history.reduce((s, r) => s + Number(r.algorithms_extracted), 0);

    return res.json({
      total: history.length,
      totalAlgorithms,
      history: history.map(r => ({
        conversationId: r.conversation_id,
        senderName: r.sender_name,
        platform: r.platform,
        algorithmsExtracted: Number(r.algorithms_extracted),
        analyzedAt: r.analyzed_at,
      })),
    });
  } catch (err: any) {
    console.error("[BOT_TRAINING] conv-history error:", err?.message);
    return res.status(500).json({ error: err?.message || "خطأ في جلب السجل" });
  }
});

/* ── Reset conv history (allow re-analysis) ─────────────────────────────── */
router.delete("/bot-training/conv-history", async (_req, res) => {
  try {
    await db.execute(sql`DELETE FROM bot_training_conv_history`);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message });
  }
});

/* ── Training usage stats ───────────────────────────────────────────────── */
router.get("/bot-training/usage", async (_req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [allRows, monthRows] = await Promise.all([
      db.execute(sql`
        SELECT
          COALESCE(SUM(images_analyzed), 0) AS images,
          COALESCE(SUM(notes_extracted), 0) AS notes,
          COALESCE(SUM(input_tokens), 0)   AS input_tk,
          COALESCE(SUM(output_tokens), 0)  AS output_tk,
          COALESCE(SUM(cost_usd), 0)       AS cost
        FROM bot_training_logs
      `),
      db.execute(sql`
        SELECT
          COALESCE(SUM(images_analyzed), 0) AS images,
          COALESCE(SUM(notes_extracted), 0) AS notes,
          COALESCE(SUM(input_tokens), 0)   AS input_tk,
          COALESCE(SUM(output_tokens), 0)  AS output_tk,
          COALESCE(SUM(cost_usd), 0)       AS cost
        FROM bot_training_logs
        WHERE created_at >= ${startOfMonth}
      `),
    ]);

    const a = (allRows.rows as any[])[0] ?? {};
    const m = (monthRows.rows as any[])[0] ?? {};

    return res.json({
      allTime: {
        imagesAnalyzed: Number(a.images ?? 0),
        notesExtracted: Number(a.notes  ?? 0),
        inputTokens:    Number(a.input_tk  ?? 0),
        outputTokens:   Number(a.output_tk ?? 0),
        costUsd:        +Number(a.cost ?? 0).toFixed(4),
      },
      thisMonth: {
        imagesAnalyzed: Number(m.images ?? 0),
        notesExtracted: Number(m.notes  ?? 0),
        inputTokens:    Number(m.input_tk  ?? 0),
        outputTokens:   Number(m.output_tk ?? 0),
        costUsd:        +Number(m.cost ?? 0).toFixed(4),
      },
      perImage: {
        estimatedCostUsd: +COST_PER_IMAGE.toFixed(5),
        inputTokens:  TRAIN_INPUT_TOKENS,
        outputTokens: TRAIN_OUTPUT_TOKENS,
        model: "gpt-4o",
      },
    });
  } catch (err: any) {
    console.error("[BOT_TRAINING] usage error:", err?.message);
    return res.status(500).json({ error: err?.message || "خطأ في الاستهلاك" });
  }
});

export default router;
