import { pgTable, serial, text, boolean, timestamp, integer } from "drizzle-orm/pg-core";

export const botTrainingNotesTable = pgTable("bot_training_notes", {
  id: serial("id").primaryKey(),
  note: text("note").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type BotTrainingNote = typeof botTrainingNotesTable.$inferSelect;

export const trainingMessagesTable = pgTable("training_messages", {
  id: serial("id").primaryKey(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type TrainingMessage = typeof trainingMessagesTable.$inferSelect;

// Tracks which conversations have already been analyzed via bot-training/learn
export const botTrainingConvHistoryTable = pgTable("bot_training_conv_history", {
  id: serial("id").primaryKey(),
  conversationId: text("conversation_id").notNull().unique(),
  senderName: text("sender_name"),
  platform: text("platform"),
  algorithmsExtracted: integer("algorithms_extracted").notNull().default(0),
  analyzedAt: timestamp("analyzed_at").notNull().defaultNow(),
});

export type BotTrainingConvHistory = typeof botTrainingConvHistoryTable.$inferSelect;
