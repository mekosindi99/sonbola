import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const storefrontIpVisitsTable = pgTable("storefront_ip_visits", {
  id: serial("id").primaryKey(),
  visitorId: text("visitor_id").notNull(),
  ip: text("ip").notNull().default(""),
  governorate: text("governorate").notNull().default("غير معروف"),
  city: text("city").notNull().default(""),
  country: text("country").notNull().default("IQ"),
  userAgent: text("user_agent").notNull().default(""),
  visitedAt: timestamp("visited_at").notNull().defaultNow(),
});

export type StorefrontIpVisit = typeof storefrontIpVisitsTable.$inferSelect;
