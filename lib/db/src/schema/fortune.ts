import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const fortuneItemsTable = pgTable("fortune_items", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  type: text("type").notNull().default("message"),
  value: integer("value").notNull().default(0),
  weight: integer("weight").notNull().default(10),
  emoji: text("emoji").notNull().default("🎁"),
  color: text("color").notNull().default("#f59e0b"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type FortuneItem = typeof fortuneItemsTable.$inferSelect;
export type InsertFortuneItem = typeof fortuneItemsTable.$inferInsert;
