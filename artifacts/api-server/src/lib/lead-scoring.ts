import { db } from "@workspace/db";
import { chatConversationsTable, chatMessagesTable } from "@workspace/db/schema";
import { eq, asc, and, ne, lt } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";

export type LeadCategory = "hot" | "warm" | "cold" | "unqualified";

interface ScoringResult {
  score: number;
  category: LeadCategory;
  reason: string;
}

const SCORING_PROMPT = `أنت محلل مبيعات خبير. قيّم هذه المحادثة بين عميل وبوت بيع ملابس أطفال.

انتج JSON فقط بالشكل التالي:
{
  "score": <رقم بين 1-100>,
  "category": <"hot" أو "warm" أو "cold" أو "unqualified">,
  "reason": <سبب موجز بالعربية>
}

معايير التقييم:
- hot (75-100): العميل أعطى اسمه + هاتفه + عنوانه، أو طلب منتجاً محدداً وأبدى استعداداً للشراء فوراً
- warm (40-74): العميل مهتم وسأل عن أسعار/منتجات لكن لم يكمل بيانات الحجز
- cold (15-39): العميل تصفّح فقط أو سأل أسئلة عامة دون اهتمام حقيقي بالشراء
- unqualified (1-14): رسالة خاطئة، رد عشوائي، أو محادثة غير ذات صلة

المحادثة:
`;

async function scoreConversation(
  messages: Array<{ role: string; content: string }>
): Promise<ScoringResult> {
  const formattedMsgs = messages
    .slice(-15)
    .map(m => `${m.role === "assistant" ? "البوت" : "العميل"}: ${m.content}`)
    .join("\n");

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: SCORING_PROMPT + formattedMsgs }],
      max_tokens: 200,
      temperature: 0,
      response_format: { type: "json_object" },
    });

    const raw = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw);
    return {
      score: Math.max(1, Math.min(100, Number(parsed.score) || 1)),
      category: (["hot", "warm", "cold", "unqualified"].includes(parsed.category)
        ? parsed.category
        : "cold") as LeadCategory,
      reason: parsed.reason || "—",
    };
  } catch {
    return { score: 1, category: "cold", reason: "تعذر التقييم" };
  }
}

export async function runLeadScoring() {
  console.log("[LEAD_SCORING] Starting idle-time behavioral analysis...");

  try {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    // Get conversations that haven't been scored yet or haven't had activity in 10+ min
    const conversations = await db
      .select()
      .from(chatConversationsTable)
      .where(
        and(
          ne(chatConversationsTable.status, "completed"),
          lt(chatConversationsTable.updatedAt, tenMinutesAgo),
        )
      )
      .limit(20);

    if (conversations.length === 0) {
      console.log("[LEAD_SCORING] No idle conversations to score.");
      return;
    }

    let scored = 0;
    for (const conv of conversations) {
      try {
        const messages = await db
          .select({ role: chatMessagesTable.role, content: chatMessagesTable.content })
          .from(chatMessagesTable)
          .where(eq(chatMessagesTable.conversationId, conv.id))
          .orderBy(asc(chatMessagesTable.createdAt))
          .limit(20);

        if (messages.length < 2) continue;

        const result = await scoreConversation(messages);

        await db
          .update(chatConversationsTable)
          .set({
            leadScore: result.score,
            leadCategory: result.category,
          })
          .where(eq(chatConversationsTable.id, conv.id));

        console.log(
          `[LEAD_SCORING] ${conv.id}: score=${result.score} category=${result.category} — ${result.reason}`
        );
        scored++;
      } catch (err: any) {
        console.log(`[LEAD_SCORING] Error scoring ${conv.id}: ${err?.message}`);
      }
    }

    console.log(`[LEAD_SCORING] Done. Scored ${scored}/${conversations.length} conversations.`);
  } catch (err: any) {
    console.log(`[LEAD_SCORING] Fatal error: ${err?.message}`);
  }
}
