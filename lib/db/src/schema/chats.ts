import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const chatConversationsTable = pgTable("chat_conversations", {
  id: text("id").primaryKey(),
  platform: text("platform").notNull(),
  senderId: text("sender_id").notNull(),
  senderName: text("sender_name"),
  lastMessage: text("last_message"),
  lastMessageAt: timestamp("last_message_at"),
  unreadCount: integer("unread_count").notNull().default(0),
  status: text("status").notNull().default("active"),
  hasBooking: boolean("has_booking").notNull().default(false),
  isEscalated: boolean("is_escalated").notNull().default(false),
  leadScore: integer("lead_score").notNull().default(0),
  leadCategory: text("lead_category").notNull().default("unknown"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  welcomeFlowSent: boolean("welcome_flow_sent").notNull().default(false),
});

export const chatMessagesTable = pgTable("chat_messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  imageUrl: text("image_url"),
  mid: text("mid").unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertChatConversationSchema = createInsertSchema(chatConversationsTable).omit({ createdAt: true, updatedAt: true });
export const insertChatMessageSchema = createInsertSchema(chatMessagesTable).omit({ createdAt: true });
export type InsertChatConversation = z.infer<typeof insertChatConversationSchema>;
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatConversation = typeof chatConversationsTable.$inferSelect;
export type ChatMessage = typeof chatMessagesTable.$inferSelect;
