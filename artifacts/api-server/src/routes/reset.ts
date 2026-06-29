import { Router } from "express";
import { db } from "@workspace/db";
import { storefrontVisitorsTable, settingsTable } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

// ── GET /api/beqolky/reset/schedule ───────────────────────────────────────────
router.get("/beqolky/reset/schedule", async (_req, res) => {
  try {
    const [s] = await db
      .select({ beeResetScheduledAt: settingsTable.beeResetScheduledAt, fortuneResetScheduledAt: settingsTable.fortuneResetScheduledAt })
      .from(settingsTable)
      .limit(1);
    res.json(s ?? { beeResetScheduledAt: null, fortuneResetScheduledAt: null });
  } catch (err) {
    res.status(500).json({ error: "server error" });
  }
});

// ── PUT /api/beqolky/reset/schedule ───────────────────────────────────────────
router.put("/beqolky/reset/schedule", async (req, res) => {
  try {
    const { beeResetScheduledAt, fortuneResetScheduledAt } = req.body as {
      beeResetScheduledAt?: string | null;
      fortuneResetScheduledAt?: string | null;
    };
    await db.update(settingsTable).set({
      beeResetScheduledAt: beeResetScheduledAt ? new Date(beeResetScheduledAt) : null,
      fortuneResetScheduledAt: fortuneResetScheduledAt ? new Date(fortuneResetScheduledAt) : null,
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "server error" });
  }
});

// ── POST /api/beqolky/reset/bee-coins ─────────────────────────────────────────
router.post("/beqolky/reset/bee-coins", async (_req, res) => {
  try {
    const result = await db.execute(
      sql`UPDATE storefront_visitors SET bee_balance = 0, last_checkin = NULL`
    );
    const count = (result as any)?.rowCount ?? 0;
    await db.update(settingsTable).set({ beeResetScheduledAt: null });
    console.log(`[RESET] Bee coins reset for ${count} users`);
    res.json({ success: true, count });
  } catch (err) {
    console.error("[RESET] bee-coins error:", err);
    res.status(500).json({ error: "server error" });
  }
});

// ── POST /api/beqolky/reset/fortune-spins ────────────────────────────────────
router.post("/beqolky/reset/fortune-spins", async (_req, res) => {
  try {
    const result = await db.execute(
      sql`UPDATE storefront_visitors SET last_fortune_spin = NULL, last_fortune_item_id = NULL, last_fortune_coupon = NULL`
    );
    const count = (result as any)?.rowCount ?? 0;
    await db.update(settingsTable).set({ fortuneResetScheduledAt: null });
    console.log(`[RESET] Fortune spins reset for ${count} users`);
    res.json({ success: true, count });
  } catch (err) {
    console.error("[RESET] fortune-spins error:", err);
    res.status(500).json({ error: "server error" });
  }
});

export default router;

// ── Scheduler helper — call once at startup ───────────────────────────────────
export async function runScheduledResets() {
  try {
    const [s] = await db
      .select({ beeResetScheduledAt: settingsTable.beeResetScheduledAt, fortuneResetScheduledAt: settingsTable.fortuneResetScheduledAt })
      .from(settingsTable)
      .limit(1);
    if (!s) return;

    const now = new Date();

    if (s.beeResetScheduledAt && new Date(s.beeResetScheduledAt) <= now) {
      await db.execute(sql`UPDATE storefront_visitors SET bee_balance = 0, last_checkin = NULL`);
      await db.update(settingsTable).set({ beeResetScheduledAt: null });
      console.log("[SCHEDULER] Bee coins reset executed (scheduled)");
    }

    if (s.fortuneResetScheduledAt && new Date(s.fortuneResetScheduledAt) <= now) {
      await db.execute(sql`UPDATE storefront_visitors SET last_fortune_spin = NULL, last_fortune_item_id = NULL, last_fortune_coupon = NULL`);
      await db.update(settingsTable).set({ fortuneResetScheduledAt: null });
      console.log("[SCHEDULER] Fortune spins reset executed (scheduled)");
    }
  } catch (err: any) {
    console.error("[SCHEDULER] reset check error:", err?.message);
  }
}
