import { Router, type IRouter } from "express";
import { writeFile, mkdir, readFile } from "fs/promises";
import { join, basename } from "path";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { botSuggestionsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();

/** Load an image from an absolute URL or a local path, return base64 + content-type.
 *  For locally-uploaded images (/api/uploads/...) we read directly from disk instead
 *  of making a self-referential HTTP request (which can time-out on Replit). */
async function loadImage(imageUrl: string): Promise<{ base64: string; ct: string } | null> {
  try {
    // Detect locally-uploaded suggestion images — read from disk directly
    const LOCAL_PATTERNS = ["/api/uploads/suggestions/", "/uploads/suggestions/"];
    const localMatch = LOCAL_PATTERNS.find(p => imageUrl.includes(p));
    if (localMatch) {
      // Use basename to prevent path traversal attacks
      const rawName = imageUrl.split(localMatch).pop()!;
      const filename = basename(rawName);
      const ALLOWED_EXT = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
      if (!filename || filename.startsWith(".") || !ALLOWED_EXT.some(e => filename.toLowerCase().endsWith(e))) return null;
      const filePath = join(process.cwd(), "public", "uploads", "suggestions", filename);
      const buf = await readFile(filePath);
      const ct = filename.endsWith(".png") ? "image/png" : "image/jpeg";
      console.log(`[SUGGESTIONS] loadImage: read from disk — ${filename}`);
      return { base64: buf.toString("base64"), ct };
    }

    if (imageUrl.startsWith("http")) {
      const res = await fetch(imageUrl, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      const ct = res.headers.get("content-type") || "image/jpeg";
      return { base64: buf.toString("base64"), ct };
    }

    // Local relative path fallback — strip traversal attempts
    const safeRelative = basename(imageUrl);
    const ALLOWED_EXT_FB = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
    if (!safeRelative || safeRelative.startsWith(".") || !ALLOWED_EXT_FB.some(e => safeRelative.toLowerCase().endsWith(e))) return null;
    const filePath = join(process.cwd(), "public", "uploads", safeRelative);
    const buf = await readFile(filePath);
    const ct = safeRelative.endsWith(".png") ? "image/png" : "image/jpeg";
    return { base64: buf.toString("base64"), ct };
  } catch (err: any) {
    console.error(`[SUGGESTIONS] loadImage failed for ${imageUrl}: ${err?.message}`);
    return null;
  }
}

/** Save base64 image to /public/uploads/suggestions/ and return absolute URL */
async function saveImageToDisk(base64: string): Promise<string> {
  const base64Data = base64.replace(/^data:image\/(\w+);base64,/, "");
  const ext = base64.startsWith("data:image/png") ? ".png" : ".jpg";
  const filename = `${randomUUID()}${ext}`;
  const dir = join(process.cwd(), "public", "uploads", "suggestions");
  await mkdir(dir, { recursive: true });
  const buffer = Buffer.from(base64Data, "base64");
  await writeFile(join(dir, filename), buffer);

  const rawDomain = process.env.LOCAL_DOMAIN || "localhost:3000";
  const domain = rawDomain.split(",")[0].trim();
  return domain
    ? `https://${domain}/api/uploads/suggestions/${filename}`
    : `/api/uploads/suggestions/${filename}`;
}

/** GET /api/suggestions — list all */
router.get("/suggestions", async (_req, res) => {
  try {
    const rows = await db.select().from(botSuggestionsTable).orderBy(botSuggestionsTable.createdAt);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/** POST /api/suggestions/preview-vision — run Vision AI on one image, return extracted info */
router.post("/suggestions/preview-vision", async (req, res) => {
  try {
    const { imageUrl } = req.body as { imageUrl?: string };
    if (!imageUrl) return res.status(400).json({ error: "imageUrl required" });

    const img = await loadImage(imageUrl);
    if (!img) return res.status(422).json({ error: "failed to load image" });

    const resp = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{
        role: "user",
        content: [
          {
            type: "text",
            text: `اقرأ هذه صورة منتج ملابس أطفال بعناية واستخرج كل المعلومات المكتوبة عليها (ستيكرات، تاقات، أرقام، نصوص).

قواعد مهمة:
- قد تحتوي الصورة على ستيكرات عمر أكثر من واحد (مثلاً "6M_2 سنة" و"3_4 سنة" على نفس الصورة). اقرأ كلها.
- حوّل كل نطاق عمر إلى أشهر: 6M=6، 1سنة=12، 2سنة=24، 3سنة=36، إلخ.

أجب بـ JSON فقط بهذا الشكل:
{
  "code": "كود المنتج مثل S310 أو null",
  "ageRanges": [
    {"label": "6M_2 سنة", "from": 6, "to": 24},
    {"label": "3_4 سنة", "from": 36, "to": 48}
  ],
  "price": "السعر كما مكتوب مثل 15,000 أو null",
  "extraNotes": "أي ملاحظات أخرى أو null"
}
إذا لا يوجد ستيكر عمر، اجعل ageRanges مصفوفة فارغة [].`,
          },
          {
            type: "image_url",
            image_url: { url: `data:${img.ct};base64,${img.base64}`, detail: "high" },
          },
        ],
      }],
      max_completion_tokens: 300,
      temperature: 0,
    });

    const raw = (resp.choices[0]?.message?.content || "").trim().replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(raw);
    res.json(parsed);
  } catch (err: any) {
    console.error(`[SUGGESTIONS] preview-vision error: ${err?.message}`);
    res.status(500).json({ error: err?.message });
  }
});

/** POST /api/suggestions — create (imageBase64 uploaded to disk) */
router.post("/suggestions", async (req, res) => {
  try {
    const { imageBase64, imageUrl: rawUrl, isAvailable } = req.body;

    let finalImageUrl = rawUrl as string | undefined;
    if (imageBase64) {
      finalImageUrl = await saveImageToDisk(imageBase64);
      console.log(`[SUGGESTIONS] Saved image: ${finalImageUrl}`);
    }
    if (!finalImageUrl) return res.status(400).json({ error: "imageUrl or imageBase64 required" });

    const [inserted] = await db.insert(botSuggestionsTable).values({
      imageUrl: finalImageUrl,
      isAvailable: isAvailable !== false,
    }).returning();

    res.json(inserted);
  } catch (err: any) {
    console.error(`[SUGGESTIONS] POST error: ${err?.message}`);
    res.status(500).json({ error: err?.message });
  }
});

/** PATCH /api/suggestions/:id — toggle availability */
router.patch("/suggestions/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { isAvailable } = req.body;
    const updates: Record<string, unknown> = {};
    if (isAvailable !== undefined) updates.isAvailable = Boolean(isAvailable);

    const [updated] = await db.update(botSuggestionsTable).set(updates)
      .where(eq(botSuggestionsTable.id, id)).returning();
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/** DELETE /api/suggestions/:id */
router.delete("/suggestions/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await db.delete(botSuggestionsTable).where(eq(botSuggestionsTable.id, id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

export default router;
