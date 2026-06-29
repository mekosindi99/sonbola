import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  settingsTable,
  inventoryTable,
  savedRepliesTable,
  botTrainingNotesTable,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

// ── EXPORT: dump all data as JSON ─────────────────────────────────────────────
router.get("/beqolky/export", async (req, res) => {
  try {
    const [settings, inventory, savedReplies, trainingNotes] = await Promise.all([
      db.select().from(settingsTable).limit(1),
      db.select().from(inventoryTable),
      db.select().from(savedRepliesTable),
      db.select().from(botTrainingNotesTable),
    ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      version: 1,
      settings: settings[0] ?? null,
      inventory,
      savedReplies,
      trainingNotes,
    };

    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="business-suite-backup-${Date.now()}.json"`
    );
    res.status(200).json(payload);
  } catch (err) {
    req.log.error({ err }, "Export failed");
    res.status(500).json({ error: "Export failed" });
  }
});

// ── IMPORT: restore all data from JSON ───────────────────────────────────────
router.post("/beqolky/import", async (req, res) => {
  try {
    const body = req.body;

    if (!body || typeof body !== "object" || body.version !== 1) {
      return res.status(400).json({ error: "Invalid backup file" });
    }

    const results: Record<string, string> = {};

    // Settings
    if (body.settings && typeof body.settings === "object") {
      const s = body.settings;
      const existing = await db.select().from(settingsTable).limit(1);
      if (existing.length === 0) {
        await db.insert(settingsTable).values({
          botEnabled: s.botEnabled ?? false,
          schedulerEnabled: s.schedulerEnabled ?? false,
          scheduleStart: s.scheduleStart ?? "12:00",
          scheduleEnd: s.scheduleEnd ?? "17:00",
          ageFilterMin: s.ageFilterMin ?? 1,
          ageFilterMax: s.ageFilterMax ?? 4,
          customAgeFilter: s.customAgeFilter ?? null,
          facebookPageId: s.facebookPageId ?? null,
          instagramAccountId: s.instagramAccountId ?? null,
          metaAccessToken: s.metaAccessToken ?? null,
          whatsappAdminNumber: s.whatsappAdminNumber ?? null,
          webhookVerifyToken: s.webhookVerifyToken ?? null,
          language: s.language ?? "both",
        });
      } else {
        await db.update(settingsTable).set({
          botEnabled: s.botEnabled ?? false,
          schedulerEnabled: s.schedulerEnabled ?? false,
          scheduleStart: s.scheduleStart ?? "12:00",
          scheduleEnd: s.scheduleEnd ?? "17:00",
          ageFilterMin: s.ageFilterMin ?? 1,
          ageFilterMax: s.ageFilterMax ?? 4,
          customAgeFilter: s.customAgeFilter ?? null,
          facebookPageId: s.facebookPageId ?? null,
          instagramAccountId: s.instagramAccountId ?? null,
          metaAccessToken: s.metaAccessToken ?? null,
          whatsappAdminNumber: s.whatsappAdminNumber ?? null,
          webhookVerifyToken: s.webhookVerifyToken ?? null,
          language: s.language ?? "both",
          updatedAt: new Date(),
        }).where(eq(settingsTable.id, existing[0].id));
      }
      results.settings = "restored";
    }

    // Inventory — clear then re-insert
    if (Array.isArray(body.inventory) && body.inventory.length > 0) {
      await db.delete(inventoryTable);
      const rows = body.inventory.map((item: any) => ({
        nameAr: item.nameAr ?? "",
        nameEn: item.nameEn ?? "",
        productId: item.productId ?? "",
        category: item.category ?? "summer",
        gender: item.gender ?? "both",
        ageMin: item.ageMin ?? 1,
        ageMax: item.ageMax ?? 4,
        ageRanges: item.ageRanges ?? null,
        price: item.price ?? "0",
        stock: item.stock ?? 0,
        descriptionAr: item.descriptionAr ?? null,
        descriptionEn: item.descriptionEn ?? null,
        imageUrl: item.imageUrl ?? null,
        publicImageUrl: item.publicImageUrl ?? null,
        available: item.available ?? true,
      }));
      await db.insert(inventoryTable).values(rows);
      results.inventory = `${rows.length} items restored`;
    }

    // Saved replies — clear then re-insert
    if (Array.isArray(body.savedReplies) && body.savedReplies.length > 0) {
      await db.delete(savedRepliesTable);
      const rows = body.savedReplies.map((sr: any) => ({
        titleAr: sr.titleAr ?? "",
        titleEn: sr.titleEn ?? "",
        triggerKeywords: sr.triggerKeywords ?? null,
        replyAr: sr.replyAr ?? "",
        replyEn: sr.replyEn ?? "",
        category: sr.category ?? "general",
        isActive: sr.isActive ?? true,
      }));
      await db.insert(savedRepliesTable).values(rows);
      results.savedReplies = `${rows.length} replies restored`;
    }

    // Training notes — clear then re-insert
    if (Array.isArray(body.trainingNotes) && body.trainingNotes.length > 0) {
      await db.delete(botTrainingNotesTable);
      const rows = body.trainingNotes.map((n: any) => ({
        note: n.note ?? "",
        active: n.active ?? true,
      }));
      await db.insert(botTrainingNotesTable).values(rows);
      results.trainingNotes = `${rows.length} notes restored`;
    }

    res.json({ success: true, results });
  } catch (err) {
    req.log.error({ err }, "Import failed");
    res.status(500).json({ error: "Import failed", details: String(err) });
  }
});

export default router;
