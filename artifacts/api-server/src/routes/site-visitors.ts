import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { siteBansTable, storefrontUsersTable, storefrontIpVisitsTable, storefrontVisitorsTable } from "@workspace/db/schema";
import { eq, sql, desc } from "drizzle-orm";

const router: IRouter = Router();

// ── GET /api/beqolky/site-visitors — unified list of all visitors ────────────
router.get("/beqolky/site-visitors", async (_req, res) => {
  try {
    // 1. Anonymous visitors — unique by visitor_id
    const anonRows = await db.execute(sql`
      SELECT
        visitor_id            AS "visitorId",
        MAX(ip)               AS ip,
        MAX(governorate)      AS governorate,
        MAX(city)             AS city,
        COUNT(*)::int         AS "visitCount",
        MIN(visited_at)       AS "firstVisit",
        MAX(visited_at)       AS "lastVisit",
        MAX(user_agent)       AS "userAgent"
      FROM storefront_ip_visits
      GROUP BY visitor_id
      ORDER BY MAX(visited_at) DESC
      LIMIT 500
    `);

    // 2. Registered users
    const users = await db
      .select({
        id: storefrontUsersTable.id,
        name: storefrontUsersTable.name,
        email: storefrontUsersTable.email,
        whatsapp: storefrontUsersTable.whatsapp,
        googleId: storefrontUsersTable.googleId,
        createdAt: storefrontUsersTable.createdAt,
      })
      .from(storefrontUsersTable)
      .orderBy(desc(storefrontUsersTable.createdAt))
      .limit(500);

    // 2b. Storefront visitors (phone-based, bee coins, fortune wheel)
    const storeVisitors = await db
      .select({
        id: storefrontVisitorsTable.id,
        phone: storefrontVisitorsTable.phone,
        name: storefrontVisitorsTable.name,
        visitCount: storefrontVisitorsTable.visitCount,
        totalTimeSpent: storefrontVisitorsTable.totalTimeSpent,
        beeBalance: storefrontVisitorsTable.beeBalance,
        firstVisitAt: storefrontVisitorsTable.firstVisitAt,
        lastVisitAt: storefrontVisitorsTable.lastVisitAt,
      })
      .from(storefrontVisitorsTable)
      .orderBy(desc(storefrontVisitorsTable.lastVisitAt))
      .limit(500);

    // 3. Active bans
    const bans = await db.select().from(siteBansTable).orderBy(desc(siteBansTable.bannedAt));

    const bannedValues = new Set(bans.map(b => b.value));

    const anonymous = (anonRows.rows as any[]).map(r => ({
      kind: "anonymous" as const,
      visitorId: r.visitorId,
      ip: r.ip,
      governorate: r.governorate,
      city: r.city,
      visitCount: r.visitCount,
      firstVisit: r.firstVisit,
      lastVisit: r.lastVisit,
      userAgent: r.userAgent,
      banned: bannedValues.has(r.visitorId) || bannedValues.has(r.ip),
    }));

    const registered = users.map(u => {
      const method = u.whatsapp ? "whatsapp" : u.googleId ? "google" : u.email ? "email" : "unknown";
      const banKey = u.whatsapp || u.email || "";
      return {
        kind: "registered" as const,
        id: u.id,
        name: u.name || "—",
        email: u.email,
        whatsapp: u.whatsapp,
        method,
        createdAt: u.createdAt,
        banned: bannedValues.has(banKey),
      };
    });

    const storeVisitorsMapped = storeVisitors.map(sv => ({
      kind: "store_visitor" as const,
      id: sv.id,
      phone: sv.phone,
      name: sv.name || "—",
      visitCount: sv.visitCount,
      totalTimeSpent: sv.totalTimeSpent,
      beeBalance: sv.beeBalance,
      firstVisitAt: sv.firstVisitAt,
      lastVisitAt: sv.lastVisitAt,
      banned: bannedValues.has(sv.phone),
    }));

    res.json({ anonymous, registered, storeVisitors: storeVisitorsMapped, bans });
  } catch (err: any) {
    console.error("[SITE_VISITORS]", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── DELETE /api/beqolky/site-visitors/reset — clear all anonymous visit data ──
router.delete("/beqolky/site-visitors/reset", async (_req, res) => {
  try {
    await db.execute(sql`TRUNCATE TABLE storefront_ip_visits`);
    res.json({ success: true });
  } catch (err: any) {
    console.error("[SITE_VISITORS_RESET]", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/beqolky/site-bans — list all bans ───────────────────────────────
router.get("/beqolky/site-bans", async (_req, res) => {
  try {
    const bans = await db.select().from(siteBansTable).orderBy(desc(siteBansTable.bannedAt));
    res.json(bans);
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/beqolky/site-bans — add a ban ─────────────────────────────────
router.post("/beqolky/site-bans", async (req, res) => {
  try {
    const { type, value, reason = "" } = req.body as { type?: string; value?: string; reason?: string };
    if (!type || !value) return void res.status(400).json({ error: "type و value مطلوبان" });
    const allowed = ["visitor_id", "ip", "phone", "email"];
    if (!allowed.includes(type)) return void res.status(400).json({ error: "نوع الحظر غير صالح" });

    const [row] = await db
      .insert(siteBansTable)
      .values({ type, value: value.trim(), reason })
      .onConflictDoUpdate({ target: siteBansTable.value, set: { type, reason } })
      .returning();
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: "Server error" });
  }
});

// ── DELETE /api/beqolky/site-bans/:id — remove a ban ────────────────────────
router.delete("/beqolky/site-bans/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(siteBansTable).where(eq(siteBansTable.id, id));
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
