import { pgTable, serial, boolean, text, timestamp } from "drizzle-orm/pg-core";

export const storefrontThemesTable = pgTable("storefront_themes", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  isActive: boolean("is_active").notNull().default(false),
  isBuiltin: boolean("is_builtin").notNull().default(false),
  config: text("config").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type StorefrontTheme = typeof storefrontThemesTable.$inferSelect;
export type InsertStorefrontTheme = typeof storefrontThemesTable.$inferInsert;
