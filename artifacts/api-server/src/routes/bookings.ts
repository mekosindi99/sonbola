import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { bookingsTable } from "@workspace/db/schema";
import { settingsTable } from "@workspace/db/schema";
import { eq, and, SQL, sql, desc, inArray } from "drizzle-orm";

const router: IRouter = Router();

router.get("/bookings", async (req, res) => {
  try {
    const { status, starred, source, platform } = req.query as { status?: string; starred?: string; source?: string; platform?: string };
    const conditions: SQL[] = [];

    if (status && status !== "all") {
      conditions.push(eq(bookingsTable.status, status));
    }
    if (starred !== undefined) {
      conditions.push(eq(bookingsTable.starred, starred === "true"));
    }
    // platform param takes precedence over source for exact platform match
    if (platform) {
      conditions.push(eq(bookingsTable.platform, platform));
    } else if (source === "facebook") {
      // source=facebook → facebook + instagram platform bookings (from bot)
      conditions.push(inArray(bookingsTable.platform, ["facebook", "instagram"]));
    } else if (source === "storefront") {
      conditions.push(eq(bookingsTable.platform, "storefront"));
    }

    const bookings = conditions.length > 0
      ? await db.select().from(bookingsTable).where(and(...conditions)).orderBy(desc(bookingsTable.id))
      : await db.select().from(bookingsTable).orderBy(desc(bookingsTable.id));

    const formatted = bookings.map(b => ({
      ...b,
      totalAmount: b.totalAmount ? parseFloat(b.totalAmount as unknown as string) : null,
    }));

    res.json(formatted);
  } catch (err) {
    req.log.error({ err }, "Failed to get bookings");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/bookings/stats/provinces", async (req, res) => {
  try {
    const rows = await db
      .select({
        governorate: bookingsTable.governorate,
        total: sql<number>`count(*)::int`,
        fromBot: sql<number>`count(*) filter (where platform in ('facebook','instagram'))::int`,
        fromStorefront: sql<number>`count(*) filter (where platform = 'storefront')::int`,
        totalAmount: sql<number>`coalesce(sum(total_amount::numeric), 0)::numeric`,
        pending: sql<number>`count(*) filter (where status = 'pending')::int`,
        completed: sql<number>`count(*) filter (where status = 'completed')::int`,
        cancelled: sql<number>`count(*) filter (where status = 'cancelled')::int`,
      })
      .from(bookingsTable)
      .groupBy(bookingsTable.governorate)
      .orderBy(desc(sql`count(*)`));

    res.json(rows.map(r => ({
      ...r,
      total: Number(r.total),
      fromBot: Number(r.fromBot),
      fromStorefront: Number(r.fromStorefront),
      totalAmount: parseFloat(String(r.totalAmount)),
      pending: Number(r.pending),
      completed: Number(r.completed),
      cancelled: Number(r.cancelled),
    })));
  } catch (err) {
    req.log.error({ err }, "Failed to get province booking stats");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/bookings/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const rows = await db.select().from(bookingsTable).where(eq(bookingsTable.id, id));
    if (rows.length === 0) return void res.status(404).json({ error: "Not found" });
    const b = rows[0];
    res.json({ ...b, totalAmount: b.totalAmount ? parseFloat(b.totalAmount as unknown as string) : null });
  } catch (err) {
    req.log.error({ err }, "Failed to get booking");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/bookings/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = req.body;

    const updated = await db.update(bookingsTable).set({
      ...(body.status !== undefined && { status: body.status }),
      ...(body.starred !== undefined && { starred: body.starred }),
      ...(body.notes !== undefined && { notes: body.notes }),
      ...(body.receiptToken !== undefined && { receiptToken: body.receiptToken }),
      ...(body.deliveryCost !== undefined && { deliveryCost: body.deliveryCost }),
      updatedAt: new Date(),
    }).where(eq(bookingsTable.id, id)).returning();

    if (updated.length === 0) return void res.status(404).json({ error: "Not found" });
    const b = updated[0];
    res.json({ ...b, totalAmount: b.totalAmount ? parseFloat(b.totalAmount as unknown as string) : null });
  } catch (err) {
    req.log.error({ err }, "Failed to update booking");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/bookings/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const deleted = await db.delete(bookingsTable).where(eq(bookingsTable.id, id)).returning({ id: bookingsTable.id });
    if (deleted.length === 0) return void res.status(404).json({ error: "Not found" });
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete booking");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Public receipt endpoint (no auth) ──────────────────────────────────────
const ORDER_OFFSET = 873;

router.get("/public/receipt/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.receiptToken, token)).limit(1);
    if (!booking) return void res.status(404).json({ error: "Receipt not found" });

    const platformLabel = booking.platform === 'instagram' ? 'انستقرام' : 'فيسبوك';
    const platformIcon = booking.platform === 'instagram' ? '📷' : '📘';

    res.json({
      booking: {
        ...booking,
        totalAmount: booking.totalAmount ? parseFloat(booking.totalAmount as unknown as string) : null,
        deliveryCost: booking.deliveryCost ? parseFloat(booking.deliveryCost as unknown as string) : null,
      },
      store: {
        name: 'Sonbola.baby',
        code: '20947',
      },
      orderNumber: booking.id + ORDER_OFFSET,
      platformLabel,
      platformIcon,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get public receipt");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/test-telegram-profile — send latest customer profile to Telegram for testing
router.post("/test-telegram-profile", async (req, res) => {
  try {
    const [settings] = await db.select().from(settingsTable).limit(1);
    if (!settings?.telegramBotToken || !settings?.telegramChatId || !settings?.metaAccessToken) {
      return res.status(400).json({ error: "Missing Telegram/Meta settings" });
    }

    // Get most recent booking with a sender ID
    const [latest] = await db.select({ senderId: bookingsTable.senderId, id: bookingsTable.id })
      .from(bookingsTable)
      .orderBy(desc(bookingsTable.id))
      .limit(1);

    if (!latest?.senderId) {
      return res.status(404).json({ error: "No bookings found" });
    }

    // Fetch FB profile
    const profileUrl = `https://graph.facebook.com/${latest.senderId}?fields=name,profile_pic&access_token=${settings.metaAccessToken}`;
    const profileRes = await fetch(profileUrl, { signal: AbortSignal.timeout(10_000) });
    const profileData = await profileRes.json() as any;

    const name = profileData.name ?? null;
    const profilePicUrl = profileData.profile_pic ?? null;

    if (!profilePicUrl) {
      return res.status(404).json({ error: "Could not fetch profile picture", profileData });
    }

    // Send to Telegram
    const caption = name
      ? `👤 <b>${name}</b>\n🆔 PSID: <code>${latest.senderId}</code>\n📋 طلب #${(latest.id || 0) + 873}\n\n[صورة تجريبية]`
      : `👤 PSID: <code>${latest.senderId}</code>\n[صورة تجريبية]`;

    const tgUrl = `https://api.telegram.org/bot${settings.telegramBotToken}/sendPhoto`;
    const tgRes = await fetch(tgUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: settings.telegramChatId, photo: profilePicUrl, caption, parse_mode: "HTML" }),
      signal: AbortSignal.timeout(15_000),
    });
    const tgData = await tgRes.json() as any;

    res.json({ ok: tgData.ok, name, profilePicUrl, senderId: latest.senderId });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

export default router;
