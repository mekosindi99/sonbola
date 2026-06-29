import { pgTable, serial, text, integer, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const botSuggestionsTable = pgTable("bot_suggestions", {
  id: serial("id").primaryKey(),
  imageUrl: text("image_url").notNull(),
  label: text("label"),
  ageMinMonths: integer("age_min_months").notNull().default(0),
  ageMaxMonths: integer("age_max_months").notNull().default(144),
  price: numeric("price", { precision: 10, scale: 2 }).notNull().default("0"),
  isAvailable: boolean("is_available").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertBotSuggestionSchema = createInsertSchema(botSuggestionsTable).omit({ id: true, createdAt: true });
export type InsertBotSuggestion = z.infer<typeof insertBotSuggestionSchema>;
export type BotSuggestion = typeof botSuggestionsTable.$inferSelect;
