import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const storefrontUsersTable = pgTable("storefront_users", {
  id: serial("id").primaryKey(),
  name: text("name"),
  email: text("email").unique(),
  passwordHash: text("password_hash"),
  googleId: text("google_id").unique(),
  whatsapp: text("whatsapp").unique(),
  avatarUrl: text("avatar_url"),
  whatsappOtp: text("whatsapp_otp"),
  whatsappOtpExpiry: timestamp("whatsapp_otp_expiry"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type StorefrontUser = typeof storefrontUsersTable.$inferSelect;
export type InsertStorefrontUser = typeof storefrontUsersTable.$inferInsert;
