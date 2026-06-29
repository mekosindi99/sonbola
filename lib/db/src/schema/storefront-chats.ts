import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const storefrontChatsTable = pgTable("storefront_chats", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().default("زائر"),
  phone: text("phone").notNull(),
  sessionId: text("session_id"),
  messages: text("messages").notNull().default("[]"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertStorefrontChatSchema = createInsertSchema(storefrontChatsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertStorefrontChat = z.infer<typeof insertStorefrontChatSchema>;
export type StorefrontChat = typeof storefrontChatsTable.$inferSelect;
