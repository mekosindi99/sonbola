import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { inventoryTable, savedRepliesTable, settingsTable, bookingsTable, storefrontChatsTable, storefrontVisitorsTable, storefrontIpVisitsTable } from "@workspace/db/schema";
import { eq, and, gte, sql, desc, inArray } from "drizzle-orm";
import { blockedPhonesTable, siteBansTable } from "@workspace/db/schema";
import { normalizePhone } from "./blocked-phones";
import { openai } from "@workspace/integrations-openai-ai-server";
import { ObjectStorageService } from "../lib/objectStorage";

const objectStorageService = new ObjectStorageService();

async function uploadReceiptImage(base64: string): Promise<string | null> {
  try {
    const base64Data = base64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const uploadResponse = await fetch(uploadURL, {
      method: "PUT",
      body: buffer,
      headers: { "Content-Type": "image/png" },
    });
    if (!uploadResponse.ok) return null;
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
    if (objectPath.startsWith("https://")) return objectPath.split("?")[0];
    if (objectPath.startsWith("/objects/")) {
      const rawDomain = process.env.LOCAL_DOMAIN || "localhost:3000";
      const domain = rawDomain.split(",")[0].trim();
      return domain ? `https://${domain}/api/storage${objectPath}` : `/api/storage${objectPath}`;
    }
    return null;
  } catch { return null; }
}

const router: IRouter = Router();

// ─── OTP store (in-memory, TTL 5 min) ───────────────────────────────────────
interface OtpEntry { otp: string; expiry: number; attempts: number; name: string }
const otpStore = new Map<string, OtpEntry>();

// Cleanup expired entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of otpStore) if (now > v.expiry) otpStore.delete(k);
}, 10 * 60 * 1000);

// POST /api/storefront/otp/send
router.post("/storefront/otp/send", async (req, res) => {
  const { phone, name = "" } = req.body as { phone?: string; name?: string };
  if (!phone) return void res.status(400).json({ error: "رقم الهاتف مطلوب" });

  // ── Block check ────────────────────────────────────────────────────────────
  try {
    const normalized = normalizePhone(phone);
    const blocked = await db.select().from(blockedPhonesTable).where(eq(blockedPhonesTable.phone, normalized)).limit(1);
    if (blocked.length > 0) {
      return void res.status(403).json({ error: "🚫 لقد تم حظرك بسبب الترجيع من قبل الادارة" });
    }
  } catch { /* if check fails, allow through */ }

  // Rate-limit: 1 request per 60s per phone
  const existing = otpStore.get(phone);
  if (existing && (existing.expiry - 4 * 60 * 1000) > Date.now()) {
    const wait = Math.ceil((existing.expiry - 4 * 60 * 1000 - Date.now()) / 1000);
    return void res.status(429).json({ error: `انتظر ${wait} ثانية قبل طلب رمز جديد` });
  }

  const otp = String(Math.floor(100000 + Math.random() * 900000));
  otpStore.set(phone, { otp, expiry: Date.now() + 5 * 60 * 1000, attempts: 0, name });
  console.log(`[OTP] ${phone} → ${otp}`);

  return void res.json({ success: true, devOtp: otp });
});

// POST /api/storefront/otp/verify
router.post("/storefront/otp/verify", async (req, res) => {
  const { phone, otp } = req.body as { phone?: string; otp?: string };
  if (!phone || !otp) return res.status(400).json({ error: "البيانات ناقصة" });

  const stored = otpStore.get(phone);
  if (!stored) return res.status(400).json({ error: "لم يتم إرسال رمز لهذا الرقم، اطلب رمزاً جديداً" });
  if (Date.now() > stored.expiry) {
    otpStore.delete(phone);
    return res.status(400).json({ error: "انتهت صلاحية الرمز. اطلب رمزاً جديداً" });
  }
  if (stored.otp !== otp.trim()) {
    stored.attempts++;
    if (stored.attempts >= 5) {
      otpStore.delete(phone);
      return res.status(429).json({ error: "تم تجاوز عدد المحاولات. اطلب رمزاً جديداً" });
    }
    return res.status(400).json({ error: `رمز خاطئ — ${5 - stored.attempts} محاولات متبقية` });
  }

  const { name } = stored;
  otpStore.delete(phone);

  // Record / update visitor
  try {
    const normalized = normalizePhone(phone);
    await db.insert(storefrontVisitorsTable)
      .values({ phone: normalized, name, visitCount: 1 })
      .onConflictDoUpdate({
        target: storefrontVisitorsTable.phone,
        set: {
          name: sql`CASE WHEN ${storefrontVisitorsTable.name} = '' OR ${storefrontVisitorsTable.name} IS NULL THEN excluded.name ELSE ${storefrontVisitorsTable.name} END`,
          visitCount: sql`${storefrontVisitorsTable.visitCount} + 1`,
          lastVisitAt: sql`now()`,
        },
      });
  } catch (e) {
    console.warn("[OTP] visitor upsert failed:", e);
  }

  return res.json({ success: true, name });
});

// ─── Session duration tracking ────────────────────────────────────────────────
router.post("/storefront/session-ping", async (req, res) => {
  try {
    const { phone, seconds } = req.body as { phone?: string; seconds?: number };
    if (!phone || typeof seconds !== 'number' || seconds <= 0) return void res.sendStatus(204);
    const normalized = normalizePhone(phone);
    await db.update(storefrontVisitorsTable)
      .set({ totalTimeSpent: sql`${storefrontVisitorsTable.totalTimeSpent} + ${Math.min(seconds, 3600)}` })
      .where(eq(storefrontVisitorsTable.phone, normalized));
    res.sendStatus(204);
  } catch {
    res.sendStatus(204);
  }
});

// ─── Admin: list storefront visitors ─────────────────────────────────────────
router.get("/storefront/visitors", async (req, res) => {
  try {
    const rows = await db.select().from(storefrontVisitorsTable).orderBy(desc(storefrontVisitorsTable.lastVisitAt));
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "storefront: failed to get visitors");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── IP-based visit tracking ──────────────────────────────────────────────────
/** Map ip-api.com region name → Arabic Iraqi governorate */
const REGION_TO_GOV: Record<string, string> = {
  "Baghdad": "بغداد", "Baghdad Governorate": "بغداد",
  "Basra": "البصرة", "Basra Governorate": "البصرة",
  "Nineveh": "نينوى", "Ninawa Governorate": "نينوى",
  "Erbil": "أربيل", "Erbil Governorate": "أربيل",
  "Sulaymaniyah": "السليمانية", "As Sulaymaniyah": "السليمانية",
  "Dohuk": "دهوك", "Duhok": "دهوك",
  "Kirkuk": "كركوك",
  "Anbar": "الأنبار", "Al Anbar": "الأنبار",
  "Diyala": "ديالى",
  "Wasit": "واسط",
  "Babylon": "بابل", "Babil": "بابل",
  "Karbala": "كربلاء",
  "Najaf": "النجف",
  "Qadisiyyah": "القادسية", "Al Qadisiyyah": "القادسية",
  "Muthanna": "المثنى", "Al Muthanna": "المثنى",
  "Thi-Qar": "ذي قار", "Dhi Qar": "ذي قار",
  "Maysan": "ميسان",
  "Saladin": "صلاح الدين", "Salah ad Din": "صلاح الدين",
};

async function getGovernoratFromIp(ip: string): Promise<{ governorate: string; city: string; country: string }> {
  try {
    if (!ip || ip === "127.0.0.1" || ip === "::1" || ip.startsWith("192.168") || ip.startsWith("10.")) {
      return { governorate: "محلي", city: "", country: "IQ" };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,countryCode,regionName,city,query`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return { governorate: "غير معروف", city: "", country: "" };
    const data = await res.json() as { status: string; country: string; countryCode: string; regionName: string; city: string };
    if (data.status !== "success") return { governorate: "غير معروف", city: "", country: data.country || "" };
    const gov = REGION_TO_GOV[data.regionName] || data.regionName || "غير معروف";
    return { governorate: gov, city: data.city || "", country: data.country || "" };
  } catch {
    return { governorate: "غير معروف", city: "", country: "" };
  }
}

// POST /api/storefront/track-visit — anonymous visit tracking by IP
router.post("/storefront/track-visit", async (req, res) => {
  try {
    const { visitorId, userAgent = "" } = req.body as { visitorId?: string; userAgent?: string };
    if (!visitorId) return void res.sendStatus(204);

    const rawIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
      || req.socket.remoteAddress
      || "";
    const ip = rawIp.replace(/^::ffff:/, "");

    // ── Ban check: block by visitor_id or IP ─────────────────────────────────
    const ban = await db.select({ id: siteBansTable.id })
      .from(siteBansTable)
      .where(inArray(siteBansTable.value, [visitorId, ip].filter(Boolean)))
      .limit(1);
    if (ban.length > 0) {
      return void res.status(403).json({ banned: true });
    }

    const geo = await getGovernoratFromIp(ip);

    await db.insert(storefrontIpVisitsTable).values({
      visitorId,
      ip,
      governorate: geo.governorate,
      city: geo.city,
      country: geo.country,
      userAgent: (userAgent || "").slice(0, 300),
    });

    res.json({ governorate: geo.governorate });
  } catch (err) {
    console.error("[TRACK_VISIT]", err);
    res.sendStatus(204);
  }
});

// GET /api/storefront/ip-visits-stats — admin: visits by governorate
router.get("/storefront/ip-visits-stats", async (_req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT
        governorate,
        COUNT(*) AS total_visits,
        COUNT(DISTINCT visitor_id) AS unique_visitors,
        MAX(visited_at) AS last_visit
      FROM storefront_ip_visits
      GROUP BY governorate
      ORDER BY total_visits DESC
    `);
    res.json(rows.rows);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// GET /api/storefront/ip-visits-daily — admin: daily visits for last 30 days
router.get("/storefront/ip-visits-daily", async (_req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT
        DATE(visited_at) AS day,
        COUNT(*) AS total_visits,
        COUNT(DISTINCT visitor_id) AS unique_visitors
      FROM storefront_ip_visits
      WHERE visited_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(visited_at)
      ORDER BY day ASC
    `);
    res.json(rows.rows);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// ─── Public delivery fees (set by admin in settings) ─────────────────────────
router.get("/storefront/delivery-fees", async (req, res) => {
  try {
    const rows = await db.select({ deliveryFees: settingsTable.deliveryFees }).from(settingsTable).limit(1);
    const raw = rows[0]?.deliveryFees;
    res.json(raw ? JSON.parse(raw) : {});
  } catch {
    res.json({});
  }
});


// ─── Public ticker messages ───────────────────────────────────────────────────
router.get("/storefront/ticker", async (req, res) => {
  try {
    const rows = await db.select({ tickerMessages: settingsTable.tickerMessages }).from(settingsTable).limit(1);
    const raw = rows[0]?.tickerMessages;
    const all: { id: string; text: string; active: boolean }[] = raw ? JSON.parse(raw) : [];
    res.json(all.filter(m => m.active));
  } catch {
    res.json([]);
  }
});

// ─── Public install banner settings ─────────────────────────────────────────
router.get("/storefront/install-banner", async (req, res) => {
  try {
    const rows = await db.select({
      installBannerEnabled: settingsTable.installBannerEnabled,
      installBannerMessage: settingsTable.installBannerMessage,
    }).from(settingsTable).limit(1);
    const row = rows[0];
    res.json({
      enabled: row?.installBannerEnabled ?? true,
      message: row?.installBannerMessage || 'أضف سنبلة لشاشتك الرئيسية حتى لا تضيع الموقع! 📲',
    });
  } catch {
    res.json({ enabled: true, message: 'أضف سنبلة لشاشتك الرئيسية حتى لا تضيع الموقع! 📲' });
  }
});

// ─── Public footer settings ─────────────────────────────────────────────────
router.get("/storefront/footer", async (_req, res) => {
  try {
    const rows = await db.select({ footerSettings: (settingsTable as any).footerSettings }).from(settingsTable).limit(1);
    const raw = rows[0]?.footerSettings;
    res.json(raw ? JSON.parse(raw) : {});
  } catch {
    res.json({});
  }
});

// ─── Public PWA arrow settings ──────────────────────────────────────────────
router.get("/storefront/pwa-arrow", async (_req, res) => {
  try {
    const rows = await db.select({ pwaArrowSettings: (settingsTable as any).pwaArrowSettings }).from(settingsTable).limit(1);
    const raw = rows[0]?.pwaArrowSettings;
    res.json(raw ? JSON.parse(raw) : {});
  } catch {
    res.json({});
  }
});

// ─── Public product listing (no stock details exposed) ──────────────────────
/**
 * Convert a stored publicImageUrl (which may contain any domain) to a
 * relative /api/storage/... path so images work on any deployment domain.
 */
function toRelativeImagePath(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    // Already a relative path
    if (url.startsWith("/api/storage/")) return url;
    // Extract path from full URL, keep from /api/storage/ onwards
    const parsed = new URL(url);
    const path = parsed.pathname;
    if (path.startsWith("/api/storage/")) return path;
    // Fallback: return as-is
    return url;
  } catch {
    return url;
  }
}

// ─── Public grid layout setting ───────────────────────────────────────────────
router.get("/storefront/grid-layout", async (_req, res) => {
  try {
    const rows = await db.select({ storefrontGridLayout: settingsTable.storefrontGridLayout }).from(settingsTable).limit(1);
    res.json({ layout: rows[0]?.storefrontGridLayout ?? '2' });
  } catch {
    res.json({ layout: '2' });
  }
});

router.get("/storefront/products", async (req, res) => {
  try {
    const items = await db
      .select()
      .from(inventoryTable)
      .where(eq(inventoryTable.available, true));

    const safe = items.map(i => ({
      id: i.id,
      productId: i.productId,
      nameAr: i.nameAr,
      nameEn: i.nameEn,
      category: i.category,
      gender: i.gender,
      ageMin: i.ageMin,
      ageMax: i.ageMax,
      ageRanges: i.ageRanges,
      price: parseFloat(i.price as unknown as string),
      discountPrice: i.discountPrice != null ? parseFloat(i.discountPrice as unknown as string) : null,
      isOnSale: i.isOnSale ?? false,
      colors: i.colors,
      descriptionAr: i.descriptionAr,
      publicImageUrl: toRelativeImagePath(i.publicImageUrl),
      imageUrl: null, // never send base64 to storefront (bandwidth)
    }));

    res.json(safe);
  } catch (err) {
    req.log.error({ err }, "storefront: failed to get products");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Favorite toggle ─────────────────────────────────────────────────────────
router.post("/storefront/favorite/:productId", async (req, res) => {
  try {
    const { productId } = req.params;
    const { action } = req.body as { action: 'add' | 'remove' };
    const delta = action === 'remove' ? -1 : 1;
    await db.update(inventoryTable)
      .set({ favoriteCount: sql`GREATEST(0, favorite_count + ${delta})` })
      .where(eq(inventoryTable.productId, productId));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "storefront: failed to update favorite");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Embeddings cache for semantic reply search ───────────────────────────────
const _embCache = new Map<number, { hash: string; vec: number[] }>();

function _cosine(a: number[], b: number[]): number {
  let dot = 0, mA = 0, mB = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; mA += a[i] ** 2; mB += b[i] ** 2; }
  return mA && mB ? dot / (Math.sqrt(mA) * Math.sqrt(mB)) : 0;
}

async function semanticTopReplies(
  query: string,
  replies: Array<{ id: number; titleAr: string | null; replyAr: string | null; replyEn: string | null; triggerKeywords: string | null }>,
  topK = 10,
): Promise<typeof replies> {
  if (!replies.length) return [];
  try {
    // Find which replies need (re)computing
    const needIds = replies
      .filter(r => {
        const h = `${r.titleAr}|${r.replyAr}`.slice(0, 80);
        const c = _embCache.get(r.id);
        return !c || c.hash !== h;
      })
      .map(r => r.id);

    if (needIds.length) {
      const texts = needIds.map(id => {
        const r = replies.find(x => x.id === id)!;
        return `${r.titleAr || ''}: ${r.replyAr || r.replyEn || ''}`.slice(0, 300);
      });
      const resp = await openai.embeddings.create({ model: "text-embedding-3-small", input: texts });
      needIds.forEach((id, i) => {
        const r = replies.find(x => x.id === id)!;
        _embCache.set(id, { hash: `${r.titleAr}|${r.replyAr}`.slice(0, 80), vec: resp.data[i].embedding });
      });
    }

    const qResp = await openai.embeddings.create({ model: "text-embedding-3-small", input: query.slice(0, 300) });
    const qVec = qResp.data[0].embedding;

    return replies
      .map(r => ({ r, score: _cosine(_embCache.get(r.id)?.vec ?? [], qVec) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(x => x.r);
  } catch {
    // Fallback: return first topK
    return replies.slice(0, topK);
  }
}

// ─── Matching helpers ────────────────────────────────────────────────────────

type SavedReply = { titleAr: string | null; triggerKeywords: string | null; replyAr: string | null; replyEn: string | null };

function p1KeywordMatch(message: string, replies: SavedReply[]): string | null {
  const lower = message.toLowerCase();
  for (const sr of replies) {
    if (!sr.triggerKeywords) continue;
    const kws = sr.triggerKeywords
      .split(",")
      .map(k => k.trim().toLowerCase())
      .filter(k => k.length >= 3);
    if (kws.some(kw => lower.includes(kw))) {
      return sr.replyAr || sr.replyEn || null;
    }
  }
  return null;
}

function p2FuzzyMatch(message: string, replies: SavedReply[]): string | null {
  const words = message.toLowerCase().split(/\s+/).filter(w => w.length >= 3);
  let best: { reply: string; score: number } | null = null;
  for (const sr of replies) {
    const titleWords = (sr.titleAr || "")
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length >= 3);
    const score = titleWords.filter(w => words.includes(w)).length;
    if (score >= 2 && (!best || score > best.score)) {
      const reply = sr.replyAr || sr.replyEn || "";
      if (reply) best = { reply, score };
    }
  }
  return best?.reply ?? null;
}

function formatPrice(price: number | string | null): string {
  if (price === null || price === undefined) return "غير محدد";
  const n = Number(price);
  if (isNaN(n)) return String(price);
  if (n < 1000) return `${n}`;
  const k = n / 1000;
  return Number.isInteger(k) ? `${k} الف` : `${k.toFixed(1)} الف`;
}

// ─── Storefront AI Chat (public, no auth) ────────────────────────────────────
router.post("/storefront/chat", async (req, res) => {
  try {
    const {
      message,
      sessionHistory = [],
      productContext,
      imageDataUrl,  // base64 data URI of current message image
    } = req.body as {
      message?: string;
      sessionHistory?: Array<{ role: "user" | "assistant"; content: string }>;
      productContext?: string;
      imageDataUrl?: string;
    };

    const msgText = (message || "").trim();
    const hasImage = !!imageDataUrl && (imageDataUrl.startsWith("data:") || imageDataUrl.startsWith("https://"));
    if (!msgText && !hasImage) {
      return res.status(400).json({ error: "message required" });
    }

    const savedReplies = await db
      .select()
      .from(savedRepliesTable)
      .where(eq(savedRepliesTable.isActive, true));

    // P1 — keyword match (fastest, no AI cost) — skip if image-only
    if (msgText) {
      const p1 = p1KeywordMatch(msgText, savedReplies);
      if (p1) return res.json({ reply: p1, type: "saved_reply" });
      const p2 = p2FuzzyMatch(msgText, savedReplies);
      if (p2) return res.json({ reply: p2, type: "saved_reply" });
    }

    // ── Semantic top-10 saved replies (works for any number of replies) ──────
    const topReplies = msgText
      ? await semanticTopReplies(msgText, savedReplies, 10)
      : [];
    const savedRepliesBlock = topReplies
      .map((sr, i) => `${i + 1}. "${sr.titleAr}" → "${sr.replyAr}"`)
      .join("\n");

    // ── Delivery fees from settings ───────────────────────────────────────────
    const settingsRow = await db
      .select({ deliveryFees: settingsTable.deliveryFees })
      .from(settingsTable)
      .limit(1);
    const deliveryFeesRaw = settingsRow[0]?.deliveryFees;
    let deliveryFeesBlock = "";
    try {
      const feesMap: Record<string, number> = deliveryFeesRaw ? JSON.parse(deliveryFeesRaw) : {};
      const entries = Object.entries(feesMap);
      if (entries.length > 0) {
        deliveryFeesBlock =
          "\n━━━ أسعار التوصيل حسب المحافظة ━━━\n" +
          entries.map(([prov, fee]) => `${prov}: ${formatPrice(fee)} دينار`).join("\n") +
          "\nعند سؤال عن سعر التوصيل لمحافظة معينة أجب بالسعر المحدد لها، إذا لم تُذكر المحافظة اسأل عنها أولاً.\n";
      }
    } catch {}

    // ── Products ─────────────────────────────────────────────────────────────
    const products = await db
      .select()
      .from(inventoryTable)
      .where(eq(inventoryTable.available, true));

    const productList = products
      .map(p => {
        let ages = `${p.ageMin}-${p.ageMax}`;
        try {
          const r = p.ageRanges ? JSON.parse(p.ageRanges) : null;
          if (Array.isArray(r) && r.length > 0) ages = r.map((x: any) => `${x.min}-${x.max}`).join("، ");
        } catch {}
        return `كود: ${p.productId} | ${p.category} | ${p.gender} | سعر: ${formatPrice(p.price)} | أعمار: ${ages} سنة`;
      })
      .join("\n");

    const prices = products.map(p => Number(p.price)).filter(p => p > 0);
    const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
    const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;
    const priceRangeNote = prices.length > 0
      ? `نطاق الأسعار: من ${formatPrice(minPrice)} إلى ${formatPrice(maxPrice)} دينار`
      : "";

    const productCtxNote = productContext
      ? `\nالزبون يستفسر عن هذا المنتج بالذات:\n${productContext}\n`
      : "";

    const visionNote = hasImage
      ? `\nأُرسلت صورة مع هذه الرسالة. استخدم Vision لتحديد العنصر في الصورة (كود المنتج، اللون، الشكل) وطابقه مع قائمة المنتجات. اذكر أقرب منتج مطابق وسعره. إذا ظهر كود المنتج في الصورة مثل S327 فاستخدمه مباشرةً.\n`
      : "";

    const systemPrompt = `أنت مساعد مبيعات ذكي لمتجر ملابس أطفال عراقي اسمه SONBOLA. تحدث بالعربية العامية العراقية.
${productCtxNote}${visionNote}
━━━ السياق من المحادثة ━━━
راجع تاريخ المحادثة بعناية. إذا ذكر الزبون اسمه أو رقمه أو عنوانه أو محافظته من قبل لا تطلبها مرة ثانية. استخدم المعلومات المتاحة تلقائياً.
لا تكرر تحية "أهلاً" إذا المحادثة مستمرة.

━━━ الردود المحفوظة (أولويتك الأولى) ━━━
إذا وجدت رداً مناسباً استخدمه كما هو أو بتصرف بسيط.
${savedRepliesBlock || "لا توجد ردود محفوظة."}

━━━ المنتجات المتاحة ━━━
${priceRangeNote ? priceRangeNote + "\n" : ""}${productList || "لا توجد منتجات."}
${deliveryFeesBlock}
قواعد:
- اختصر ردودك (جملة أو جملتين فقط)
- لا تستخدم إيموجيات
- الأسعار بصيغة "X الف" فقط
- عند سؤال عن نطاق الأسعار: اذكر النطاق فقط
- عند سؤال عن منتج معين: اذكر السعر فقط
- للطلب والحجز: اطلب ما لم يُذكر من قبل فقط (الهاتف، المحافظة، العنوان)`;

    // ── Build OpenAI messages array ───────────────────────────────────────────
    type OAIMsg = Parameters<typeof openai.chat.completions.create>[0]["messages"][number];

    const historyMsgs: OAIMsg[] = sessionHistory.slice(-50).map(m => ({
      role: m.role,
      content: m.content,
    }));

    // Current user message — with or without image
    let currentUserMsg: OAIMsg;
    if (hasImage) {
      currentUserMsg = {
        role: "user",
        content: [
          { type: "text" as const, text: msgText || "ما هذا؟ طابقه مع المنتجات المتاحة." },
          { type: "image_url" as const, image_url: { url: imageDataUrl!, detail: "high" as const } },
        ],
      };
    } else {
      currentUserMsg = { role: "user", content: msgText };
    }

    const allMessages: OAIMsg[] = [
      { role: "system", content: systemPrompt },
      ...historyMsgs,
      currentUserMsg,
    ];

    const completion = await openai.chat.completions.create({
      model: hasImage ? "gpt-4o" : "gpt-4o-mini",
      messages: allMessages,
      max_completion_tokens: hasImage ? 600 : 400,
    });

    const reply = completion.choices[0]?.message?.content ?? "عذراً، حدث خطأ. حاول مرة أخرى.";
    return res.json({ reply, type: hasImage ? "vision" : "ai" });
  } catch (err) {
    req.log.error({ err }, "storefront: chat error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /api/storefront/order — save order to bookings ─────────────────────
router.post("/storefront/order", async (req, res) => {
  try {
    const { senderName, phone1, phone2, province, address, ageNote, items, total, deliveryFee, grandTotal } = req.body as {
      senderName: string;
      phone1: string;
      phone2?: string;
      province: string;
      address: string;
      ageNote?: string;
      items: { productId: string; nameAr: string; nameEn: string; price: number; qty: number; image: string | null }[];
      total: number;
      deliveryFee: number;
      grandTotal: number;
    };

    // ── Deduplication: return existing booking if same phone submitted within 3 min ──
    const threeMinAgo = new Date(Date.now() - 3 * 60 * 1000);
    const itemIds = items.map(i => i.productId).sort().join(",");
    const recentBookings = await db
      .select({ id: bookingsTable.id, items: bookingsTable.items })
      .from(bookingsTable)
      .where(and(eq(bookingsTable.senderId, phone1), gte(bookingsTable.createdAt, threeMinAgo)));

    for (const rb of recentBookings) {
      const rbIds = (Array.isArray(rb.items) ? (rb.items as any[]) : [])
        .map((i: any) => i.productId)
        .sort()
        .join(",");
      if (rbIds === itemIds) {
        return res.json({ orderId: rb.id, duplicate: true });
      }
    }

    const notesParts = [];
    if (phone2?.trim()) notesParts.push(`رقم احتياطي: ${phone2}`);
    if (ageNote?.trim()) notesParts.push(`ملاحظة العمر: ${ageNote}`);

    const [booking] = await db.insert(bookingsTable).values({
      platform: "storefront",
      senderId: phone1,
      senderName: senderName || "زبون",
      phoneNumber: phone1,
      governorate: province,
      fullAddress: address,
      items: items as any,
      totalAmount: String(grandTotal),
      notes: notesParts.join(" | ") || null,
      status: "pending",
    }).returning({ id: bookingsTable.id });

    // ── WhatsApp notification to admin ─────────────────────────────────────────
    try {
      const [cfg] = await db.select({
        twilioAccountSid: settingsTable.twilioAccountSid,
        twilioAuthToken: settingsTable.twilioAuthToken,
        twilioFromNumber: settingsTable.twilioFromNumber,
        whatsappAdminNumber: settingsTable.whatsappAdminNumber,
      }).from(settingsTable).limit(1);

      if (cfg?.twilioAccountSid && cfg?.twilioAuthToken && cfg?.twilioFromNumber && cfg?.whatsappAdminNumber) {
        const from = cfg.twilioFromNumber.startsWith("whatsapp:") ? cfg.twilioFromNumber : `whatsapp:${cfg.twilioFromNumber}`;
        const to = cfg.whatsappAdminNumber.startsWith("whatsapp:") ? cfg.whatsappAdminNumber : `whatsapp:${cfg.whatsappAdminNumber}`;
        const itemsList = items.map(i => `• ${i.nameAr} (${i.productId}) x${i.qty} — ${i.price.toLocaleString()} د.ع`).join("\n");
        const body = `🛒 *حجز جديد من بوت الموقع!*\n\n👤 الاسم: ${senderName || "زبون"}\n📞 الرقم: ${phone1}\n📍 المحافظة: ${province}\n🏠 العنوان: ${address}\n\n${itemsList}\n\n💰 التوصيل: ${deliveryFee.toLocaleString()} د.ع\n💵 الإجمالي: ${grandTotal.toLocaleString()} د.ع\n\n🔖 رقم الطلب: #${booking.id + 873}`;
        const url = `https://api.twilio.com/2010-04-01/Accounts/${cfg.twilioAccountSid}/Messages.json`;
        await fetch(url, {
          method: "POST",
          headers: {
            Authorization: "Basic " + Buffer.from(`${cfg.twilioAccountSid}:${cfg.twilioAuthToken}`).toString("base64"),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ From: from, To: to, Body: body }),
        });
      }
    } catch (notifyErr) {
      req.log.warn({ notifyErr }, "storefront: WhatsApp notification failed (non-fatal)");
    }

    res.json({ orderId: booking.id });
  } catch (err) {
    req.log.error({ err }, "storefront: create order error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── PATCH /api/storefront/order/:id/receipt-image — upload & attach image ───
router.patch("/storefront/order/:id/receipt-image", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { receiptImage } = req.body as { receiptImage: string };
    if (!receiptImage) return res.status(400).json({ error: "No image" });

    const receiptImageUrl = await uploadReceiptImage(receiptImage);
    if (!receiptImageUrl) return res.status(500).json({ error: "Upload failed" });

    await db.update(bookingsTable).set({ receiptImageUrl, updatedAt: new Date() }).where(eq(bookingsTable.id, id));
    res.json({ receiptImageUrl });
  } catch (err) {
    req.log.error({ err }, "storefront: receipt image upload error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Storefront chats: save conversation ─────────────────────────────────────
router.post("/storefront/chats/save", async (req, res) => {
  try {
    const { phone, name, messages } = req.body as {
      phone?: string; name?: string; messages?: { role: string; content?: string; imageUrl?: string }[];
    };
    if (!phone || !messages) return res.status(400).json({ error: "البيانات ناقصة" });

    // Strip UI-only separator messages before persisting
    const filtered = messages.filter(m => m.content !== "— محادثاتك السابقة —");
    const messagesJson = JSON.stringify(filtered);

    // Always upsert by phone — one unified record per customer
    const existing = await db.select({ id: storefrontChatsTable.id })
      .from(storefrontChatsTable)
      .where(eq(storefrontChatsTable.phone, phone))
      .limit(1);

    if (existing.length > 0) {
      await db.update(storefrontChatsTable)
        .set({ messages: messagesJson, name: name || "زائر", updatedAt: new Date() })
        .where(eq(storefrontChatsTable.phone, phone));
    } else {
      await db.insert(storefrontChatsTable).values({ phone, name: name || "زائر", messages: messagesJson });
    }

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "storefront: save chat error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── User: get own chat history (by phone) ───────────────────────────────────
router.get("/storefront/user-history", async (req, res) => {
  try {
    const { phone } = req.query as { phone?: string };
    if (!phone) return res.status(400).json({ error: "رقم مطلوب" });

    // One unified record per phone
    const row = await db
      .select({ messages: storefrontChatsTable.messages })
      .from(storefrontChatsTable)
      .where(eq(storefrontChatsTable.phone, phone))
      .limit(1);

    if (row.length === 0) return res.json({ messages: [] });

    let allMessages: { role: string; content?: string; imageUrl?: string }[] = [];
    try {
      const parsed = JSON.parse(row[0].messages);
      if (Array.isArray(parsed)) allMessages = parsed;
    } catch {}

    res.json({ messages: allMessages.slice(-200) });
  } catch (err) {
    req.log.error({ err }, "storefront: get user history error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Admin: get all storefront chats ─────────────────────────────────────────
router.get("/beqolky/storefront-chats", async (req, res) => {
  try {
    const chats = await db.select().from(storefrontChatsTable)
      .orderBy(storefrontChatsTable.updatedAt);
    res.json(chats.reverse());
  } catch (err) {
    req.log.error({ err }, "admin: get storefront chats error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Admin: delete a storefront chat ─────────────────────────────────────────
router.delete("/beqolky/storefront-chats/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(storefrontChatsTable).where(eq(storefrontChatsTable.id, id));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "admin: delete storefront chat error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
