import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { chatConversationsTable, chatMessagesTable } from "@workspace/db/schema";
import { eq, and, asc, SQL } from "drizzle-orm";

const router: IRouter = Router();

router.get("/conversations", async (req, res) => {
  try {
    const { platform, status } = req.query as { platform?: string; status?: string };
    const conditions: SQL[] = [];

    if (platform && platform !== "all") {
      conditions.push(eq(chatConversationsTable.platform, platform));
    }
    if (status && status !== "all") {
      conditions.push(eq(chatConversationsTable.status, status));
    }

    const conversations = conditions.length > 0
      ? await db.select().from(chatConversationsTable).where(and(...conditions))
      : await db.select().from(chatConversationsTable);

    res.json(conversations);
  } catch (err) {
    req.log.error({ err }, "Failed to get conversations");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/conversations/:id/messages", async (req, res) => {
  try {
    const { id } = req.params;
    const messages = await db.select().from(chatMessagesTable)
      .where(eq(chatMessagesTable.conversationId, id))
      .orderBy(asc(chatMessagesTable.createdAt));
    res.json(messages);
  } catch (err) {
    req.log.error({ err }, "Failed to get messages");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── PATCH /conversations/:id — update hasBooking, status, or other flags ──
router.patch("/conversations/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { hasBooking, status, isEscalated } = req.body as {
      hasBooking?: boolean;
      status?: string;
      isEscalated?: boolean;
    };

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (hasBooking !== undefined) updateData.hasBooking = hasBooking;
    if (status !== undefined) updateData.status = status;
    if (isEscalated !== undefined) updateData.isEscalated = isEscalated;

    const updated = await db.update(chatConversationsTable)
      .set(updateData)
      .where(eq(chatConversationsTable.id, id))
      .returning();

    if (!updated.length) {
      return res.status(404).json({ error: "Conversation not found" });
    }
    res.json(updated[0]);
  } catch (err) {
    req.log.error({ err }, "Failed to update conversation");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
