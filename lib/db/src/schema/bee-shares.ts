import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const beeSharesTable = pgTable("bee_shares", {
  id: serial("id").primaryKey(),
  senderPhone: text("sender_phone").notNull(),
  recipientPhone: text("recipient_phone").notNull(),
  productId: text("product_id").notNull(),
  shareDate: text("share_date").notNull(),
  deviceId: text("device_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type BeeShare = typeof beeSharesTable.$inferSelect;
