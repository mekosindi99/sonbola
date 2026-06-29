import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  settingsTable,
  inventoryTable,
  bookingsTable,
  chatConversationsTable,
  chatMessagesTable,
} from "@workspace/db/schema";
import { eq, count, sql, gte } from "drizzle-orm";

const router: IRouter = Router();

router.get("/stats", async (req, res) => {
  try {
    const [settingsRows, totalConvRows, activeConvRows, escalatedRows,
      totalBookingRows, pendingBookingRows, completedBookingRows, totalInventoryRows] = await Promise.all([
      db.select().from(settingsTable).limit(1),
      db.select({ count: count() }).from(chatConversationsTable),
      db.select({ count: count() }).from(chatConversationsTable).where(eq(chatConversationsTable.status, "active")),
      db.select({ count: count() }).from(chatConversationsTable).where(eq(chatConversationsTable.isEscalated, true)),
      db.select({ count: count() }).from(bookingsTable),
      db.select({ count: count() }).from(bookingsTable).where(eq(bookingsTable.status, "pending")),
      db.select({ count: count() }).from(bookingsTable).where(eq(bookingsTable.status, "completed")),
      db.select({ count: count() }).from(inventoryTable),
    ]);

    const settings = settingsRows[0];

    res.json({
      totalConversations: Number(totalConvRows[0]?.count ?? 0),
      activeConversations: Number(activeConvRows[0]?.count ?? 0),
      totalBookings: Number(totalBookingRows[0]?.count ?? 0),
      pendingBookings: Number(pendingBookingRows[0]?.count ?? 0),
      completedBookings: Number(completedBookingRows[0]?.count ?? 0),
      totalInventoryItems: Number(totalInventoryRows[0]?.count ?? 0),
      botEnabled: settings?.botEnabled ?? false,
      schedulerEnabled: settings?.schedulerEnabled ?? false,
      escalatedConversations: Number(escalatedRows[0]?.count ?? 0),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get stats");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Daily message counts for the last 7 days
router.get("/stats/daily", async (req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT
        TO_CHAR(DATE(created_at AT TIME ZONE 'Asia/Baghdad'), 'YYYY-MM-DD') AS day,
        COUNT(*)::int AS msgs
      FROM chat_messages
      WHERE
        role = 'user'
        AND created_at >= NOW() - INTERVAL '7 days'
      GROUP BY day
      ORDER BY day ASC
    `);

    // Build last 7 days array with zeros for missing days
    const dayNames: Record<string, string> = {
      '0': 'الأحد', '1': 'الاثنين', '2': 'الثلاثاء', '3': 'الأربعاء',
      '4': 'الخميس', '5': 'الجمعة', '6': 'السبت',
    };
    const map: Record<string, number> = {};
    for (const row of rows.rows as { day: string; msgs: number }[]) {
      map[row.day] = row.msgs;
    }

    const result = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const dayNum = d.getDay().toString();
      result.push({ name: dayNames[dayNum], msgs: map[key] || 0 });
    }

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to get daily stats");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
