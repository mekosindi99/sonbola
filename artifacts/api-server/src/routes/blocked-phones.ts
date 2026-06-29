import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { blockedPhonesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

// Normalize Iraqi phone number to 10-digit local form (e.g. 7701234567)
export function normalizePhone(raw: string): string {
  let p = raw.replace(/\D/g, ""); // digits only
  // Remove country codes
  if (p.startsWith("00964")) p = p.slice(5);
  else if (p.startsWith("964")) p = p.slice(3);
  // Remove leading 0
  if (p.startsWith("0")) p = p.slice(1);
  return p;
}

// GET /api/beqolky/blocked-phones — list all
router.get("/beqolky/blocked-phones", async (req, res) => {
  try {
    const rows = await db.select().from(blockedPhonesTable).orderBy(blockedPhonesTable.createdAt);
    res.json(rows.reverse());
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/beqolky/blocked-phones — add block
router.post("/beqolky/blocked-phones", async (req, res) => {
  try {
    const { phone, reason = "" } = req.body as { phone?: string; reason?: string };
    if (!phone) return void res.status(400).json({ error: "رقم الهاتف مطلوب" });
    const normalized = normalizePhone(phone);
    if (normalized.length < 9) return void res.status(400).json({ error: "رقم غير صالح" });
    const [row] = await db
      .insert(blockedPhonesTable)
      .values({ phone: normalized, reason })
      .onConflictDoUpdate({ target: blockedPhonesTable.phone, set: { reason } })
      .returning();
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE /api/beqolky/blocked-phones/:id — remove block
router.delete("/beqolky/blocked-phones/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(blockedPhonesTable).where(eq(blockedPhonesTable.id, id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
