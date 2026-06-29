import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const beeTransactionsTable = pgTable("bee_transactions", {
  id: serial("id").primaryKey(),
  phone: text("phone").notNull(),
  amount: integer("amount").notNull(),
  reason: text("reason").notNull(),
  deviceId: text("device_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const beeRedemptionsTable = pgTable("bee_redemptions", {
  id: serial("id").primaryKey(),
  phone: text("phone").notNull(),
  name: text("name").notNull().default(""),
  coinsDeducted: integer("coins_deducted").notNull().default(1000),
  discountAmount: integer("discount_amount").notNull().default(2000),
  couponCode: text("coupon_code").notNull(),
  status: text("status").notNull().default("pending"),
  adminNote: text("admin_note"),
  requestedAt: timestamp("requested_at").notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
});

export type BeeTransaction = typeof beeTransactionsTable.$inferSelect;
export type BeeRedemption = typeof beeRedemptionsTable.$inferSelect;
