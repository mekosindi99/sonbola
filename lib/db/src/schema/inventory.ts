import { pgTable, serial, text, integer, numeric, boolean, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const inventoryTable = pgTable("inventory", {
  id: serial("id").primaryKey(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
  productId: text("product_id").notNull().unique(),
  category: text("category").notNull(),
  gender: text("gender").notNull().default("both"),
  season: text("season").notNull().default("all"),
  ageMin: real("age_min").notNull().default(1),
  ageMax: real("age_max").notNull().default(4),
  ageRanges: text("age_ranges"),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  stock: integer("stock").notNull().default(0),
  colors: text("colors"),
  parentProductId: text("parent_product_id"),
  colorVariantName: text("color_variant_name"),
  descriptionAr: text("description_ar"),
  descriptionEn: text("description_en"),
  imageUrl: text("image_url"),
  publicImageUrl: text("public_image_url"),
  available: boolean("available").notNull().default(true),
  discountPrice: numeric("discount_price", { precision: 10, scale: 2 }),
  isOnSale: boolean("is_on_sale").notNull().default(false),
  viewCount: integer("view_count").notNull().default(0),
  botSendCount: integer("bot_send_count").notNull().default(0),
  favoriteCount: integer("favorite_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertInventorySchema = createInsertSchema(inventoryTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertInventory = z.infer<typeof insertInventorySchema>;
export type InventoryItem = typeof inventoryTable.$inferSelect;
