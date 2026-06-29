import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const savedRepliesTable = pgTable("saved_replies", {
  id: serial("id").primaryKey(),
  titleAr: text("title_ar").notNull(),
  titleEn: text("title_en").notNull(),
  triggerKeywords: text("trigger_keywords"),
  replyAr: text("reply_ar").notNull(),
  replyEn: text("reply_en").notNull(),
  category: text("category").notNull().default("general"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSavedReplySchema = createInsertSchema(savedRepliesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSavedReply = z.infer<typeof insertSavedReplySchema>;
export type SavedReply = typeof savedRepliesTable.$inferSelect;
