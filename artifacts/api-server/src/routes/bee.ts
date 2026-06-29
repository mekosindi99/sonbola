import { Router } from "express";
import { eq, desc, sql, and, count, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  storefrontVisitorsTable,
  beeTransactionsTable,
  beeRedemptionsTable,
  beeSharesTable,
  settingsTable,
} from "@workspace/db";
import { normalizePhone } from "./blocked-phones";

function todayBaghdad(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Baghdad" });
}
function yesterdayBaghdad(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Baghdad" });
}

const router = Router();

const BEE_DAILY_REWARD = 10;

// Read bee settings from DB (with fallback defaults)
async function getBeeSettings() {
  const [s] = await db.select({
    beeEnabled: settingsTable.beeEnabled,
    redeemThreshold: settingsTable.beeRedeemThreshold,
    redeemIqd: settingsTable.beeRedeemValueIqd,
    notes: settingsTable.beeNotes,
  }).from(settingsTable).limit(1);
  return {
    beeEnabled: s?.beeEnabled ?? true,
    redeemThreshold: s?.redeemThreshold ?? 1000,
    redeemIqd: s?.redeemIqd ?? 2000,
    notes: s?.notes ?? null,
  };
}

function generateCoupon(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "BEE-";
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// ── GET /api/storefront/bee/balance ───────────────────────────────────────────
router.get("/storefront/bee/balance", async (req, res) => {
  const rawPhone = req.query.phone as string;
  if (!rawPhone) return void res.status(400).json({ error: "phone required" });
  const phone = normalizePhone(rawPhone);

  try {
    const [visitor] = await db
      .select({ beeBalance: storefrontVisitorsTable.beeBalance, lastCheckin: storefrontVisitorsTable.lastCheckin })
      .from(storefrontVisitorsTable)
      .where(eq(storefrontVisitorsTable.phone, phone))
      .limit(1);

    if (!visitor) return void res.json({ beeBalance: 0, lastCheckin: null, canCheckin: false });

    // Determine if user can check in (24 full hours must have passed)
    const nowUtc = new Date();
    const lastCheckinMs = visitor.lastCheckin ? new Date(visitor.lastCheckin).getTime() : 0;
    const hoursPassed = (nowUtc.getTime() - lastCheckinMs) / (1000 * 60 * 60);
    const canCheckin = hoursPassed >= 24;
    const nextCheckinAt = lastCheckinMs ? new Date(lastCheckinMs + 24 * 60 * 60 * 1000).toISOString() : null;

    // Get recent transactions
    const txs = await db
      .select()
      .from(beeTransactionsTable)
      .where(eq(beeTransactionsTable.phone, phone))
      .orderBy(desc(beeTransactionsTable.createdAt))
      .limit(20);

    // Get pending redemptions
    const redemptions = await db
      .select()
      .from(beeRedemptionsTable)
      .where(eq(beeRedemptionsTable.phone, phone))
      .orderBy(desc(beeRedemptionsTable.requestedAt))
      .limit(5);

    const beeSettings = await getBeeSettings();

    return void res.json({
      beeEnabled: beeSettings.beeEnabled,
      beeBalance: visitor.beeBalance,
      lastCheckin: visitor.lastCheckin,
      canCheckin,
      nextCheckinAt,
      transactions: txs,
      redemptions,
      redeemThreshold: beeSettings.redeemThreshold,
      redeemIqd: beeSettings.redeemIqd,
      beeNotes: beeSettings.notes,
      dailyReward: BEE_DAILY_REWARD,
    });
  } catch (err) {
    console.error("[bee] balance error:", err);
    res.status(500).json({ error: "server error" });
  }
});

// ── POST /api/storefront/bee/checkin ─────────────────────────────────────────
router.post("/storefront/bee/checkin", async (req, res) => {
  const { phone: rawPhone, deviceId } = req.body as { phone?: string; deviceId?: string };
  if (!rawPhone) return void res.status(400).json({ error: "phone required" });
  const phone = normalizePhone(rawPhone);

  try {
    // Validate device: check if this deviceId already claimed today (anti-fraud)
    if (deviceId) {
      const todayUtc = new Date().toISOString().slice(0, 10);
      const [deviceClaim] = await db
        .select()
        .from(beeTransactionsTable)
        .where(sql`${beeTransactionsTable.deviceId} = ${deviceId} AND DATE(${beeTransactionsTable.createdAt} AT TIME ZONE 'UTC') = ${todayUtc}::date`)
        .limit(1);

      if (deviceClaim) {
        return void res.status(429).json({ error: "device_already_claimed", message: "تم استلام مكافأة اليوم من هذا الجهاز مسبقاً" });
      }
    }

    // Get current visitor
    const [visitor] = await db
      .select()
      .from(storefrontVisitorsTable)
      .where(eq(storefrontVisitorsTable.phone, phone))
      .limit(1);

    if (!visitor) return void res.status(404).json({ error: "user not found" });

    // Check last checkin — 24 full hours must have passed
    const nowUtc = new Date();
    const lastCheckinMs = visitor.lastCheckin ? new Date(visitor.lastCheckin).getTime() : 0;
    const hoursPassed = (nowUtc.getTime() - lastCheckinMs) / (1000 * 60 * 60);

    if (hoursPassed < 24) {
      const nextAt = new Date(lastCheckinMs + 24 * 60 * 60 * 1000).toISOString();
      return void res.status(429).json({ error: "already_claimed", message: "لقد استلمت مكافأة اليوم بالفعل", nextCheckinAt: nextAt });
    }

    // Credit coins
    const newBalance = visitor.beeBalance + BEE_DAILY_REWARD;
    await db.update(storefrontVisitorsTable)
      .set({ beeBalance: newBalance, lastCheckin: nowUtc })
      .where(eq(storefrontVisitorsTable.phone, phone));

    // Log transaction
    await db.insert(beeTransactionsTable).values({
      phone,
      amount: BEE_DAILY_REWARD,
      reason: "daily_checkin",
      deviceId: deviceId || null,
    });

    return void res.json({
      success: true,
      coinsEarned: BEE_DAILY_REWARD,
      newBalance,
      message: `حصلت على ${BEE_DAILY_REWARD} نقطة نحلة! 🐝`,
    });
  } catch (err) {
    console.error("[bee] checkin error:", err);
    res.status(500).json({ error: "server error" });
  }
});

// ── POST /api/storefront/bee/redeem ──────────────────────────────────────────
router.post("/storefront/bee/redeem", async (req, res) => {
  const { phone: rawPhone } = req.body as { phone?: string };
  if (!rawPhone) return void res.status(400).json({ error: "phone required" });
  const phone = normalizePhone(rawPhone);

  try {
    const [visitor] = await db
      .select()
      .from(storefrontVisitorsTable)
      .where(eq(storefrontVisitorsTable.phone, phone))
      .limit(1);

    if (!visitor) return void res.status(404).json({ error: "user not found" });

    const beeSettings = await getBeeSettings();
    const { redeemThreshold, redeemIqd } = beeSettings;

    if (visitor.beeBalance < redeemThreshold) {
      return void res.status(400).json({
        error: "insufficient_balance",
        message: `رصيدك ${visitor.beeBalance} نقطة — تحتاج ${redeemThreshold} نقطة للاستبدال`,
      });
    }

    // Check no pending redemption
    const [pending] = await db
      .select()
      .from(beeRedemptionsTable)
      .where(sql`${beeRedemptionsTable.phone} = ${phone} AND ${beeRedemptionsTable.status} = 'pending'`)
      .limit(1);

    if (pending) {
      return void res.status(400).json({
        error: "pending_exists",
        message: "لديك طلب استبدال قيد المراجعة — يرجى الانتظار",
        couponCode: pending.couponCode,
      });
    }

    const couponCode = generateCoupon();
    const newBalance = visitor.beeBalance - redeemThreshold;

    // Deduct balance
    await db.update(storefrontVisitorsTable)
      .set({ beeBalance: newBalance })
      .where(eq(storefrontVisitorsTable.phone, phone));

    // Log transaction (negative)
    await db.insert(beeTransactionsTable).values({
      phone,
      amount: -redeemThreshold,
      reason: "redemption",
    });

    // Create redemption request
    await db.insert(beeRedemptionsTable).values({
      phone,
      name: visitor.name,
      coinsDeducted: redeemThreshold,
      discountAmount: redeemIqd,
      couponCode,
      status: "pending",
    });

    return void res.json({
      success: true,
      couponCode,
      discountAmount: redeemIqd,
      newBalance,
      message: `تم إنشاء كوبون الخصم: ${couponCode}`,
    });
  } catch (err) {
    console.error("[bee] redeem error:", err);
    res.status(500).json({ error: "server error" });
  }
});

// ── POST /api/storefront/bee/like ─────────────────────────────────────────────
// +1 bee for liking a product, once per user per product
router.post("/storefront/bee/like", async (req, res) => {
  const { phone: rawPhone, productId } = req.body as { phone?: string; productId?: string };
  if (!rawPhone || !productId) return void res.status(400).json({ error: "phone and productId required" });
  const phone = normalizePhone(rawPhone);

  try {
    const [visitor] = await db
      .select({ beeBalance: storefrontVisitorsTable.beeBalance })
      .from(storefrontVisitorsTable)
      .where(eq(storefrontVisitorsTable.phone, phone))
      .limit(1);
    if (!visitor) return void res.status(404).json({ error: "user not found" });

    // Check if already liked this product
    const reason = `like:product:${productId}`;
    const [existing] = await db
      .select({ id: beeTransactionsTable.id })
      .from(beeTransactionsTable)
      .where(sql`${beeTransactionsTable.phone} = ${phone} AND ${beeTransactionsTable.reason} = ${reason}`)
      .limit(1);

    if (existing) {
      return void res.json({ success: false, alreadyLiked: true, beeBalance: visitor.beeBalance });
    }

    // Grant +1 bee
    const newBalance = visitor.beeBalance + 1;
    await db.update(storefrontVisitorsTable)
      .set({ beeBalance: newBalance })
      .where(eq(storefrontVisitorsTable.phone, phone));
    await db.insert(beeTransactionsTable).values({ phone, amount: 1, reason });

    return void res.json({ success: true, coinsEarned: 1, newBalance });
  } catch (err) {
    console.error("[bee] like error:", err);
    res.status(500).json({ error: "server error" });
  }
});

// ── GET /api/storefront/bee/share-status ──────────────────────────────────────
// Returns how many shares the user has done today
router.get("/storefront/bee/share-status", async (req, res) => {
  const rawPhone = req.query.phone as string;
  if (!rawPhone) return void res.status(400).json({ error: "phone required" });
  const phone = normalizePhone(rawPhone);
  const today = todayBaghdad();
  try {
    const [row] = await db
      .select({ cnt: count() })
      .from(beeSharesTable)
      .where(and(eq(beeSharesTable.senderPhone, phone), eq(beeSharesTable.shareDate, today)));
    res.json({ sharesUsedToday: Number(row?.cnt ?? 0), dailyLimit: 3 });
  } catch (err) {
    res.status(500).json({ error: "server error" });
  }
});

// ── POST /api/storefront/bee/share ────────────────────────────────────────────
// Rules:
//  1. recipientPhone ≠ senderPhone
//  2. Max 3 shares per day per sender phone
//  3. Max 3 shares per day per device (cross-account anti-fraud)
//  4. Same product already shared today → reject
//  5. Same recipient used yesterday → reject
// +10 bee per successful share
const DAILY_SHARE_LIMIT = 3;

router.post("/storefront/bee/share", async (req, res) => {
  const { phone: rawPhone, recipientPhone: rawRecipient, productId, platform, deviceId } = req.body as {
    phone?: string; recipientPhone?: string; productId?: string; platform?: string; deviceId?: string;
  };
  if (!rawPhone || !rawRecipient || !productId || !platform) {
    return void res.status(400).json({ error: "phone, recipientPhone, productId, and platform required" });
  }
  const phone = normalizePhone(rawPhone);
  const recipient = normalizePhone(rawRecipient);
  const today = todayBaghdad();
  const yesterday = yesterdayBaghdad();

  try {
    const [visitor] = await db
      .select({ beeBalance: storefrontVisitorsTable.beeBalance })
      .from(storefrontVisitorsTable)
      .where(eq(storefrontVisitorsTable.phone, phone))
      .limit(1);
    if (!visitor) return void res.status(404).json({ error: "user not found" });

    // Rule 1: can't share to yourself
    if (phone === recipient) {
      return void res.json({ success: false, error: "self", message: "لا يمكنك إرسال المشاركة لنفسك!" });
    }

    // Rule 2: max 3 shares per day per phone
    const [countRow] = await db
      .select({ cnt: count() })
      .from(beeSharesTable)
      .where(and(eq(beeSharesTable.senderPhone, phone), eq(beeSharesTable.shareDate, today)));
    const sharesUsedToday = Number(countRow?.cnt ?? 0);
    if (sharesUsedToday >= DAILY_SHARE_LIMIT) {
      return void res.json({ success: false, error: "daily_limit", message: `وصلت الحد الأقصى (${DAILY_SHARE_LIMIT} مشاركات يومياً). تعود غداً! 🌙`, sharesUsedToday, dailyLimit: DAILY_SHARE_LIMIT });
    }

    // Rule 3: strict device anti-fraud — max 3 shares per device per day across all accounts
    if (deviceId) {
      const [deviceCountRow] = await db
        .select({ cnt: count() })
        .from(beeSharesTable)
        .where(and(eq(beeSharesTable.deviceId, deviceId), eq(beeSharesTable.shareDate, today)));
      const deviceSharesToday = Number(deviceCountRow?.cnt ?? 0);
      if (deviceSharesToday >= DAILY_SHARE_LIMIT) {
        return void res.status(429).json({ success: false, error: "device_daily_limit", message: "وصل هذا الجهاز للحد الأقصى من المشاركات اليومية. تعود غداً! 🌙", dailyLimit: DAILY_SHARE_LIMIT });
      }
    }

    // Rule 4: same product already shared today (by this phone)
    const [alreadyToday] = await db
      .select({ id: beeSharesTable.id })
      .from(beeSharesTable)
      .where(and(
        eq(beeSharesTable.senderPhone, phone),
        eq(beeSharesTable.productId, productId),
        eq(beeSharesTable.shareDate, today),
      ))
      .limit(1);
    if (alreadyToday) {
      return void res.json({ success: false, error: "product_shared", message: "شاركت هذا المنتج اليوم مسبقاً. اختر منتجاً آخر!" });
    }

    // Rule 5: same recipient used yesterday
    const [sharedYesterday] = await db
      .select({ id: beeSharesTable.id })
      .from(beeSharesTable)
      .where(and(
        eq(beeSharesTable.senderPhone, phone),
        eq(beeSharesTable.recipientPhone, recipient),
        eq(beeSharesTable.shareDate, yesterday),
      ))
      .limit(1);
    if (sharedYesterday) {
      return void res.json({ success: false, error: "same_recipient_yesterday", message: "أرسلت لنفس الشخص أمس! لازم ترسل لغير شخص اليوم 😊" });
    }

    // All checks passed — record share and grant +10 bee
    const newBalance = visitor.beeBalance + 10;
    await db.update(storefrontVisitorsTable)
      .set({ beeBalance: newBalance })
      .where(eq(storefrontVisitorsTable.phone, phone));
    await db.insert(beeTransactionsTable).values({
      phone,
      amount: 10,
      reason: `share:whatsapp:${productId}`,
    });
    await db.insert(beeSharesTable).values({
      senderPhone: phone,
      recipientPhone: recipient,
      productId,
      shareDate: today,
      deviceId: deviceId ?? null,
    });

    return void res.json({ success: true, coinsEarned: 10, newBalance, sharesUsedToday: sharesUsedToday + 1, dailyLimit: DAILY_SHARE_LIMIT });
  } catch (err) {
    console.error("[bee] share error:", err);
    res.status(500).json({ error: "server error" });
  }
});

// ── GET /api/beqolky/bee/balances (admin) — bulk phone→balance lookup ─────────
router.get("/beqolky/bee/balances", async (req, res) => {
  const raw = req.query.phones as string;
  if (!raw) return void res.json({});
  const phones = raw.split(",").map(p => normalizePhone(p.trim())).filter(Boolean);
  if (phones.length === 0) return void res.json({});
  try {
    const rows = await db
      .select({ phone: storefrontVisitorsTable.phone, beeBalance: storefrontVisitorsTable.beeBalance })
      .from(storefrontVisitorsTable)
      .where(inArray(storefrontVisitorsTable.phone, phones));
    const map: Record<string, number> = {};
    for (const r of rows) map[r.phone] = r.beeBalance ?? 0;
    res.json(map);
  } catch (err) {
    res.status(500).json({ error: "server error" });
  }
});

// ── GET /api/beqolky/bee/redemptions (admin) ──────────────────────────────────
router.get("/beqolky/bee/redemptions", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(beeRedemptionsTable)
      .orderBy(desc(beeRedemptionsTable.requestedAt));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "server error" });
  }
});

// ── POST /api/beqolky/bee/redemptions/:id/approve (admin) ────────────────────
router.post("/beqolky/bee/redemptions/:id/approve", async (req, res) => {
  const id = parseInt(req.params.id);
  const { status, adminNote } = req.body as { status?: string; adminNote?: string };
  if (!["approved", "rejected"].includes(status || "")) {
    return void res.status(400).json({ error: "status must be approved or rejected" });
  }
  try {
    await db.update(beeRedemptionsTable)
      .set({ status: status!, adminNote: adminNote || null, reviewedAt: new Date() })
      .where(eq(beeRedemptionsTable.id, id));

    // If rejected, refund coins
    if (status === "rejected") {
      const [red] = await db.select().from(beeRedemptionsTable).where(eq(beeRedemptionsTable.id, id)).limit(1);
      if (red) {
        await db.update(storefrontVisitorsTable)
          .set({ beeBalance: sql`${storefrontVisitorsTable.beeBalance} + ${red.coinsDeducted}` })
          .where(eq(storefrontVisitorsTable.phone, red.phone));
        await db.insert(beeTransactionsTable).values({
          phone: red.phone,
          amount: red.coinsDeducted,
          reason: "refund_rejected_redemption",
        });
      }
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "server error" });
  }
});

// ── GET /api/beqolky/bee/settings (admin) ─────────────────────────────────────
router.get("/beqolky/bee/settings", async (_req, res) => {
  try {
    const s = await getBeeSettings();
    res.json(s);
  } catch (err) {
    res.status(500).json({ error: "server error" });
  }
});

// ── PUT /api/beqolky/bee/settings (admin) ─────────────────────────────────────
router.put("/beqolky/bee/settings", async (req, res) => {
  const { beeEnabled, redeemThreshold, redeemIqd, notes } = req.body as {
    beeEnabled?: boolean; redeemThreshold?: number; redeemIqd?: number; notes?: string;
  };
  try {
    const updates: Record<string, any> = {};
    if (beeEnabled !== undefined) updates.beeEnabled = beeEnabled;
    if (redeemThreshold !== undefined && redeemThreshold > 0) updates.beeRedeemThreshold = redeemThreshold;
    if (redeemIqd !== undefined && redeemIqd >= 0) updates.beeRedeemValueIqd = redeemIqd;
    if (notes !== undefined) updates.beeNotes = notes.trim() || null;

    if (Object.keys(updates).length === 0) {
      return void res.status(400).json({ error: "no valid fields" });
    }

    await db.update(settingsTable).set(updates);
    const s = await getBeeSettings();
    res.json({ success: true, ...s });
  } catch (err) {
    res.status(500).json({ error: "server error" });
  }
});

export default router;
