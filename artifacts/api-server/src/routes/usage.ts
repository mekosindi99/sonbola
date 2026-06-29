import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { chatMessagesTable, chatConversationsTable } from "@workspace/db/schema";
import { count, eq, isNotNull, sql } from "drizzle-orm";
import os from "os";

const router: IRouter = Router();

// ── OpenAI pricing (per 1K tokens, USD) ─────────────────────────────────────
const PRICING = {
  "gpt-4o-mini": { input: 0.00015, output: 0.00060 },
  "gpt-4o":      { input: 0.00250, output: 0.01000 },
};

// ── Avg tokens per call (conservative estimates) ────────────────────────────
// Text message: system prompt ~900tk + history ~400tk + user msg ~30tk + reply ~150tk
const TEXT_INPUT_TOKENS  = 1330;
const TEXT_OUTPUT_TOKENS =  150;
// Vision message: same + product images ~1800tk + user image ~500tk
const IMG_INPUT_TOKENS   = 3630;
const IMG_OUTPUT_TOKENS  =  200;

function calcCost(inputTk: number, outputTk: number, model: "gpt-4o-mini" | "gpt-4o"): number {
  const p = PRICING[model];
  return (inputTk / 1000) * p.input + (outputTk / 1000) * p.output;
}

// ── Daily breakdown (last 30 days) ──────────────────────────────────────────
router.get("/usage/daily", async (req, res) => {
  try {
    const days = Number(req.query.days) || 14;
    const rows = await db.execute(sql`
      SELECT
        DATE(created_at AT TIME ZONE 'Asia/Baghdad') AS day,
        COUNT(*) FILTER (WHERE role = 'assistant') AS bot_replies,
        COUNT(*) FILTER (WHERE role = 'user' AND image_url IS NOT NULL) AS image_calls
      FROM chat_messages
      WHERE created_at >= NOW() - INTERVAL '${sql.raw(String(days))} days'
      GROUP BY 1
      ORDER BY 1 ASC
    `);

    const result = (rows.rows as any[]).map(r => ({
      day: String(r.day).slice(0, 10),
      botReplies: Number(r.bot_replies ?? 0),
      imageCalls: Number(r.image_calls ?? 0),
    }));

    // Fill missing days with 0
    const filled: { day: string; botReplies: number; imageCalls: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const found = result.find(r => r.day === key);
      filled.push(found ?? { day: key, botReplies: 0, imageCalls: 0 });
    }
    res.json(filled);
  } catch (err) {
    req.log.error({ err }, "Failed to get daily usage");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/usage", async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // ── All-time counts ──────────────────────────────────────────────────────
    const [
      allBotMsgs,
      allImgMsgs,
      allConvs,
      monthBotMsgs,
      monthImgMsgs,
      monthConvs,
    ] = await Promise.all([
      // Total bot replies (= total GPT calls)
      db.select({ n: count() }).from(chatMessagesTable)
        .where(eq(chatMessagesTable.role, "assistant")),
      // Total user image messages (= gpt-4o vision calls)
      db.select({ n: count() }).from(chatMessagesTable)
        .where(sql`${chatMessagesTable.role} = 'user' AND ${chatMessagesTable.imageUrl} IS NOT NULL`),
      // Total conversations
      db.select({ n: count() }).from(chatConversationsTable),
      // This month bot replies
      db.select({ n: count() }).from(chatMessagesTable)
        .where(sql`${chatMessagesTable.role} = 'assistant' AND ${chatMessagesTable.createdAt} >= ${startOfMonth}`),
      // This month image messages
      db.select({ n: count() }).from(chatMessagesTable)
        .where(sql`${chatMessagesTable.role} = 'user' AND ${chatMessagesTable.imageUrl} IS NOT NULL AND ${chatMessagesTable.createdAt} >= ${startOfMonth}`),
      // This month conversations
      db.select({ n: count() }).from(chatConversationsTable)
        .where(sql`${chatConversationsTable.createdAt} >= ${startOfMonth}`),
    ]);

    const allTotal      = Number(allBotMsgs[0]?.n ?? 0);
    const allImages     = Number(allImgMsgs[0]?.n ?? 0);
    const allText       = Math.max(0, allTotal - allImages);
    const allConvsCount = Number(allConvs[0]?.n ?? 0);

    const monthTotal      = Number(monthBotMsgs[0]?.n ?? 0);
    const monthImages     = Number(monthImgMsgs[0]?.n ?? 0);
    const monthText       = Math.max(0, monthTotal - monthImages);
    const monthConvsCount = Number(monthConvs[0]?.n ?? 0);

    // ── Cost estimates ───────────────────────────────────────────────────────
    const costPerTextCall  = calcCost(TEXT_INPUT_TOKENS,  TEXT_OUTPUT_TOKENS,  "gpt-4o-mini");
    const costPerImgCall   = calcCost(IMG_INPUT_TOKENS,   IMG_OUTPUT_TOKENS,   "gpt-4o");

    const allTimeCostUsd   = allText  * costPerTextCall  + allImages  * costPerImgCall;
    const monthCostUsd     = monthText * costPerTextCall + monthImages * costPerImgCall;

    // ── Token estimates ──────────────────────────────────────────────────────
    const allTokens   = allText  * (TEXT_INPUT_TOKENS + TEXT_OUTPUT_TOKENS)
                      + allImages * (IMG_INPUT_TOKENS  + IMG_OUTPUT_TOKENS);
    const monthTokens = monthText * (TEXT_INPUT_TOKENS + TEXT_OUTPUT_TOKENS)
                      + monthImages * (IMG_INPUT_TOKENS + IMG_OUTPUT_TOKENS);

    res.json({
      allTime: {
        botReplies:    allTotal,
        textCalls:     allText,
        imageCalls:    allImages,
        conversations: allConvsCount,
        tokens:        allTokens,
        costUsd:       +allTimeCostUsd.toFixed(4),
      },
      thisMonth: {
        botReplies:    monthTotal,
        textCalls:     monthText,
        imageCalls:    monthImages,
        conversations: monthConvsCount,
        tokens:        monthTokens,
        costUsd:       +monthCostUsd.toFixed(4),
      },
      perCall: {
        textCallUsd:  +costPerTextCall.toFixed(6),
        imageCallUsd: +costPerImgCall.toFixed(6),
        textModel:    "gpt-4o-mini",
        imageModel:   "gpt-4o",
        textInputTokens:  TEXT_INPUT_TOKENS,
        textOutputTokens: TEXT_OUTPUT_TOKENS,
        imageInputTokens: IMG_INPUT_TOKENS,
        imageOutputTokens: IMG_OUTPUT_TOKENS,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get usage");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Server / Replit system stats ─────────────────────────────────────────────
router.get("/usage/system", (_req, res) => {
  try {
    const mem = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem  = os.freemem();
    const usedMem  = totalMem - freeMem;
    const uptimeSec = process.uptime(); // seconds

    const cpus = os.cpus();
    const cpuModel = cpus[0]?.model ?? "Unknown";

    res.json({
      node: {
        version: process.version,
        uptimeSeconds: Math.round(uptimeSec),
        heapUsedMb:  +(mem.heapUsed  / 1024 / 1024).toFixed(1),
        heapTotalMb: +(mem.heapTotal / 1024 / 1024).toFixed(1),
        rssMb:       +(mem.rss       / 1024 / 1024).toFixed(1),
        externalMb:  +(mem.external  / 1024 / 1024).toFixed(1),
      },
      system: {
        totalMemMb:  +(totalMem / 1024 / 1024).toFixed(0),
        usedMemMb:   +(usedMem  / 1024 / 1024).toFixed(0),
        freeMemMb:   +(freeMem  / 1024 / 1024).toFixed(0),
        usedPct:     +((usedMem / totalMem) * 100).toFixed(1),
        cpuCores: cpus.length,
        cpuModel: cpuModel.split(" ").slice(0, 4).join(" "),
        platform: os.platform(),
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
