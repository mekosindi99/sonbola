import { Router } from "express";
import { eq, asc, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { fortuneItemsTable, settingsTable, storefrontVisitorsTable, beeTransactionsTable } from "@workspace/db";
import { normalizePhone } from "./blocked-phones";

const router = Router();

function todayIQ(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Baghdad" });
}

function generateFortuneCoupon(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "FRT-";
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function weightedRandom(items: Array<{ id: number; weight: number }>): number {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let roll = Math.random() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item.id;
  }
  return items[items.length - 1].id;
}

// ── GET /api/beqolky/fortune/items ────────────────────────────────────────────
router.get("/beqolky/fortune/items", async (_req, res) => {
  try {
    const items = await db.select().from(fortuneItemsTable).orderBy(asc(fortuneItemsTable.sortOrder), asc(fortuneItemsTable.id));
    res.json(items);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── POST /api/beqolky/fortune/items ──────────────────────────────────────────
router.post("/beqolky/fortune/items", async (req, res) => {
  try {
    const { label, type, value, weight, emoji, color, sortOrder } = req.body as {
      label: string; type: string; value?: number; weight?: number;
      emoji?: string; color?: string; sortOrder?: number;
    };
    if (!label || !type) return void res.status(400).json({ error: "label and type required" });
    const [item] = await db.insert(fortuneItemsTable).values({
      label,
      type,
      value: value ?? 0,
      weight: weight ?? 10,
      emoji: emoji ?? "🎁",
      color: color ?? "#f59e0b",
      sortOrder: sortOrder ?? 0,
    }).returning();
    res.json(item);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── PUT /api/beqolky/fortune/items/:id ───────────────────────────────────────
router.put("/beqolky/fortune/items/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { label, type, value, weight, emoji, color, isActive, sortOrder } = req.body as {
      label?: string; type?: string; value?: number; weight?: number;
      emoji?: string; color?: string; isActive?: boolean; sortOrder?: number;
    };
    const updates: Record<string, unknown> = {};
    if (label !== undefined) updates.label = label;
    if (type !== undefined) updates.type = type;
    if (value !== undefined) updates.value = value;
    if (weight !== undefined) updates.weight = weight;
    if (emoji !== undefined) updates.emoji = emoji;
    if (color !== undefined) updates.color = color;
    if (isActive !== undefined) updates.isActive = isActive;
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;
    const [item] = await db.update(fortuneItemsTable).set(updates).where(eq(fortuneItemsTable.id, id)).returning();
    if (!item) return void res.status(404).json({ error: "not found" });
    res.json(item);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── DELETE /api/beqolky/fortune/items/:id ────────────────────────────────────
router.delete("/beqolky/fortune/items/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(fortuneItemsTable).where(eq(fortuneItemsTable.id, id));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── GET /api/beqolky/fortune/settings ────────────────────────────────────────
router.get("/beqolky/fortune/settings", async (_req, res) => {
  try {
    const [s] = await db.select({ fortuneEnabled: settingsTable.fortuneEnabled }).from(settingsTable).limit(1);
    res.json({ fortuneEnabled: s?.fortuneEnabled ?? false });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── PUT /api/beqolky/fortune/settings ────────────────────────────────────────
router.put("/beqolky/fortune/settings", async (req, res) => {
  try {
    const { fortuneEnabled } = req.body as { fortuneEnabled?: boolean };
    if (fortuneEnabled !== undefined) {
      await db.update(settingsTable).set({ fortuneEnabled });
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── GET /api/storefront/fortune/status ───────────────────────────────────────
router.get("/storefront/fortune/status", async (req, res) => {
  const rawPhone = req.query.phone as string;
  if (!rawPhone) return void res.status(400).json({ error: "phone required" });
  const phone = normalizePhone(rawPhone);

  try {
    const [s] = await db.select({ fortuneEnabled: settingsTable.fortuneEnabled }).from(settingsTable).limit(1);
    const enabled = s?.fortuneEnabled ?? false;

    const items = await db.select()
      .from(fortuneItemsTable)
      .where(eq(fortuneItemsTable.isActive, true))
      .orderBy(asc(fortuneItemsTable.sortOrder), asc(fortuneItemsTable.id));

    const [visitor] = await db.select({
      lastFortuneSpin: storefrontVisitorsTable.lastFortuneSpin,
      lastFortuneItemId: storefrontVisitorsTable.lastFortuneItemId,
      lastFortuneCoupon: storefrontVisitorsTable.lastFortuneCoupon,
    }).from(storefrontVisitorsTable)
      .where(eq(storefrontVisitorsTable.phone, phone))
      .limit(1);

    const today = todayIQ();
    const spunToday = visitor?.lastFortuneSpin === today;
    const todayItem = spunToday && visitor?.lastFortuneItemId
      ? items.find(i => i.id === visitor.lastFortuneItemId) ?? null
      : null;

    res.json({
      enabled,
      items,
      canSpin: enabled && !spunToday,
      spunToday,
      todayItem,
      todayCoupon: visitor?.lastFortuneCoupon ?? null,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── POST /api/storefront/fortune/spin ────────────────────────────────────────
router.post("/storefront/fortune/spin", async (req, res) => {
  const rawPhone = req.body.phone as string;
  const deviceId = req.body.deviceId as string | undefined;
  if (!rawPhone) return void res.status(400).json({ error: "phone required" });
  const phone = normalizePhone(rawPhone);

  try {
    const [s] = await db.select({ fortuneEnabled: settingsTable.fortuneEnabled }).from(settingsTable).limit(1);
    if (!s?.fortuneEnabled) return void res.status(403).json({ error: "feature disabled" });

    const [visitor] = await db.select().from(storefrontVisitorsTable)
      .where(eq(storefrontVisitorsTable.phone, phone)).limit(1);
    if (!visitor) return void res.status(404).json({ error: "user not found" });

    const today = todayIQ();
    if (visitor.lastFortuneSpin === today) {
      return void res.status(409).json({ error: "already spun today" });
    }

    // Anti-fraud: block same device spinning with a different account today
    if (deviceId) {
      const [deviceSpin] = await db
        .select({ id: storefrontVisitorsTable.id })
        .from(storefrontVisitorsTable)
        .where(sql`${storefrontVisitorsTable.lastFortuneDevice} = ${deviceId} AND ${storefrontVisitorsTable.lastFortuneSpin} = ${today}`)
        .limit(1);
      if (deviceSpin) {
        return void res.status(429).json({ error: "device_already_spun", message: "تم الدوران من هذا الجهاز اليوم مسبقاً" });
      }
    }

    const items = await db.select()
      .from(fortuneItemsTable)
      .where(eq(fortuneItemsTable.isActive, true));

    if (!items.length) return void res.status(404).json({ error: "no active items" });

    const winnerId = weightedRandom(items.map(i => ({ id: i.id, weight: i.weight })));
    const winner = items.find(i => i.id === winnerId)!;

    let couponCode: string | null = null;
    let coinsAwarded = 0;

    if (winner.type === "bee_coins" && winner.value > 0) {
      coinsAwarded = winner.value;
      await db.update(storefrontVisitorsTable)
        .set({ beeBalance: visitor.beeBalance + coinsAwarded })
        .where(eq(storefrontVisitorsTable.id, visitor.id));

      await db.insert(beeTransactionsTable).values({
        phone,
        amount: coinsAwarded,
        reason: `fortune:${winner.id}`,
      });
    } else if (winner.type === "discount") {
      couponCode = generateFortuneCoupon();
    }

    await db.update(storefrontVisitorsTable).set({
      lastFortuneSpin: today,
      lastFortuneItemId: winner.id,
      lastFortuneCoupon: couponCode,
      lastFortuneDevice: deviceId ?? null,
    }).where(eq(storefrontVisitorsTable.id, visitor.id));

    res.json({
      winner,
      couponCode,
      coinsAwarded,
      newBalance: winner.type === "bee_coins" ? visitor.beeBalance + coinsAwarded : visitor.beeBalance,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
