import { pgTable, serial, text, boolean, numeric, json, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const bookingsTable = pgTable("bookings", {
  id: serial("id").primaryKey(),
  platform: text("platform").notNull(),
  senderId: text("sender_id").notNull(),
  senderName: text("sender_name"),
  phoneNumber: text("phone_number").notNull(),
  governorate: text("governorate").notNull(),
  fullAddress: text("full_address").notNull(),
  items: json("items").notNull().default([]),
  status: text("status").notNull().default("pending"),
  starred: boolean("starred").notNull().default(false),
  totalAmount: numeric("total_amount", { precision: 10, scale: 2 }),
  notes: text("notes"),
  productImageUrl: text("product_image_url"),
  receiptImageUrl: text("receipt_image_url"),
  senderProfilePicUrl: text("sender_profile_pic_url"),
  receiptToken: text("receipt_token"),
  deliveryCost: numeric("delivery_cost", { precision: 10, scale: 2 }),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertBookingSchema = createInsertSchema(bookingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBooking = z.infer<typeof insertBookingSchema>;
export type Booking = typeof bookingsTable.$inferSelect;
