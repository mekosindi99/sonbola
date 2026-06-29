import { Router } from "express";
import webpush from "web-push";
import { db } from "@workspace/db";
import { pushSubscriptionsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
const router = Router();

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY!;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY!;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@sonbola.shop";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

// ─── Public: get VAPID public key ─────────────────────────────────────────────
router.get("/push/vapid-public-key", (_req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY || null });
});

// ─── Public: subscribe (called from storefront) ────────────────────────────────
router.post("/push/subscribe", async (req, res) => {
  try {
    const { endpoint, keys } = req.body as {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    };
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: "invalid subscription" });
    }
    const userAgent = req.headers["user-agent"] || null;
    await db
      .insert(pushSubscriptionsTable)
      .values({ endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent })
      .onConflictDoUpdate({
        target: pushSubscriptionsTable.endpoint,
        set: { p256dh: keys.p256dh, auth: keys.auth, userAgent },
      });
    res.json({ ok: true });
  } catch (err) {
    console.error("[push/subscribe]", err);
    res.status(500).json({ error: "failed to subscribe" });
  }
});

// ─── Public: unsubscribe ───────────────────────────────────────────────────────
router.post("/push/unsubscribe", async (req, res) => {
  try {
    const { endpoint } = req.body as { endpoint: string };
    if (!endpoint) return res.status(400).json({ error: "endpoint required" });
    await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.endpoint, endpoint));
    res.json({ ok: true });
  } catch (err) {
    console.error("[push/unsubscribe]", err);
    res.status(500).json({ error: "failed to unsubscribe" });
  }
});

// ─── Admin: send push notification to all subscribers ─────────────────────────
router.post("/push/send", async (req, res) => {
  try {
    const { title, body, url } = req.body as {
      title: string;
      body: string;
      url?: string;
    };
    if (!title || !body) return res.status(400).json({ error: "title and body required" });

    const subs = await db.select().from(pushSubscriptionsTable);
    if (subs.length === 0) return res.json({ sent: 0, failed: 0 });

    const payload = JSON.stringify({ title, body, url: url || "/" });
    let sent = 0;
    let failed = 0;
    const staleEndpoints: string[] = [];

    await Promise.allSettled(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          );
          sent++;
        } catch (err: any) {
          failed++;
          // 404 / 410 = subscription expired, remove it
          if (err.statusCode === 404 || err.statusCode === 410) {
            staleEndpoints.push(sub.endpoint);
          }
        }
      })
    );

    // Clean up stale subscriptions
    for (const ep of staleEndpoints) {
      await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.endpoint, ep));
    }

    res.json({ sent, failed, total: subs.length });
  } catch (err) {
    console.error("[push/send]", err);
    res.status(500).json({ error: "failed to send" });
  }
});

// ─── Admin: get subscriber count ──────────────────────────────────────────────
router.get("/push/subscribers", async (_req, res) => {
  try {
    const subs = await db.select({ id: pushSubscriptionsTable.id }).from(pushSubscriptionsTable);
    res.json({ count: subs.length });
  } catch (err) {
    res.status(500).json({ error: "failed" });
  }
});

export default router;
