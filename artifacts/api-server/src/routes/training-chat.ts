import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  settingsTable,
  inventoryTable,
  botTrainingNotesTable,
  trainingMessagesTable,
} from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();

function formatPrice(p: number | null | undefined): string {
  if (!p) return "غير محدد";
  return `${Math.round(p / 1000)} الف`;
}

function buildAgeLabel(p: any): string {
  const parts: string[] = [];
  if (p.ageMinMonths != null && p.ageMaxMonths != null) {
    const minY = p.ageMinMonths / 12;
    const maxY = p.ageMaxMonths / 12;
    parts.push(`${minY}-${maxY} سنة`);
  }
  return parts.join(", ") || "غير محدد";
}

router.get("/training-chat/messages", async (_req, res) => {
  try {
    const messages = await db
      .select()
      .from(trainingMessagesTable)
      .orderBy(trainingMessagesTable.createdAt);
    res.json(messages);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/training-chat/messages", async (_req, res) => {
  try {
    await db.delete(trainingMessagesTable);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/training-chat/send", async (req, res) => {
  try {
    const { message, imageBase64 } = req.body as {
      message?: string;
      imageBase64?: string;
    };

    if (!message?.trim() && !imageBase64) {
      return res.status(400).json({ error: "message or imageBase64 required" });
    }

    const settingsRows = await db.select().from(settingsTable).limit(1);
    const settings = settingsRows[0];

    const products = await db.select().from(inventoryTable);

    const trainingNotes = await db
      .select()
      .from(botTrainingNotesTable)
      .where(eq(botTrainingNotesTable.active, true));

    const existingMessages = await db
      .select()
      .from(trainingMessagesTable)
      .orderBy(trainingMessagesTable.createdAt);

    const productContext = products
      .map((p: any, i: number) => {
        let line =
          `[${String(i + 1).padStart(2, "0")}] كود: ${p.productId}\n` +
          `     فئة: ${p.category} | جنس: ${p.gender}\n` +
          `     أعمار: ${buildAgeLabel(p)}\n` +
          `     ألوان: ${p.colors || "غير محدد"}\n` +
          `     سعر: ${formatPrice(p.price)} | مخزون: ${p.stock} قطعة`;
        if (p.descriptionAr) line += `\n     ملاحظة: ${p.descriptionAr}`;
        return line;
      })
      .join("\n\n");

    const trainingContext =
      trainingNotes.length > 0
        ? `\n\n===تعليمات التدريب المحفوظة (أولوية عليا)===\n${trainingNotes.map((n: any, i: number) => `${i + 1}. ${n.note}`).join("\n")}\n===نهاية التعليمات===`
        : "";

    const adminChatHistory =
      existingMessages.length > 0
        ? `\n\n===سجل جلسة التدريب مع المشرفة===\n${existingMessages
            .map((m: any) =>
              m.role === "admin"
                ? `المشرفة: ${m.content}`
                : `البوت: ${m.content}`
            )
            .join("\n")}\n===نهاية السجل===`
        : "";

    const systemPrompt = `أنت بوت ذكاء اصطناعي لمتجر ملابس أطفال عراقي اسمه سنبلة.${trainingContext}${adminChatHistory}

أنت الآن في جلسة تدريب مع مشرفة المتجر. مهمتها:
1. إعطاؤك تعليمات وأوامر يجب أن تتذكرها وتطبقها مع الزبائن
2. اختبار ردودك على أسئلة الزبائن
3. تصحيح أخطائك وتوجيهك

استجب بشكل متعاون ومرن. إذا أعطتك تعليماً جديداً، أكده وأوضح أنك ستطبقه. إذا طلبت منك محاكاة رد على زبون، رد كأنك تكلم زبوناً حقيقياً.

⚠️ قواعد دائمة:
- تنسيق الأسعار: "40 الف" فقط — بدون أصفار أو رمز د.ع
- لا ايموجيات إطلاقاً (إلا عند تأكيد الطلبية)
- اللغة العربية العراقية

قائمة المخزون الحالي (${products.length} موديل):
${productContext || "لا توجد منتجات حالياً."}`;

    const history: any[] = existingMessages.map((m: any) => ({
      role: m.role === "admin" ? "user" : "assistant",
      content: m.imageUrl
        ? [
            { type: "text", text: m.content },
            { type: "image_url", image_url: { url: m.imageUrl, detail: "high" } },
          ]
        : m.content,
    }));

    let userContent: any;
    if (imageBase64) {
      userContent = [
        {
          type: "text",
          text: message?.trim() || "انظري هذه الصورة",
        },
        { type: "image_url", image_url: { url: imageBase64, detail: "high" } },
      ];
    } else {
      userContent = message!.trim();
    }

    const messages: any[] = [
      { role: "system", content: systemPrompt },
      ...history.slice(-20),
      { role: "user", content: userContent },
    ];

    const modelName = settings?.aiModelText || "gpt-4o";

    const completion = await openai.chat.completions.create({
      model: imageBase64 ? "gpt-4o" : modelName,
      messages,
      max_completion_tokens: 600,
    });

    const botReply =
      completion.choices[0]?.message?.content?.trim() || "لم أفهم الطلب.";

    await db.insert(trainingMessagesTable).values({
      role: "admin",
      content: message?.trim() || "[صورة]",
      imageUrl: imageBase64 || null,
    });

    await db.insert(trainingMessagesTable).values({
      role: "bot",
      content: botReply,
    });

    res.json({ reply: botReply });
  } catch (err: any) {
    console.error("[TRAINING-CHAT]", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/training-chat/save-instruction", async (req, res) => {
  try {
    const { note } = req.body as { note: string };
    if (!note?.trim()) {
      return res.status(400).json({ error: "note required" });
    }
    const [inserted] = await db
      .insert(botTrainingNotesTable)
      .values({ note: note.trim() })
      .returning();
    res.json(inserted);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/training-chat/notes", async (_req, res) => {
  try {
    const notes = await db
      .select()
      .from(botTrainingNotesTable)
      .where(eq(botTrainingNotesTable.active, true))
      .orderBy(desc(botTrainingNotesTable.createdAt));
    res.json(notes);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/training-chat/notes/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db
      .update(botTrainingNotesTable)
      .set({ active: false })
      .where(eq(botTrainingNotesTable.id, id));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
