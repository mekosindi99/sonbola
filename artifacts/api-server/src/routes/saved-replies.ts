import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { savedRepliesTable, botTrainingNotesTable } from "@workspace/db/schema";
import { eq, ilike, or, sql, desc } from "drizzle-orm";

const router: IRouter = Router();

// GET with pagination + search
router.get("/saved-replies", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));
    const search = (req.query.search as string || "").trim();
    const offset = (page - 1) * limit;

    const where = search
      ? or(
          ilike(savedRepliesTable.titleAr, `%${search}%`),
          ilike(savedRepliesTable.replyAr, `%${search}%`),
        )
      : undefined;

    const [rows, countResult] = await Promise.all([
      db.select()
        .from(savedRepliesTable)
        .where(where)
        .orderBy(desc(savedRepliesTable.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` })
        .from(savedRepliesTable)
        .where(where),
    ]);

    const total = countResult[0]?.count ?? 0;
    res.json({ rows, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) {
    req.log.error({ err }, "Failed to get saved replies");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET all active (used by bot engine internally — not paginated)
router.get("/saved-replies/all-active", async (req, res) => {
  try {
    const rows = await db.select().from(savedRepliesTable).where(eq(savedRepliesTable.isActive, true));
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to get active saved replies");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET all (export)
router.get("/saved-replies/export", async (req, res) => {
  try {
    const rows = await db.select({
      customerMessage: savedRepliesTable.titleAr,
      botReply: savedRepliesTable.replyAr,
      isActive: savedRepliesTable.isActive,
    }).from(savedRepliesTable).orderBy(desc(savedRepliesTable.createdAt));
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to export saved replies");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── CRUD ────────────────────────────────────────────────────────────────────

router.post("/saved-replies", async (req, res) => {
  try {
    const body = req.body;
    const titleAr = body.titleAr || "";
    const replyAr = body.replyAr || "";
    const [row] = await db.insert(savedRepliesTable).values({
      titleAr,
      titleEn: body.titleEn || "",
      triggerKeywords: body.triggerKeywords || null,
      replyAr,
      replyEn: body.replyEn || "",
      category: body.category || "general",
      isActive: body.isActive !== false,
    }).returning();
    if (titleAr && replyAr) {
      const trainingNote = `[من الردود المحفوظة] عندما يقول الزبون: "${titleAr}" — الجواب: "${replyAr}"`;
      await db.insert(botTrainingNotesTable).values({ note: trainingNote }).catch(() => {});
    }
    res.status(201).json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to create saved reply");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Bulk import
router.post("/saved-replies/bulk", async (req, res) => {
  try {
    const { items } = req.body as { items: Array<{ customerMessage: string; botReply: string }> };
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "items array required" });
    }
    const BATCH = 500;
    let inserted = 0;
    for (let i = 0; i < items.length; i += BATCH) {
      const slice = items.slice(i, i + BATCH).map(it => ({
        titleAr: String(it.customerMessage || "").trim(),
        titleEn: String(it.customerMessage || "").trim(),
        triggerKeywords: String(it.customerMessage || "").trim() || null,
        replyAr: String(it.botReply || "").trim(),
        replyEn: String(it.botReply || "").trim(),
        category: "general",
        isActive: true,
      })).filter(it => it.titleAr && it.replyAr);
      if (slice.length > 0) { await db.insert(savedRepliesTable).values(slice); inserted += slice.length; }
    }
    if (inserted > 0) {
      const examples = items.slice(0, 5).map(it => `"${String(it.customerMessage).trim()}" → "${String(it.botReply).trim()}"`).join("  |  ");
      await db.insert(botTrainingNotesTable).values({ note: `[استيراد جماعي] تم تعلّم ${inserted} نمط. أمثلة: ${examples}` }).catch(() => {});
    }
    res.status(201).json({ inserted });
  } catch (err) {
    req.log.error({ err }, "Failed to bulk import saved replies");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/saved-replies/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const body = req.body;
    const [row] = await db.update(savedRepliesTable).set({
      titleAr: body.titleAr,
      titleEn: body.titleEn,
      triggerKeywords: body.triggerKeywords ?? null,
      replyAr: body.replyAr,
      replyEn: body.replyEn,
      category: body.category,
      isActive: body.isActive,
      updatedAt: new Date(),
    }).where(eq(savedRepliesTable.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to update saved reply");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/saved-replies/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await db.delete(savedRepliesTable).where(eq(savedRepliesTable.id, id));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete saved reply");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/saved-replies", async (req, res) => {
  try {
    await db.delete(savedRepliesTable);
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete all saved replies");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
