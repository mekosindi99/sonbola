import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const storefrontVisitorsTable = pgTable("storefront_visitors", {
  id: serial("id").primaryKey(),
  phone: text("phone").notNull().unique(),
  name: text("name").notNull().default(""),
  visitCount: integer("visit_count").notNull().default(1),
  totalTimeSpent: integer("total_time_spent").notNull().default(0),
  beeBalance: integer("bee_balance").notNull().default(0),
  lastCheckin: timestamp("last_checkin"),
  firstVisitAt: timestamp("first_visit_at").notNull().defaultNow(),
  lastVisitAt: timestamp("last_visit_at").notNull().defaultNow(),
  lastFortuneSpin: text("last_fortune_spin"),
  lastFortuneItemId: integer("last_fortune_item_id"),
  lastFortuneCoupon: text("last_fortune_coupon"),
  lastFortuneDevice: text("last_fortune_device"),
});

export type StorefrontVisitor = typeof storefrontVisitorsTable.$inferSelect;
