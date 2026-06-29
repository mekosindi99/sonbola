import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const botFlowsTable = pgTable("bot_flows", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().default("فلو جديد"),
  nodes: text("nodes").notNull().default("[]"),
  edges: text("edges").notNull().default("[]"),
  isActive: boolean("is_active").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type BotFlow = typeof botFlowsTable.$inferSelect;
