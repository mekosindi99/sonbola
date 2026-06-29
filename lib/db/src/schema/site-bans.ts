import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const siteBansTable = pgTable("site_bans", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // 'visitor_id' | 'ip' | 'phone' | 'email'
  value: text("value").notNull().unique(),
  reason: text("reason").notNull().default(""),
  bannedAt: timestamp("banned_at").notNull().defaultNow(),
});

export type SiteBan = typeof siteBansTable.$inferSelect;
