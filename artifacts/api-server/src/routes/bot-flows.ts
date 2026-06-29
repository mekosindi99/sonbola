import { Router } from "express";
import { db } from "@workspace/db";
import { botFlowsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { invalidateFlowCache } from "../lib/flow-engine";

const router = Router();

router.get("/bot-flows", async (_req, res) => {
  try {
    const flows = await db.select().from(botFlowsTable).orderBy(botFlowsTable.createdAt);
    res.json(flows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/bot-flows", async (req, res) => {
  try {
    const { name, nodes, edges } = req.body;
    const [created] = await db.insert(botFlowsTable).values({
      name: name || "فلو جديد",
      nodes: typeof nodes === "string" ? nodes : JSON.stringify(nodes || []),
      edges: typeof edges === "string" ? edges : JSON.stringify(edges || []),
      isActive: false,
    }).returning();
    res.json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/bot-flows/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, nodes, edges } = req.body;
    const updates: any = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (nodes !== undefined) updates.nodes = typeof nodes === "string" ? nodes : JSON.stringify(nodes);
    if (edges !== undefined) updates.edges = typeof edges === "string" ? edges : JSON.stringify(edges);
    const [updated] = await db.update(botFlowsTable).set(updates).where(eq(botFlowsTable.id, id)).returning();
    invalidateFlowCache();
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/bot-flows/:id/activate", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.update(botFlowsTable).set({ isActive: false });
    const [activated] = await db.update(botFlowsTable)
      .set({ isActive: true })
      .where(eq(botFlowsTable.id, id))
      .returning();
    invalidateFlowCache();
    res.json(activated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/bot-flows/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(botFlowsTable).where(eq(botFlowsTable.id, id));
    invalidateFlowCache();
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
