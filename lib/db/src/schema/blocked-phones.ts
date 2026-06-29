import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const blockedPhonesTable = pgTable("blocked_phones", {
  id: serial("id").primaryKey(),
  phone: text("phone").notNull().unique(),
  reason: text("reason").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
