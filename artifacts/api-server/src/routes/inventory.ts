import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { inventoryTable } from "@workspace/db/schema";
import { eq, ilike, and, SQL, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { ObjectStorageService } from "../lib/objectStorage";

const objectStorageService = new ObjectStorageService();

const router: IRouter = Router();

/** Convert stored publicImageUrl (may contain any domain) to a relative path */
function toRelativeImagePath(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    if (url.startsWith("/api/storage/")) return url;
    const parsed = new URL(url);
    const p = parsed.pathname;
    if (p.startsWith("/api/storage/")) return p;
    return url;
  } catch {
    return url;
  }
}

/**
 * الإصلاح: حفظ الصورة مباشرة بدون HTTP fetch
 * المشكلة القديمة: fetch(relativeUrl) يفشل على السيرفر لأنه لا يعرف الـ host
 */
async function uploadBase64ToStorage(imageBase64: string): Promise<string | null> {
  try {
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    const objectId = randomUUID();

    // حفظ مباشر بدون HTTP - هذا هو الإصلاح الجوهري
    const relativePath = await objectStorageService.saveUploadedFile(objectId, buffer);
    // relativePath = "/api/storage/objects/private/${objectId}"

    // أضف الدومين إذا كان موجوداً (ضروري لإرسال الصور لـ Meta/WhatsApp)
    const rawDomain = process.env.LOCAL_DOMAIN || "";
    const domain = rawDomain.split(",")[0].trim();
    if (domain) {
      return `https://${domain}${relativePath}`;
    }
    return relativePath;
  } catch (err) {
    console.error("[inventory] uploadBase64ToStorage error:", err);
    return null;
  }
}

router.get("/inventory", async (req, res) => {
  try {
    const { category, search } = req.query as { category?: string; search?: string };
    const conditions: SQL[] = [];

    if (category && category !== "all") {
      conditions.push(eq(inventoryTable.category, category));
    }
    if (search) {
      conditions.push(ilike(inventoryTable.nameEn, `%${search}%`));
    }

    const items = conditions.length > 0
      ? await db.select().from(inventoryTable).where(and(...conditions))
      : await db.select().from(inventoryTable);

    const formatted = items.map(item => ({
      ...item,
      price: parseFloat(item.price as unknown as string),
    }));

    res.json(formatted);
  } catch (err) {
    req.log.error({ err }, "Failed to get inventory");
    res.status(500).json({ error: "Internal server error" });
  }
});

function toSafeInt(value: any): number {
  const n = parseInt(String(value ?? '0'), 10);
  return isNaN(n) ? 0 : n;
}

function parseFirstAgeRange(body: any): { ageMin: number; ageMax: number } {
  if (Array.isArray(body.ageRanges) && body.ageRanges.length > 0) {
    return { ageMin: toSafeInt(body.ageRanges[0].min), ageMax: toSafeInt(body.ageRanges[0].max) };
  }
  return { ageMin: toSafeInt(body.ageMin), ageMax: toSafeInt(body.ageMax) };
}

router.post("/inventory", async (req, res) => {
  try {
    const body = req.body;
    const name = body.name || body.nameAr || body.nameEn || "";
    const { ageMin, ageMax } = parseFirstAgeRange(body);
    const ageRangesJson = Array.isArray(body.ageRanges) ? JSON.stringify(body.ageRanges) : null;

    let publicImageUrl = body.publicImageUrl ?? null;
    const isBase64 = typeof body.imageUrl === "string" && body.imageUrl.startsWith("data:image/");
    if (isBase64 && !publicImageUrl) {
      const uploadedUrl = await uploadBase64ToStorage(body.imageUrl);
      if (uploadedUrl) {
        publicImageUrl = uploadedUrl;
      }
    }

    const item = await db.insert(inventoryTable).values({
      nameAr: name,
      nameEn: body.nameEn || name,
      productId: body.productId,
      category: body.category,
      gender: body.gender ?? "both",
      ageMin,
      ageMax,
      ageRanges: ageRangesJson,
      price: (body.price ?? 0).toString(),
      stock: Number(body.stock ?? 0),
      colors: body.colors ?? null,
      descriptionAr: body.descriptionAr ?? null,
      descriptionEn: body.descriptionEn ?? null,
      imageUrl: body.imageUrl ?? null,
      publicImageUrl,
      available: body.available ?? true,
      discountPrice: body.discountPrice != null && body.discountPrice !== '' ? body.discountPrice.toString() : null,
      isOnSale: body.isOnSale ?? false,
    } as any).returning();

    const formatted = { ...item[0], price: parseFloat(item[0].price as unknown as string) };
    res.status(201).json(formatted);
  } catch (err: any) {
    if (err?.cause?.code === "23505" || err?.message?.includes("unique constraint")) {
      return void res.status(409).json({ error: "duplicate_product_id", message: "هذا الكود موجود بالفعل في النظام" });
    }
    req.log.error({ err }, "Failed to create inventory item");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/inventory/stats", async (req, res) => {
  try {
    const items = await db.select({
      id: inventoryTable.id,
      productId: inventoryTable.productId,
      category: inventoryTable.category,
      gender: inventoryTable.gender,
      price: inventoryTable.price,
      stock: inventoryTable.stock,
      available: inventoryTable.available,
      viewCount: inventoryTable.viewCount,
      botSendCount: inventoryTable.botSendCount,
      favoriteCount: inventoryTable.favoriteCount,
      createdAt: inventoryTable.createdAt,
      imageUrl: inventoryTable.imageUrl,
      publicImageUrl: inventoryTable.publicImageUrl,
    }).from(inventoryTable);
    const safe = items.map(i => ({
      ...i,
      imageUrl: null,
      publicImageUrl: toRelativeImagePath(i.publicImageUrl),
    }));
    res.json(safe);
  } catch (err) {
    req.log.error({ err }, "Failed to get inventory stats");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/inventory/:id/view", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.update(inventoryTable)
      .set({ viewCount: sql`view_count + 1` })
      .where(eq(inventoryTable.id, id));
    res.json({ success: true });
  } catch {
    res.json({ success: false });
  }
});

router.put("/inventory/batch", async (req, res) => {
  try {
    const items = Array.isArray(req.body) ? req.body : [];
    if (items.length === 0) return void res.json({ updated: 0 });

    let updated = 0;
    for (const item of items) {
      const id = typeof item.id === "number" ? item.id : parseInt(String(item.id));
      if (isNaN(id)) continue;

      const patch: Record<string, any> = { updatedAt: new Date() };

      if (item.price !== undefined) patch.price = String(item.price);
      if (item.discountPrice !== undefined) {
        patch.discountPrice = item.discountPrice != null && item.discountPrice !== "" ? String(item.discountPrice) : null;
      }
      if (item.isOnSale !== undefined) patch.isOnSale = Boolean(item.isOnSale);

      if (Array.isArray(item.ageRanges) && item.ageRanges.length > 0) {
        const { ageMin, ageMax } = parseFirstAgeRange({ ageRanges: item.ageRanges });
        patch.ageMin = ageMin;
        patch.ageMax = ageMax;
        patch.ageRanges = JSON.stringify(item.ageRanges);
      } else if (typeof item.ageText === "string") {
        const matches = [...item.ageText.matchAll(/(\d+)\s*-\s*(\d+)/g)];
        if (matches.length > 0) {
          const ranges = matches.map(m => ({ min: parseInt(m[1]), max: parseInt(m[2]) }));
          patch.ageRanges = JSON.stringify(ranges);
          patch.ageMin = Math.min(...ranges.map(r => r.min));
          patch.ageMax = Math.max(...ranges.map(r => r.max));
        }
      }

      if (Object.keys(patch).length <= 1) continue;
      await db.update(inventoryTable).set(patch).where(eq(inventoryTable.id, id));
      updated++;
    }

    console.log(`[SYNC_SUCCESS] Batch update: ${updated} inventory items updated via Suggestions page.`);
    res.json({ updated });
  } catch (err) {
    req.log.error({ err }, "Failed to batch update inventory");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/inventory/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const items = await db.select().from(inventoryTable).where(eq(inventoryTable.id, id));
    if (items.length === 0) return void res.status(404).json({ error: "Not found" });
    const formatted = { ...items[0], price: parseFloat(items[0].price as unknown as string) };
    res.json(formatted);
  } catch (err) {
    req.log.error({ err }, "Failed to get inventory item");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/inventory/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = req.body;

    const isBase64 = typeof body.imageUrl === "string" && body.imageUrl.startsWith("data:image/");
    if (isBase64 && !body.publicImageUrl) {
      const uploadedUrl = await uploadBase64ToStorage(body.imageUrl);
      if (uploadedUrl) {
        body.publicImageUrl = uploadedUrl;
      }
    }

    const name = body.name || body.nameAr || body.nameEn;
    const { ageMin, ageMax } = parseFirstAgeRange(body);
    const ageRangesJson = Array.isArray(body.ageRanges) ? JSON.stringify(body.ageRanges) : undefined;
    const updated = await db.update(inventoryTable).set({
      ...(name !== undefined && { nameAr: name, nameEn: name }),
      ...(body.productId !== undefined && { productId: body.productId }),
      ...(body.category !== undefined && { category: body.category }),
      ...(body.gender !== undefined && { gender: body.gender }),
      ...(Array.isArray(body.ageRanges) ? { ageMin, ageMax } : {}),
      ...(ageRangesJson !== undefined && { ageRanges: ageRangesJson }),
      ...(body.price !== undefined && { price: body.price.toString() }),
      ...(body.stock !== undefined && { stock: body.stock }),
      ...(body.colors !== undefined && { colors: body.colors }),
      ...(body.descriptionAr !== undefined && { descriptionAr: body.descriptionAr }),
      ...(body.descriptionEn !== undefined && { descriptionEn: body.descriptionEn }),
      ...(body.imageUrl !== undefined && { imageUrl: body.imageUrl }),
      ...(body.publicImageUrl !== undefined && { publicImageUrl: body.publicImageUrl }),
      ...(body.available !== undefined && { available: body.available }),
      ...(body.discountPrice !== undefined && { discountPrice: body.discountPrice != null && body.discountPrice !== '' ? body.discountPrice.toString() : null }),
      ...(body.isOnSale !== undefined && { isOnSale: body.isOnSale }),
      updatedAt: new Date(),
    }).where(eq(inventoryTable.id, id)).returning();

    if (updated.length === 0) return void res.status(404).json({ error: "Not found" });
    const formatted = { ...updated[0], price: parseFloat(updated[0].price as unknown as string) };
    res.json(formatted);
  } catch (err) {
    req.log.error({ err }, "Failed to update inventory item");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/inventory", async (req, res) => {
  try {
    await db.delete(inventoryTable);
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete all inventory");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/inventory/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(inventoryTable).where(eq(inventoryTable.id, id));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete inventory item");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
