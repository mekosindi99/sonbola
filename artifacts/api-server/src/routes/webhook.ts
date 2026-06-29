import { Router, type IRouter } from "express";
import { writeFile, mkdir, readFile } from "fs/promises";
import { join, basename } from "path";
import { db } from "@workspace/db";
import {
  settingsTable,
  inventoryTable,
  bookingsTable,
  chatConversationsTable,
  chatMessagesTable,
  botTrainingNotesTable,
  savedRepliesTable,
  botSuggestionsTable,
} from "@workspace/db/schema";
import { eq, asc, desc, and, sql, ilike, or } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { randomUUID, createHmac } from "crypto";
import { ObjectStorageService } from "../lib/objectStorage";
import { loadActiveFlow, executeFlow, isMidBooking } from "../lib/flow-engine";

const objectStorageService = new ObjectStorageService();

/** Escape HTML special chars to prevent injection in Telegram/HTML messages. */
function escHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Download a Meta temporary image URL and upload to permanent object storage.
 * Returns the permanent absolute URL and the base64 data (for Vision API).
 * Meta URLs expire quickly — this MUST be called immediately on webhook receipt.
 */
async function mirrorMetaImage(metaUrl: string): Promise<{
  permanentUrl: string;
  base64: string;
  contentType: string;
} | null> {
  try {
    const resp = await fetch(metaUrl, { signal: AbortSignal.timeout(20_000) });
    if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);

    const contentType = resp.headers.get("content-type") || "image/jpeg";
    const buffer = Buffer.from(await resp.arrayBuffer());
    const base64 = buffer.toString("base64");

    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

    const putResp = await fetch(uploadURL, {
      method: "PUT",
      body: buffer,
      headers: { "Content-Type": contentType },
      signal: AbortSignal.timeout(30_000),
    });
    if (!putResp.ok) throw new Error(`Upload failed: ${putResp.status}`);

    const domain = (process.env.LOCAL_DOMAIN || "localhost:3000").split(",")[0].trim() || "localhost:8080";
    const permanentUrl = `https://${domain}/api/storage${objectPath}`;

    console.log(`[IMAGE] Mirrored Meta image → ${permanentUrl}`);
    return { permanentUrl, base64, contentType };
  } catch (err: any) {
    console.error("[IMAGE] Failed to mirror Meta image:", err?.message || err);
    return null;
  }
}

const router: IRouter = Router();

/* ══════════════════════════════════════════════════════════════════════
 * SPEED CACHE — avoids repeated DB queries on every webhook
 * TTL: settings 30s, static data (products/replies/notes) 60s
 * ══════════════════════════════════════════════════════════════════════ */
interface CacheEntry<T> { data: T; ts: number; }
function makeCache<T>(ttlMs: number) {
  let entry: CacheEntry<T> | null = null;
  return {
    get(): T | null { return entry && Date.now() - entry.ts < ttlMs ? entry.data : null; },
    set(data: T) { entry = { data, ts: Date.now() }; },
    invalidate() { entry = null; },
  };
}
const settingsCache       = makeCache<any>(120_000);          // 2 min
const productsCache       = makeCache<any[]>(24 * 3600_000);  // 24 hours — refreshed daily
const repliesCache        = makeCache<any[]>(24 * 3600_000);  // 24 hours
const notesCache          = makeCache<any[]>(24 * 3600_000);  // 24 hours
const starredBookingCache = makeCache<any[]>(120_000);        // 2 min — avoid DB query per message

// ── Warm up caches on startup (load products/replies/notes once immediately) ──
// Runs async — does not block server start.
async function warmupCaches() {
  try {
    const [prods, reps, notes] = await Promise.all([
      db.select().from(inventoryTable).where(eq(inventoryTable.available, true)),
      db.select().from(savedRepliesTable).where(eq(savedRepliesTable.isActive, true)).orderBy(asc(savedRepliesTable.id)),
      db.select().from(botTrainingNotesTable).where(eq(botTrainingNotesTable.active, true)),
    ]);
    productsCache.set(prods);
    repliesCache.set(reps);
    notesCache.set(notes);
    console.log(`[CACHE_WARMUP] ✓ Loaded ${prods.length} products, ${reps.length} replies, ${notes.length} notes`);
  } catch (err: any) {
    console.log(`[CACHE_WARMUP] ✗ ${err?.message}`);
  }
}
setTimeout(warmupCaches, 2000); // 2s after module load so DB is ready

const OWNER_WHATSAPP = "07503981573"; // admin phone — invoice & complaint alerts

/* ── Deduplication layer 1: in-memory MID cache (blocks same webhook delivered twice) ── */
const processedMids = new Map<string, number>();
const MID_TTL_MS = 10 * 60 * 1000; // 10 minutes
function inMemoryDuplicate(mid: string): boolean {
  const now = Date.now();
  for (const [k, t] of processedMids) {
    if (now - t > MID_TTL_MS) processedMids.delete(k);
  }
  if (processedMids.has(mid)) return true;
  processedMids.set(mid, now);
  return false;
}

/* ── Deduplication layer 1b: sender+content fingerprint (catches null-MID duplicates) ──
 * Meta sometimes delivers webhooks without a MID (common on Instagram).
 * When MID is null, Layers 1 and 2 are bypassed, so we need this fallback.
 * Key = senderId + "|" + first 100 chars of message, Value = timestamp
 */
const processedFingerprints = new Map<string, number>();
const FINGERPRINT_TTL_MS = 3 * 60 * 1000; // 3 minutes
function inMemoryFingerprintDuplicate(senderId: string, text: string, imageFlag: boolean): boolean {
  const now = Date.now();
  for (const [k, t] of processedFingerprints) {
    if (now - t > FINGERPRINT_TTL_MS) processedFingerprints.delete(k);
  }
  const fp = `${senderId}|${imageFlag ? "[img]" : ""}${(text || "").slice(0, 100)}`;
  if (processedFingerprints.has(fp)) return true;
  processedFingerprints.set(fp, now);
  return false;
}

/* ── Per-sender sequential lock: ensures only ONE AI response is generated per sender at a time ──
 * This prevents double-replies when Meta delivers the same webhook twice simultaneously,
 * or when two messages arrive in rapid succession before the first AI call completes.
 * Key = convId (platform_senderId), Value = promise chain for that sender.
 */
const senderProcessingLocks = new Map<string, Promise<void>>();

/* ── Per-sender language preference for interactive menu ─────────────────────
 * Saved when customer taps [عربي] or [کوردی]. Defaults to 'ar' if not set.
 * Key = senderId, Value = 'ar' | 'ku'
 */
const senderLangMap = new Map<string, 'ar' | 'ku'>();

/* ── Per-sender browse mode for hybrid menu ──────────────────────────────────
 * 'carousel' = show product carousel + quick-reply FAQ buttons
 * 'text'     = show classic numbered menu (default/fallback)
 * undefined  = not yet chosen → show mode-selection prompt
 */
const senderModeMap = new Map<string, 'carousel' | 'text'>();
// For carousel-only mode: track users pending age selection & their chosen age
const pendingAgeSelectSet = new Set<string>();
const senderAgeMap = new Map<string, number>(); // senderId → chosen age min (years)
const senderAgeMaxMap = new Map<string, number>(); // senderId → chosen age max (years)
// Exchange / return issue tracking — when set, bot auto-replies with patience msg
const senderIssueMap = new Map<string, 'exchange' | 'return'>();
// Season & gender selection before product browsing
const senderSeasonMap = new Map<string, string>(); // senderId → 'winter'|'summer'|'spring'|'all'
const senderGenderMap = new Map<string, string>(); // senderId → 'boys'|'girls'|'both'
// Greeting cooldown — prevent duplicate welcome carousels when user sends multiple messages quickly
const recentGreetingMap = new Map<string, number>(); // senderId → timestamp of last greeting sent
const GREETING_COOLDOWN_MS = 45_000; // 45 seconds
// Users who received the 5-card menu but haven't answered tutorial نعم/لا yet
const pendingTutorialChoiceSet = new Set<string>();
// Senders who already received the full welcome carousel (only send once per session)
const welcomedSendersSet = new Set<string>();
// Facebook senders who already received the first website-redirect welcome message
const facebookWelcomedSet = new Set<string>();
// Queued product batches for pagination — key = senderId, value = remaining element batches
type CarouselElement = { title: string; subtitle?: string; image_url?: string; buttons?: Array<{ type: 'postback' | 'web_url'; title: string; payload?: string; url?: string }> };
const senderProductQueueMap = new Map<string, { batches: CarouselElement[][]; platform: string }>();

/* ── Conversational AI context per sender (Instagram bot) ────────────────────
 * Stores per-sender conversation history and products identified from images.
 */
type IdentifiedProduct = {
  productId: string; nameAr: string; price: number;
  ageRanges: string; gender: string; season: string;
  colors: string; available: boolean; imageUrl?: string;
  ageMin: number; ageMax: number; // in years (e.g. 0.5 = 6 months)
};
const senderConversationHistory = new Map<string, Array<{ role: 'user' | 'assistant'; content: string }>>();
const senderIdentifiedProductsMap = new Map<string, IdentifiedProduct[]>();
const MAX_CONV_HISTORY = 100; // max message pairs kept per sender (roadmap: ذاكرة 100)

// ── Conversational flow state machine per sender ───────────────────────────
type ConvFlowStep =
  | 'price_shown'
  | 'age_ask_pending'
  | 'age_replied'
  | 'suggest_asked'
  | 'delivery_ask_gov'        // Bot asked "يا محافظة؟", waiting for governorate
  | 'booking_show_total'      // Showed price breakdown, waiting for confirmation
  | 'booking_collect_info'    // Collecting phone number from customer
  | 'booking_collect_address' // Phone saved, now collecting address
  | 'age_browse'              // Sent all products for an age, waiting for selection
  | 'suggestions_shown'       // Sent suggestion images (no price), waiting for customer selection
  | 'staff_handoff';          // Bot is SILENT — staff handles conversation directly

type ConvFlowState = {
  step: ConvFlowStep;
  products: IdentifiedProduct[];
  requestedAgeYears?: number;
  availableForAge?: IdentifiedProduct[];
  // Delivery info collected during conversation
  governorate?: string;
  deliveryFee?: number;
  deliveryDays?: string;
  // Collected during booking (split-step collection)
  savedPhone?: string;
};
const senderConvFlowMap = new Map<string, ConvFlowState>();

/* ── Carousel send deduplication (30s window) ────────────────────────────────
 * Prevents double-carousel when the customer taps a quick-reply button twice.
 */
const lastCarouselSentAt = new Map<string, number>();
function isDuplicateCarouselSend(senderId: string): boolean {
  const last = lastCarouselSentAt.get(senderId) ?? 0;
  if (Date.now() - last < 30_000) return true;
  lastCarouselSentAt.set(senderId, Date.now());
  return false;
}

/* ── Carousel Booking State Machine ─────────────────────────────────────────
 * Tracks each customer's booking progress when they tap "احجزيه" in carousel.
 */
interface BookingProduct {
  nameAr: string;
  price: number;
  ageMin: number;   // product DB age range (years)
  ageMax: number;
  pickedAgeMin?: number;  // customer-selected age min for this piece
  pickedAgeMax?: number;  // customer-selected age max for this piece
  selectedSize?: string;
  publicImageUrl?: string;
  productId?: string;     // inventory product code (fetched after BOOK_ postback)
}

interface BookingSession {
  stage: 'pick_qty' | 'pick_age' | 'age_type_q' | 'add_more' | 'pick_size' | 'province' | 'province_sub' | 'phone' | 'address' | 'landmark' | 'complete' | 'adding_piece';
  products: BookingProduct[];
  currentProductIdx: number;  // current index for size selection
  currentPieceAgeIdx: number; // current index for age selection (per piece)
  province?: string;
  deliveryCost?: number;
  deliveryDays?: string;
  selectedGroup?: string;
  phone?: string;
  address?: string;
  landmark?: string;
  lang: 'ar' | 'ku';
  dbBookingId?: number;
  receiptToken?: string;
  addingToExisting?: boolean;
  baseProductsCount?: number;
  sameAgeForAll?: boolean;  // when true: one age answer is applied to all pieces of same model
}

const bookingSessionMap = new Map<string, BookingSession>();
const ORDER_OFFSET = 873; // booking_id + ORDER_OFFSET = display order number (starts at #1000 for id=127)
// Rapid-fire album detection: track last image timestamp per sender
// If 2+ images arrive within 8 seconds → treat as group/album send
const senderLastImageTimeMap = new Map<string, number>(); // senderId → timestamp ms

/** Arabic ordinal label: 1→"اول", 2→"ثاني", 3→"ثالث", … */
function arabicOrdinal(n: number): string {
  const ordinals = ['اول', 'ثاني', 'ثالث', 'رابع', 'خامس', 'سادس', 'سابع', 'ثامن', 'تاسع', 'عاشر'];
  return n >= 1 && n <= ordinals.length ? ordinals[n - 1] : `${n}`;
}

/** Parse age string like "6 شهر" → 0.5, "3 سنة" → 3, "7" → 7 */
function parseAgeToYears(raw: string | number | null | undefined): number {
  if (raw === null || raw === undefined) return 0;
  if (typeof raw === 'number') return raw;
  const s = String(raw).trim();
  const num = parseFloat(s.replace(/[^\d.]/g, ''));
  if (isNaN(num)) return 0;
  if (s.includes('شهر') || s.includes('شهور')) return num / 12;
  return num;
}

/** Extract age in years from Arabic customer message. Returns null if not found. */
function extractAgeFromArabic(text: string): number | null {
  const s = normalizeArabic(text.toLowerCase());
  if (s.includes('سنتين')) return 2;
  // months
  const mMatch = /(\d+)\s*(شهر|اشهر|أشهر|شهور)/.exec(s);
  if (mMatch) return parseInt(mMatch[1]) / 12;
  // Arabic number words before age words
  const arabicWordMap: [string, number][] = [
    ['اثني عشر', 12], ['احدى عشر', 11], ['احد عشر', 11],
    ['عشرة', 10], ['عشر', 10], ['تسعة', 9], ['تسع', 9],
    ['ثمانية', 8], ['ثماني', 8], ['ثمان', 8], ['سبعة', 7], ['سبع', 7],
    ['ستة', 6], ['ست', 6], ['خمسة', 5], ['خمس', 5],
    ['اربعة', 4], ['اربع', 4], ['ثلاثة', 3], ['ثلاث', 3],
    ['اثنين', 2], ['اثنتين', 2], ['واحدة', 1], ['واحد', 1],
  ];
  const hasAgeWord = s.includes('سنة') || s.includes('سنين') || s.includes('سنوات') || s.includes('سنه');
  if (hasAgeWord) {
    for (const [word, val] of arabicWordMap) {
      if (s.includes(word)) return val;
    }
  }
  // Western digits + "سنة/سنين"
  const dMatch = /(\d+)\s*(سنة|سنين|سنوات|سنه)/.exec(s);
  if (dMatch) return parseInt(dMatch[1]);
  // bare digit (only if age-related word nearby)
  if (hasAgeWord) {
    const bareNum = /(\d+)/.exec(s);
    if (bareNum) return parseInt(bareNum[1]);
  }
  return null;
}

/** Does this text ask about age/ages? */
function isAgeQuestion(text: string): boolean {
  const s = normalizeArabic(text.toLowerCase());
  return ['عمر', 'اعمار', 'الاعمار', 'سنة', 'سنين', 'سنه', 'شهر', 'اشهر', 'سنتين',
    'للعمر', 'عمره', 'عمرها', 'عمرهم', 'متوفر للعمر'].some(kw => s.includes(kw));
}

/** Is product available for the given age in years? */
function isAvailableForAge(p: IdentifiedProduct, ageYears: number): boolean {
  return ageYears >= (p.ageMin || 0) && ageYears <= (p.ageMax || 99);
}

/** Detect yes/no from Arabic customer response */
function detectYesNo(text: string): 'yes' | 'no' | null {
  const s = normalizeArabic(text.toLowerCase().trim());
  const noKw = ['لا', 'لأ', 'لاء', 'ماريد', 'مريد', 'لاشكرا', 'مو ريد', 'ما ريد', 'مو', 'ماردة'];
  const yesKw = ['اي', 'اه', 'اكو', 'نعم', 'تمام', 'موافق', 'ايه', 'هاي', 'اوكيه', 'اوكي', 'اها', 'يس', 'هيه', 'طبعا'];
  for (const w of noKw) { if (s === w || s.startsWith(w + ' ') || s.endsWith(' ' + w)) return 'no'; }
  for (const w of yesKw) { if (s === w || s.startsWith(w + ' ') || s.endsWith(' ' + w)) return 'yes'; }
  // if starts with no word
  if (s.startsWith('لا') || s.startsWith('لأ')) return 'no';
  // if starts with yes word
  if (s.startsWith('اي') || s.startsWith('تمام') || s.startsWith('نعم')) return 'yes';
  return null;
}

/** Does text indicate cancellation of an order? */
function isCancellationRequest(text: string): boolean {
  const t = normalizeArabic(text.toLowerCase());
  // Must include explicit cancellation keyword
  const hasCancelKw = ['الغي', 'الغوا', 'لغو', 'إلغاء', 'الغيله', 'الغيلها', 'كنسل', 'بطلت'].some(kw => t.includes(normalizeArabic(kw)));
  // OR specific combo phrases
  const hasCombo = (t.includes(normalizeArabic('ما اريده')) || t.includes(normalizeArabic('ما اريدها')) || t.includes(normalizeArabic('ما بدها')))
    && (t.includes(normalizeArabic('طلبية')) || t.includes(normalizeArabic('اوردر')) || t.includes(normalizeArabic('بريد')));
  const hasCircumstance = t.includes(normalizeArabic('ظرف صار')) && (t.includes(normalizeArabic('طلبية')) || t.includes(normalizeArabic('اوردر')));
  return hasCancelKw || hasCombo || hasCircumstance;
}

/** Does text indicate wanting to add item(s) to an existing order? */
function isAddToOrderRequest(text: string): boolean {
  return [
    'اضيف', 'أضيف', 'اضافة', 'إضافة', 'اضيف علي', 'اضيف على', 'اضيف للطلبية',
    'اريد اضيف', 'اريد أضيف', 'ضيف لي', 'زيد لي',
  ].some(kw => text.includes(normalizeArabic(kw)));
}

/** Does text indicate wanting to exchange/swap a product? */
function isExchangeRequest(text: string): boolean {
  return [
    'ابدل', 'أبدل', 'تبديل', 'بدال', 'استبدال', 'غيرلي', 'غير لي', 'ابدلي',
    'اريد ابدل', 'اريد أبدل', 'بدل القطعة', 'بدل الموديل',
  ].some(kw => text.includes(normalizeArabic(kw)));
}

/** Does text indicate wanting to return/refund an order? */
function isReturnRequest(text: string): boolean {
  return [
    'ترجيع', 'ارجع', 'أرجع', 'رجعت', 'رجعوها', 'رجع الطلبية', 'رجعت الطلبية',
    'اريد ارجع', 'رد فلوس', 'رجعوا', 'المندوب منتظر', 'ارجعوا',
  ].some(kw => text.includes(normalizeArabic(kw)));
}

/** Does text indicate booking/ordering intent? */
function isBookingIntent(text: string): boolean {
  const s = normalizeArabic(text.toLowerCase());
  return ['احجز', 'احجزي', 'احجزلي', 'دزلي', 'ارسل لي', 'ارسلي', 'اريد احجز', 'ابي احجز', 'اشتري', 'اطلب',
          'اريده', 'اريدها', 'بديه', 'بدها', 'خذيه', 'خذيها', 'اوردر', 'اطلبيه',
          'اريد هذا', 'اريد هذه', 'اريد الموديل', 'ابي هذا', 'ابي هذه', 'ابي الموديل',
          'خذيه', 'خذ لي', 'حجزيه', 'حجزيها'].some(kw =>
    s.includes(normalizeArabic(kw))
  );
}

/** Does text ask about price? */
function isPriceQuestion(text: string): boolean {
  const s = normalizeArabic(text.toLowerCase());
  return ['سعر', 'بكم', 'ثمن', 'كم سعره', 'كم سعرها', 'يا سعر', 'يسعر', 'سعرها', 'سعره'].some(kw =>
    s.includes(normalizeArabic(kw))
  );
}

/** Derive a single size label from an age range (mirrors buildSizeQuickReplies single-step output) */
function ageToSizeLabel(ageMin: number, ageMax: number, lang: 'ar' | 'ku'): string {
  if (ageMin < 1) {
    const months = Math.round(ageMin * 12);
    const monthsEnd = Math.round(ageMax * 12);
    return lang === 'ku' ? `${months}–${monthsEnd} مانگ` : `${months}–${monthsEnd} شهر`;
  }
  return lang === 'ku' ? `${ageMin}–${ageMax} ساڵ` : `${ageMin}–${ageMax} سنة`;
}

function buildSizeQuickReplies(ageMin: number, ageMax: number, lang: 'ar' | 'ku'): Array<{ content_type: 'text'; title: string; payload: string }> {
  const btns: Array<{ content_type: 'text'; title: string; payload: string }> = [];
  // Steps: 6-month steps under 1 year, 1-year steps above
  // Stop at cur < ageMax so last label is always a valid range (never "X–X سنة")
  const steps: number[] = [];
  let cur = ageMin;
  while (cur < ageMax && steps.length < 11) {
    steps.push(cur);
    cur = cur < 1 ? cur + 0.5 : cur + 1;
  }
  for (const s of steps) {
    const next = s < 1 ? s + 0.5 : s + 1;
    let label: string;
    if (s < 1) {
      const months = Math.round(s * 12);
      const monthsNext = Math.round(Math.min(next, ageMax) * 12);
      label = lang === 'ku' ? `${months}–${monthsNext} مانگ` : `${months}–${monthsNext} شهر`;
    } else {
      const displayNext = Math.min(next, ageMax);
      label = lang === 'ku' ? `${s}–${displayNext} ساڵ` : `${s}–${displayNext} سنة`;
    }
    btns.push({ content_type: 'text', title: label.slice(0, 20), payload: `CAROUSEL_SIZE_${label}` });
  }
  return btns.slice(0, 13);
}

function formatBookingInvoice(session: BookingSession, senderId: string, orderNum?: number): string {
  const displayOrder = orderNum != null ? `#${orderNum}` : '(جديد)';
  const lines: string[] = [
    `📦 <b>طلب جديد ${displayOrder}</b>`,
    ``,
  ];
  let total = 0;
  for (let i = 0; i < session.products.length; i++) {
    const p = session.products[i];
    const price = p.price || 0;
    total += price;
    const sizeLabel = p.selectedSize ? ` (${p.selectedSize})` : '';
    const ageLabel = p.pickedAgeMin != null
      ? ` [${p.pickedAgeMin < 1 ? `${Math.round(p.pickedAgeMin*12)}شهر` : `${p.pickedAgeMin}`}–${p.pickedAgeMax != null && p.pickedAgeMax < 1 ? `${Math.round(p.pickedAgeMax*12)}شهر` : `${p.pickedAgeMax}سنة`}]`
      : '';
    const pieceLabelAr = session.products.length > 1 ? ` (${ordinalAr(i+1)} قطعة)` : '';
    lines.push(`• ${p.nameAr}${ageLabel}${sizeLabel}${pieceLabelAr} — ${price.toLocaleString()} د.ع`);
  }
  lines.push(``);
  const deliveryCostLabel = session.deliveryCost != null
    ? `${(session.deliveryCost / 1000).toFixed(0)}k د.ع`
    : 'غير محدد';
  lines.push(`💰 <b>المجموع:</b> ${total.toLocaleString()} د.ع`);
  lines.push(`🚚 <b>التوصيل:</b> ${deliveryCostLabel} — ${session.province || '—'}`);
  lines.push(`📱 <b>الهاتف:</b> ${session.phone || '—'}`);
  lines.push(`📍 <b>العنوان:</b> ${session.address || '—'}`);
  if (session.landmark) lines.push(`🏪 <b>أقرب نقطة دالة:</b> ${session.landmark}`);
  lines.push(``);
  // WhatsApp quick-link for the owner
  const phoneIntl = '9647503981573';
  const waText = encodeURIComponent(
    `📦 طلب ${displayOrder}\n` +
    session.products.map((p, i) => {
      const sizeLabel = p.selectedSize ? ` (${p.selectedSize})` : '';
      const ageLabel = p.pickedAgeMin != null ? ` [${p.pickedAgeMin}–${p.pickedAgeMax}سنة]` : '';
      const pieceLabelWa = session.products.length > 1 ? ` (${ordinalAr(i+1)} قطعة)` : '';
      return `• ${p.nameAr}${ageLabel}${sizeLabel}${pieceLabelWa} — ${(p.price||0).toLocaleString()} د.ع`;
    }).join('\n') +
    `\n🚚 ${session.province || '—'}: ${deliveryCostLabel}` +
    `\n📱 ${session.phone || '—'}` +
    `\n📍 ${session.address || '—'}` +
    (session.landmark ? `\n🏪 ${session.landmark}` : '')
  );
  lines.push(`📲 <a href="https://wa.me/${phoneIntl}?text=${waText}">افتح واتساب للتواصل</a>`);
  lines.push(`🔗 <a href="https://business.facebook.com/latest/inbox/messenger?selected_item_id=${senderId}">فتح المحادثة</a>`);
  return lines.join('\n');
}

/** Format human-readable age label: "2 الي 3 سنة" / "6 الي 12 شهر" */
function humanAgeLabel(ageMin?: number, ageMax?: number, lang: 'ar' | 'ku' = 'ar'): string {
  if (ageMin == null || ageMax == null) return '';
  if (ageMin < 1) {
    const mMin = Math.round(ageMin * 12);
    const mMax = Math.round(ageMax * 12);
    return lang === 'ku' ? `${mMin} تا ${mMax} مانگ` : `${mMin} الي ${mMax} شهر`;
  }
  return lang === 'ku' ? `${ageMin} تا ${ageMax} ساڵ` : `${ageMin} الي ${ageMax} سنة`;
}

/** Format booking summary text for customer (in chat) */
function formatCustomerReceipt(session: BookingSession): string {
  const lines: string[] = [];
  let productsTotal = 0;
  for (const p of session.products) productsTotal += ((p.price || 0) * (p.quantity || 1));
  const deliveryCost = session.deliveryCost ?? 0;
  const grandTotal = productsTotal + deliveryCost;
  const fmtK = (n: number) => `${(n / 1000).toFixed(0)} ألف`;
  const fmtKu = (n: number) => `${(n / 1000).toFixed(0)} هەزار`;

  if (session.lang === 'ku') {
    lines.push('✅ تم الحجز');
    lines.push('');
    lines.push('حسابت بەم شێوەیەیە عيني 🌸');
    lines.push('');
    for (const p of session.products) {
      const qty = p.quantity || 1;
      const age = humanAgeLabel(p.pickedAgeMin, p.pickedAgeMax, 'ku');
      const ageStr = age ? ` (${age})` : '';
      const qtyStr = qty > 1 ? ` ${qty} دانە` : ' یەک دانە';
      lines.push(`${fmtKu((p.price || 0) * qty)}${ageStr}${qtyStr}`);
    }
    if (deliveryCost > 0) lines.push(`${fmtKu(deliveryCost)} گەیاندن`);
    lines.push(`کۆی گشتی ${fmtKu(grandTotal)}`);
    lines.push('');
    const fullAddress = [session.province, session.address].filter(Boolean).join(' — ');
    lines.push(`ناونیشان ${fullAddress}`);
    if (session.deliveryDays) lines.push(`کاتی گەیاندن ${session.deliveryDays}`);
  } else {
    lines.push('✅ تم الحجز');
    lines.push('');
    lines.push('حسابج هيج عيني 🌸');
    lines.push('');
    for (const p of session.products) {
      const qty = p.quantity || 1;
      const age = humanAgeLabel(p.pickedAgeMin, p.pickedAgeMax, 'ar');
      const ageStr = age ? ` (${age})` : '';
      const qtyStr = qty > 1 ? ` ${qty} قطعة` : ' واحد قطعة';
      lines.push(`${fmtK((p.price || 0) * qty)}${ageStr}${qtyStr}`);
    }
    if (deliveryCost > 0) lines.push(`${fmtK(deliveryCost)} توصيل`);
    lines.push(`مجموع ${fmtK(grandTotal)}`);
    lines.push('');
    const fullAddress = [session.province, session.address].filter(Boolean).join(' ');
    lines.push(`عنوان ${fullAddress}`);
    if (session.deliveryDays) lines.push(`مدة التأخير ${session.deliveryDays}`);
  }
  return lines.join('\n');
}

/* ── Complaint/return constants (module-level for reuse) ─────────────────────
 * COMPLAINT_MARKER is saved in bot messages to mark complaint conversations.
 * RETURN_KEYWORDS trigger complaint escalation.
 */
const COMPLAINT_MARKER_TEXT = "رح انقل الرسالة للادارة";
const MENU_RETURN_KEYWORDS = [
  "تبديل","تبدل","استبدال","يبدل","ابدل","ابدلي","يبدلون",
  "ترجيع","ترجع","ارجاع","ارجعوا","ارجعي","راجع","مرجعة","يرجعون","رجعة",
  "مشكله","مشكلة","شكوى","شكاية",
  "معطوب","مكسور","باخ","مو زين","مو صح","غلط","خطأ",
  "ما وصل","ماوصل","ما جاء","مو جان","مجيش",
  "وصلت غلط","غلطة","خطامي",
];
function queueForSender(senderKey: string, fn: () => Promise<void>): void {
  const prev = senderProcessingLocks.get(senderKey) ?? Promise.resolve();
  const next = prev.then(() => fn()).catch(err => {
    console.log(`[QUEUE_ERR] ${senderKey}: ${err?.message}`);
  });
  senderProcessingLocks.set(senderKey, next);
  // Auto-cleanup: remove key once the chain settles so the Map doesn't grow forever
  next.finally(() => {
    if (senderProcessingLocks.get(senderKey) === next) senderProcessingLocks.delete(senderKey);
  });
}

/* ── Deduplication layer 3: send-level guard (blocks identical reply to same user within 15s) ──
 * This is the final safety net. Even if the message is processed twice (race condition, null mid,
 * server restart, or Meta double-delivery), the SAME text will never be sent twice to the same
 * recipient within the time window.
 * Key = recipientId, Value = { hash of last sent content, timestamp }
 */
const recentlySentReplies = new Map<string, { hash: string; ts: number }>();
const SEND_DEDUP_TTL_MS = 15 * 1000; // 15 seconds
function isDuplicateSend(recipientId: string, content: string): boolean {
  const now = Date.now();
  const key = recipientId;
  const entry = recentlySentReplies.get(key);
  // Clean up old entries
  for (const [k, v] of recentlySentReplies) {
    if (now - v.ts > SEND_DEDUP_TTL_MS * 4) recentlySentReplies.delete(k);
  }
  if (entry && entry.hash === content && now - entry.ts < SEND_DEDUP_TTL_MS) {
    return true;
  }
  recentlySentReplies.set(key, { hash: content, ts: now });
  return false;
}


function isWithinSchedule(start: string, end: string): boolean {
  const now = new Date();
  const [startH, startM] = start.split(":").map(Number);
  const [endH, endM] = end.split(":").map(Number);
  const current = now.getHours() * 60 + now.getMinutes();
  const startMins = startH * 60 + startM;
  const endMins = endH * 60 + endM;
  return current >= startMins && current <= endMins;
}


// ── Iraqi province detection & shipping cost lookup ──────────────────────────

/** Arabic names for all 19 Iraqi governorates (+ common variants) */
const IRAQI_PROVINCES_MAP: Record<string, string> = {
  "بغداد": "بغداد",
  "البصرة": "البصرة", "بصرة": "البصرة",
  "نينوى": "نينوى", "الموصل": "نينوى", "موصل": "نينوى",
  "أربيل": "أربيل", "اربيل": "أربيل", "إربيل": "أربيل",
  "السليمانية": "السليمانية", "سليمانية": "السليمانية",
  "كركوك": "كركوك",
  "الأنبار": "الأنبار", "انبار": "الأنبار", "الانبار": "الأنبار",
  "النجف": "النجف", "نجف": "النجف",
  "كربلاء": "كربلاء",
  "القادسية": "القادسية", "الديوانية": "القادسية", "ديوانية": "القادسية",
  "ذي قار": "ذي قار", "ذيقار": "ذي قار", "الناصرية": "ذي قار",
  "واسط": "واسط", "الكوت": "واسط",
  "ميسان": "ميسان", "العمارة": "ميسان",
  "المثنى": "المثنى", "السماوة": "المثنى",
  "صلاح الدين": "صلاح الدين", "تكريت": "صلاح الدين",
  "بابل": "بابل", "الحلة": "بابل",
  "دهوك": "دهوك",
  "حلبجة": "حلبجة",
};

/**
 * Scans conversation history (newest-first) to find the customer's province.
 * Returns the canonical province name if found, otherwise null.
 */
function extractProvince(history: Array<{ role: string; content: string }>): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.role !== "user") continue;
    for (const [variant, canonical] of Object.entries(IRAQI_PROVINCES_MAP)) {
      if (m.content.includes(variant)) return canonical;
    }
  }
  return null;
}

/**
 * Returns the shipping cost (IQD) for the given canonical province name,
 * or null if not found.
 */
function getShippingCost(
  province: string | null,
  feesMap: Record<string, number>,
): number | null {
  if (!province || Object.keys(feesMap).length === 0) return null;
  // Exact match
  if (feesMap[province] !== undefined) return feesMap[province];
  // Partial match (e.g. "البصرة" vs "بصرة")
  for (const [key, cost] of Object.entries(feesMap)) {
    if (province.includes(key) || key.includes(province)) return cost;
  }
  return null;
}

/**
 * Parse the deliveryFees settings JSON into a map of province → cost (IQD).
 * Keys starting with __ are group metadata, not provinces.
 */
function parseDeliveryFeesMap(deliveryFeesJson: string | null | undefined): Record<string, number> {
  if (!deliveryFeesJson) return {};
  try {
    const raw: Record<string, unknown> = JSON.parse(deliveryFeesJson);
    const result: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (k.startsWith('__')) continue;
      const num = Number(v);
      if (!isNaN(num) && num > 0) result[k] = num;
    }
    return result;
  } catch { return {}; }
}

interface DeliveryGroup { key: string; label: string; fee: number; days: string; }

/** Extract delivery groups from the raw deliveryFees JSON */
function extractGroupsFromFees(deliveryFeesJson: string | null | undefined): DeliveryGroup[] {
  if (!deliveryFeesJson) return [];
  try {
    const raw: Record<string, unknown> = JSON.parse(deliveryFeesJson);
    // Known group display names
    const knownLabels: Record<string, string> = {
      rest: 'المحافظات',
      iqliym: 'المحافظات الشمالية',
      zakho: 'زاخو',
    };
    const groups: DeliveryGroup[] = [];
    // First add known groups in order
    for (const [key, label] of Object.entries(knownLabels)) {
      const fee = raw[`__fee_${key}`];
      if (fee !== undefined) {
        groups.push({ key, label, fee: Number(fee), days: String(raw[`__days_${key}`] || '') });
      }
    }
    // Then add any extra groups not in knownLabels
    for (const k of Object.keys(raw)) {
      if (!k.startsWith('__fee_')) continue;
      const gkey = k.replace('__fee_', '');
      if (knownLabels[gkey]) continue; // already added
      groups.push({ key: gkey, label: gkey, fee: Number(raw[k]), days: String(raw[`__days_${gkey}`] || '') });
    }
    return groups;
  } catch { return []; }
}

/** Build quick-reply group buttons for province selection (shows groups, not individual provinces) */
function buildProvinceQuickReplies(deliveryFeesJson: string | null | undefined, lang: 'ar' | 'ku'): Array<{ content_type: 'text'; title: string; payload: string }> {
  const groups = extractGroupsFromFees(deliveryFeesJson);
  if (groups.length === 0) return [];
  return groups.slice(0, 13).map(g => ({
    content_type: 'text' as const,
    title: `${g.label} — ${(g.fee / 1000).toFixed(0)}k`.slice(0, 20),
    payload: `PROVINCE_GRP:${g.key}`,
  }));
}

/** Build carousel card elements for province/region selection */
function buildProvinceCarouselElements(
  deliveryFeesJson: string | null | undefined,
  lang: 'ar' | 'ku',
): Array<{ title: string; subtitle?: string; image_url?: string; buttons: Array<{ type: 'postback'; title: string; payload: string }> }> {
  const groups = extractGroupsFromFees(deliveryFeesJson);
  if (groups.length === 0) return [];
  return groups.slice(0, 10).map(g => {
    const feeK = (g.fee / 1000).toFixed(0);
    const subtitle = lang === 'ku'
      ? `گەیاندن: ${feeK}k د.ع — ${g.days}`
      : `التوصيل: ${feeK},000 دينار — ${g.days}`;
    return {
      title: g.label.slice(0, 80),
      subtitle: subtitle.slice(0, 80),
      buttons: [{ type: 'postback' as const, title: g.label.slice(0, 20), payload: `PROVINCE_GRP:${g.key}` }],
    };
  });
}

// Static fallback province lists per group (used when __group_X keys not in JSON)
const STATIC_PROVINCES: Record<string, string[]> = {
  iqliym: ['أربيل', 'السليمانية', 'دهوك', 'حلبجة'],
  rest: ['بغداد', 'البصرة', 'الموصل', 'كركوك', 'نينوى', 'ديالى', 'صلاح الدين', 'الأنبار', 'واسط', 'ميسان', 'القادسية', 'ذي قار', 'المثنى', 'بابل', 'كربلاء', 'النجف'],
  zakho: ['زاخو'],
};

/** Extract individual province names that belong to a given group key */
function extractProvincesForGroup(deliveryFeesJson: string | null | undefined, groupKey: string): string[] {
  if (!deliveryFeesJson) return STATIC_PROVINCES[groupKey] ?? [];
  try {
    const raw: Record<string, unknown> = JSON.parse(deliveryFeesJson);
    // Look for __group_<province> = groupKey entries
    const found: string[] = [];
    for (const [k, v] of Object.entries(raw)) {
      if (k.startsWith('__group_') && v === groupKey) {
        const pname = k.replace('__group_', '');
        if (pname) found.push(pname);
      }
    }
    if (found.length > 0) return found;
    // Fallback to static list
    return STATIC_PROVINCES[groupKey] ?? [];
  } catch { return STATIC_PROVINCES[groupKey] ?? []; }
}

/**
 * Look up delivery fee + days for a typed city/governorate name.
 * Searches across all groups and their province lists.
 * Returns null if no match found.
 */
function lookupDeliveryForCity(city: string, deliveryFeesJson: string | null | undefined): { fee: number; days: string; label: string } | null {
  if (!deliveryFeesJson) return null;
  const normCity = normalizeArabic(city.toLowerCase().trim());
  if (!normCity) return null;
  const groups = extractGroupsFromFees(deliveryFeesJson);
  // First: check if typed text exactly or partially matches a province in any group
  for (const grp of groups) {
    const provinces = extractProvincesForGroup(deliveryFeesJson, grp.key);
    for (const prov of provinces) {
      const normProv = normalizeArabic(prov.toLowerCase());
      if (normProv.includes(normCity) || normCity.includes(normProv)) {
        return { fee: grp.fee, days: grp.days, label: prov };
      }
    }
    // Also check group label itself (e.g. "إقليم", "زاخو")
    const normLabel = normalizeArabic(grp.label.toLowerCase());
    if (normLabel.includes(normCity) || normCity.includes(normLabel)) {
      return { fee: grp.fee, days: grp.days, label: grp.label };
    }
  }
  return null;
}

/** Extract Iraqi phone number from text (must be 11 digits starting with 07) */
function extractIraqiPhone(text: string): string | null {
  // Match 07XXXXXXXXX (11 digits)
  const match = text.replace(/\s/g, '').match(/07[0-9]{9}/);
  return match ? match[0] : null;
}

/** Format the province selection confirmation message */
function buildProvinceConfirmMsg(provinceName: string, fee: number | undefined, days: string, lang: 'ar' | 'ku'): string {
  const feeK = fee != null ? `${(fee / 1000).toFixed(0)} ألف توصيل` : 'سيتم الإخبار لاحقاً';
  const daysLine = days ? (lang === 'ku' ? days : `${days} يتأخر`) : '';
  if (lang === 'ku') {
    return `${provinceName}\n${feeK}\n${daysLine ? daysLine + '\n' : ''}\n📱 ژمارەی مۆبایلەکەت بنووسە:`;
  }
  return `${provinceName}\n${feeK}\n${daysLine ? daysLine + '\n' : ''}\n📱 اكتبي رقم هاتفك:`;
}

/** Build sub-province carousel cards for individual province selection */
function buildSubProvinceCarouselElements(
  provinces: string[],
  grp: DeliveryGroup,
  lang: 'ar' | 'ku',
): Array<{ title: string; subtitle?: string; image_url?: string; buttons: Array<{ type: 'postback'; title: string; payload: string }> }> {
  const feeK = (grp.fee / 1000).toFixed(0);
  const subtitle = lang === 'ku'
    ? `گەیاندن: ${feeK}k د.ع — ${grp.days}`
    : `التوصيل: ${feeK},000 دينار — ${grp.days}`;
  return provinces.slice(0, 10).map(prov => ({
    title: prov.slice(0, 80),
    subtitle: subtitle.slice(0, 80),
    buttons: [{ type: 'postback' as const, title: prov.slice(0, 20), payload: `PROVINCE_NAME:${prov}` }],
  }));
}

/** Arabic ordinal word for piece number (1→الأولى, 2→الثانية, …) */
function ordinalAr(n: number): string {
  const words = ['الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة', 'السادسة', 'السابعة', 'الثامنة', 'التاسعة', 'العاشرة'];
  return words[n - 1] ?? `رقم ${n}`;
}

/** Kurdish ordinal word for piece number */
function ordinalKu(n: number): string {
  const words = ['یەکەم', 'دووەم', 'سێیەم', 'چوارەم', 'پێنجەم', 'شەشەم', 'حەوتەم', 'هەشتەم', 'نۆیەم', 'دەیەم'];
  return words[n - 1] ?? `ژمارە ${n}`;
}

/** Build 7-card main menu carousel (5 main + 2 post-booking, deduped) shown after welcome greeting */
function buildMainMenuCarousel(lang: 'ar' | 'ku'): Array<{
  title: string; subtitle?: string; image_url?: string;
  buttons: Array<{ type: 'postback'; title: string; payload: string }>;
}> {
  if (lang === 'ku') {
    return [
      {
        title: '🛍️ پرسیاری نرخ',
        subtitle: 'بڕوانە کەلوپەلەکانمان و نرخەکانیان',
        buttons: [{ type: 'postback', title: 'پرسیاری نرخ', payload: 'MENU_PRICES' }],
      },
      {
        title: '📦 داواکاریەکەم لەکوێیە؟',
        subtitle: 'دۆخی داواکاریەکەت بزانە',
        buttons: [{ type: 'postback', title: 'داواکاریەکەم', payload: 'MENU_TRACK' }],
      },
      {
        title: '🔄 گۆڕینەوە',
        subtitle: 'گۆڕینەوەی کەلوپەلێک کڕیوتی',
        buttons: [{ type: 'postback', title: 'گۆڕینەوە', payload: 'MENU_EXCHANGE' }],
      },
      {
        title: '↩️ گەڕاندنەوە',
        subtitle: 'گەڕاندنەوەی کەلوپەلێک',
        buttons: [{ type: 'postback', title: 'گەڕاندنەوە', payload: 'MENU_RETURN' }],
      },
      {
        title: '🚚 گەیاندن',
        subtitle: 'نرخەکانی گەیاندن بۆ پارێزگاکان',
        buttons: [{ type: 'postback', title: 'نرخی گەیاندن', payload: 'MENU_DELIVERY' }],
      },
      {
        title: '❌ هەڵوەشاندنەوەی داواکاری',
        subtitle: 'داواکاریەکەت هەڵبوەشێنەوە',
        buttons: [{ type: 'postback', title: 'هەڵوەشاندنەوە', payload: 'POST_BOOK_CANCEL' }],
      },
      {
        title: '➕ زیادکردن بۆ داواکاری',
        subtitle: 'کەلوپەلێکی تر زیاد بکە',
        buttons: [{ type: 'postback', title: 'زیادکردن', payload: 'POST_BOOK_ADD' }],
      },
    ];
  }
  return [
    {
      title: '🛍️ أسعار و أعمار',
      subtitle: 'تصفحي مجموعتنا وأسعارنا',
      buttons: [{ type: 'postback', title: 'أسعار و أعمار', payload: 'MENU_PRICES' }],
    },
    {
      title: '📦 وين طلبيتي؟',
      subtitle: 'تابعي حالة طلبيتج',
      buttons: [{ type: 'postback', title: 'وين طلبيتي؟', payload: 'MENU_TRACK' }],
    },
    {
      title: '🔄 تبديل',
      subtitle: 'تبديل منتج حصلتِ عليه',
      buttons: [{ type: 'postback', title: 'تبديل', payload: 'MENU_EXCHANGE' }],
    },
    {
      title: '↩️ ترجيع',
      subtitle: 'إرجاع منتج حصلتِ عليه',
      buttons: [{ type: 'postback', title: 'ترجيع', payload: 'MENU_RETURN' }],
    },
    {
      title: '🚚 توصيل',
      subtitle: 'أسعار التوصيل للمحافظات',
      buttons: [{ type: 'postback', title: 'أسعار التوصيل', payload: 'MENU_DELIVERY' }],
    },
    {
      title: '❌ لغو الطلبية',
      subtitle: 'تريدين تلغين طلبيتج؟',
      buttons: [{ type: 'postback', title: 'لغو الطلبية', payload: 'POST_BOOK_CANCEL' }],
    },
    {
      title: '➕ إضافة للطلبية',
      subtitle: 'أضيفي قطعة لطلبيتج',
      buttons: [{ type: 'postback', title: 'إضافة للطلبية', payload: 'POST_BOOK_ADD' }],
    },
  ];
}

/** Build delivery info cards from deliveryFees settings (one card per group) */
function buildDeliveryInfoCarousel(
  deliveryFees: any,
  lang: 'ar' | 'ku',
): Array<{ title: string; subtitle?: string; buttons: Array<{ type: 'postback'; title: string; payload: string }> }> {
  const groups = extractGroupsFromFees(deliveryFees);
  if (groups.length === 0) return [];
  return groups.slice(0, 10).map(grp => {
    const feeK = Math.round(grp.fee / 1000);
    const title = grp.label.slice(0, 80);
    const subtitle = lang === 'ku'
      ? `نرخی گەیاندن: ${feeK} هەزار — ${grp.days}`
      : `سعر التوصيل: ${feeK} ألف — ${grp.days}`;
    return {
      title,
      subtitle: subtitle.slice(0, 80),
      buttons: [{ type: 'postback' as const, title: 'فهمت', payload: 'DELIVERY_OK' }],
    };
  });
}

/** Build 3-card post-booking carousel (prices / cancel / add) */
function buildPostBookingCarousel(lang: 'ar' | 'ku'): Array<{
  title: string; subtitle?: string;
  buttons: Array<{ type: 'postback'; title: string; payload: string }>;
}> {
  if (lang === 'ku') {
    return [
      {
        title: '🛍️ پرسیاری نرخ',
        subtitle: 'بڕوانە کەلوپەلەکانمان و نرخەکانیان',
        buttons: [{ type: 'postback', title: 'پرسیاری نرخ', payload: 'POST_BOOK_PRICES' }],
      },
      {
        title: '❌ هەڵوەشاندنەوەی داواکاری',
        subtitle: 'داواکاریەکەت هەڵبوەشێنەوە',
        buttons: [{ type: 'postback', title: 'هەڵوەشاندنەوە', payload: 'POST_BOOK_CANCEL' }],
      },
      {
        title: '➕ زیادکردن بۆ داواکاری',
        subtitle: 'کەلوپەلێکی تر زیاد بکە',
        buttons: [{ type: 'postback', title: 'زیادکردن', payload: 'POST_BOOK_ADD' }],
      },
    ];
  }
  return [
    {
      title: '🛍️ أسعار و أعمار',
      subtitle: 'تصفحي مجموعتنا وأسعارنا',
      buttons: [{ type: 'postback', title: 'أسعار و أعمار', payload: 'POST_BOOK_PRICES' }],
    },
    {
      title: '❌ لغو الطلبية',
      subtitle: 'تريدين تلغين طلبيتج؟',
      buttons: [{ type: 'postback', title: 'لغو الطلبية', payload: 'POST_BOOK_CANCEL' }],
    },
    {
      title: '➕ إضافة للطلبية',
      subtitle: 'أضيفي قطعة لطلبيتج',
      buttons: [{ type: 'postback', title: 'إضافة للطلبية', payload: 'POST_BOOK_ADD' }],
    },
  ];
}

/** Detect a province name in typed text, returns canonical name or null */
function detectProvinceInText(text: string): string | null {
  const t = text.trim();
  for (const [variant, canonical] of Object.entries(IRAQI_PROVINCES_MAP)) {
    if (t.includes(variant)) return canonical;
  }
  return null;
}

// ── Saved reply keyword match (pre-AI) ───────────────────────────────────────

/**
 * Normalises Arabic text for robust matching:
 * • Collapses alef variants (أ إ آ) → ا
 * • Normalises final ya (ى) → ي
 * • Normalises ta-marbuta (ة) → ه
 * • Strips all diacritics / harakat
 * • Lower-cases and trims
 */
// ── Fix 1 + الحل الأمثل: Fuzzy normaliser for Iraqi dialect ──────────────────
// Handles: ق↔گ↔ك, ة→ه, ى→ي, harakat, ch/p/g loanwords, common typos
function normalizeArabic(text: string): string {
  return text
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[\u064B-\u065F\u0670]/g, "") // strip harakat
    .replace(/گ/g, "ك")          // Iraqi گ → ك (e.g. اشگد → اشكد)
    .replace(/چ/g, "ج")          // Iraqi چ → ج
    .replace(/پ/g, "ب")          // پ → ب
    .replace(/ڤ/g, "ف")          // ڤ → ف
    .replace(/ق/g, "ك")          // ق → ك (Iraqi dialect — "اشقد" = "اشكد")
    .replace(/\s+/g, " ")        // collapse whitespace
    .toLowerCase()
    .trim();
}

/**
 * Returns the current clothing season for the Iraqi market.
 * Iraq climate for children's clothing retail:
 *   Apr–Oct  → 'summer'  (warm season, starts April)
 *   Nov–Mar  → 'winter'  (cool season)
 * Spring products (season='spring') are also shown during summer months
 * since the Iraqi spring is a brief warm transition.
 * Products with season='all' are ALWAYS included regardless of season.
 */
function getCurrentSeason(): 'summer' | 'winter' {
  const month = new Date().getMonth() + 1; // 1–12
  if (month >= 4 && month <= 10) return 'summer';
  return 'winter'; // Nov, Dec, Jan, Feb, Mar
}

/**
 * Expand a single keyword into all dialectal variants for maximum match coverage.
 * e.g. "اشقد" → ["اشقد","اشكد","اشگد","شقد","شكد"]
 */
function expandKeyword(kw: string): string[] {
  const base = normalizeArabic(kw);
  const variants = new Set<string>([base]);
  // q↔k swaps on original (before normalisation merges them)
  const withQ = kw.replace(/ك/g, "ق").replace(/گ/g, "ق");
  const withK = kw.replace(/ق/g, "ك").replace(/گ/g, "ك");
  variants.add(normalizeArabic(withQ));
  variants.add(normalizeArabic(withK));
  // Strip leading "ا" prefix variant (e.g. "اشكد" → "شكد")
  if (base.startsWith("ا")) variants.add(base.slice(1));
  return [...variants].filter(Boolean);
}

/**
 * Returns the first saved reply whose triggerKeywords match the user text.
 * Matching strategy (in order):
 *   1. Exact normalised substring match
 *   2. Dialectal expansion variants
 *   3. Word-level token match (each word of user text vs each keyword)
 * Returns null if no match.
 */
function getSavedReplyMatch(
  userText: string,
  replies: Array<{ triggerKeywords: string | null; replyAr: string; replyEn: string; isActive: boolean; titleAr: string }>,
): { replyAr: string; replyEn: string; titleAr: string; matchedKeyword: string } | null {
  const normText = normalizeArabic(userText);
  if (!normText) return null;
  const userWords = normText.split(/\s+/).filter(w => w.length > 0);

  // Best multi-word match (highest word-coverage score wins)
  let bestMulti: { reply: (typeof replies)[0]; keyword: string; score: number } | null = null;

  for (const r of replies) {
    if (!r.isActive || !r.triggerKeywords) continue;
    const rawKws = r.triggerKeywords.split(",").map(k => k.trim()).filter(Boolean);
    for (const rawKw of rawKws) {
      if (!rawKw || rawKw.length <= 2) continue;
      const kwNorm = normalizeArabic(rawKw);
      if (!kwNorm || kwNorm.length <= 2) continue;

      // ── Strategy 1: Exact normalized phrase substring match ──────────────
      if (normText.includes(kwNorm)) return { ...r, matchedKeyword: rawKw };

      const kwWords = kwNorm.split(/\s+/);

      if (kwWords.length === 1) {
        // ── Strategy 2: Single-word keyword — strict word + prefix match ───
        const variants = expandKeyword(rawKw);
        for (const v of variants) {
          if (!v || v.length <= 2) continue;
          if (userWords.some(w => w === v)) return { ...r, matchedKeyword: rawKw };
          if (v.length >= 4 && userWords.some(w => w.startsWith(v) || (v.startsWith(w) && w.length >= 4))) {
            return { ...r, matchedKeyword: rawKw };
          }
        }
      } else {
        // ── Strategy 3: Multi-word keyword — score by significant word hits ─
        // Each word ≥ 4 chars in the keyword that prefix-matches a user word adds +1 score.
        // The reply with the highest score (≥ 1) wins.
        let score = 0;
        for (const kwWord of kwWords) {
          if (kwWord.length < 4) continue;
          const variants = expandKeyword(kwWord);
          let hit = false;
          for (const v of variants) {
            if (!v || v.length < 4) continue;
            if (userWords.some(uw =>
              uw === v ||
              (uw.length >= 4 && v.length >= 4 && (uw.startsWith(v) || v.startsWith(uw)))
            )) { hit = true; break; }
          }
          if (hit) score++;
        }
        if (score > 0 && (!bestMulti || score > bestMulti.score)) {
          bestMulti = { reply: r, keyword: rawKw, score };
        }
      }
    }
  }

  if (bestMulti) return { ...bestMulti.reply, matchedKeyword: bestMulti.keyword };
  return null;
}

const META_API_VERSION = "v21.0";

/** Compute appsecret_proof = HMAC-SHA256(appSecret, accessToken) for Meta API calls */
function computeAppSecretProof(token: string, appSecret: string): string {
  return createHmac("sha256", appSecret).update(token).digest("hex");
}

/** Build the full Meta API URL with access_token and optional appsecret_proof */
function buildMetaUrl(baseUrl: string, token: string, appSecret?: string | null): string {
  const proof = appSecret ? `&appsecret_proof=${computeAppSecretProof(token, appSecret)}` : "";
  return `${baseUrl}?access_token=${token}${proof}`;
}

function resolveMetaActorId(platform: string, pageId: string, instagramAccountId?: string | null): string {
  // Always use the Facebook Page ID as the actor — even for Instagram.
  // Instagram Messaging via the Messenger Platform routes through the Page endpoint.
  // Using the IG account ID causes "(#3) does not have the capability" errors.
  return pageId;
}

async function sendMetaMessage(recipientId: string, pageId: string, accessToken: string, message: string, platform: string, instagramAccountId?: string | null, instagramAccessToken?: string | null, appSecret?: string | null) {
  // Layer 3 dedup: block identical reply to same recipient within 15 seconds
  if (isDuplicateSend(recipientId, message)) {
    console.log(`[SEND_DEDUP] Blocked duplicate reply to ${recipientId}: "${message.slice(0, 60)}"`);
    return;
  }

  const actorId = resolveMetaActorId(platform, pageId, instagramAccountId);
  // Always use Page Access Token — it has instagram_manage_messages permission for IG DMs
  const effectiveToken = accessToken;
  const baseUrl = `https://graph.facebook.com/${META_API_VERSION}/${actorId}/messages`;
  console.log(`[META_SEND] platform=${platform} actor=${actorId} recipient=${recipientId} tokenType=page`);

  try {
    const res = await fetch(buildMetaUrl(baseUrl, effectiveToken, appSecret), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text: message },
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.log(`[META_SEND_ERR] status=${res.status} body=${errBody.slice(0, 300)}`);
    } else {
      console.log(`[META_SEND_OK] Sent to ${recipientId} via ${platform}`);
    }
  } catch (err: any) {
    console.log(`[META_SEND_FAIL] ${err?.message}`);
  }
}

/** Send a text message with quick-reply buttons (Facebook & Instagram) */
async function sendMetaMessageWithQuickReplies(
  recipientId: string,
  pageId: string,
  accessToken: string,
  message: string,
  quickReplies: Array<{ title: string; payload: string }>,
  platform: string,
  instagramAccountId?: string | null,
  instagramAccessToken?: string | null,
  appSecret?: string | null,
) {
  const actorId = resolveMetaActorId(platform, pageId, instagramAccountId);
  const effectiveToken = accessToken; // Page Access Token has instagram_manage_messages permission
  const baseUrl = `https://graph.facebook.com/${META_API_VERSION}/${actorId}/messages`;
  const qr = quickReplies.slice(0, 13).map(q => ({
    content_type: "text",
    title: q.title.slice(0, 20),
    payload: q.payload.slice(0, 1000),
  }));
  try {
    const res = await fetch(buildMetaUrl(baseUrl, effectiveToken, appSecret), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text: message, quick_replies: qr },
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.log(`[META_QR_ERR] status=${res.status} body=${errBody.slice(0, 200)}`);
    } else {
      console.log(`[META_QR_OK] Sent quick-reply menu (${qr.length} buttons) to ${recipientId}`);
    }
  } catch (err: any) {
    console.log(`[META_QR_FAIL] ${err?.message}`);
  }
}

/** Send a Facebook Generic Template (carousel) — Messenger only, not Instagram */
async function sendMetaGenericTemplate(
  recipientId: string,
  pageId: string,
  accessToken: string,
  elements: Array<{
    title: string;
    subtitle?: string;
    image_url?: string;
    buttons?: Array<{ type: 'postback' | 'web_url'; title: string; payload?: string; url?: string }>;
  }>,
  platform: string,
  appSecret?: string | null,
  instagramAccountId?: string | null,
  instagramAccessToken?: string | null,
) {
  if (platform === 'instagram') {
    // ── Instagram alternative: quick-replies for menus, image+text for products ──
    if (!elements.length) return;
    const isProductCarousel = elements.some(el => el.buttons?.[0]?.payload?.startsWith('BOOK_'));
    if (isProductCarousel) {
      const PAGE_SIZE = 6;
      const items = elements.slice(0, PAGE_SIZE);
      const remaining = elements.slice(PAGE_SIZE);
      const IG_NUMS = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣'];
      await sendMetaMessage(recipientId, pageId, accessToken, '🖼️ جاري ارسال الصور مع الأسعار...', platform, instagramAccountId, instagramAccessToken, appSecret);
      await new Promise(r => setTimeout(r, 400));
      for (let i = 0; i < items.length; i++) {
        const el = items[i];
        if (el.image_url) {
          await sendMetaImage(recipientId, pageId, accessToken, el.image_url, platform, instagramAccountId, instagramAccessToken, appSecret);
          await new Promise(r => setTimeout(r, 500));
        }
        const caption = [el.title, el.subtitle].filter(Boolean).join('\n💰 ');
        await sendMetaMessage(recipientId, pageId, accessToken, `${IG_NUMS[i]} ${caption}`, platform, instagramAccountId, instagramAccessToken, appSecret);
        await new Promise(r => setTimeout(r, 300));
        if (i < items.length - 1) {
          await sendMetaMessage(recipientId, pageId, accessToken, '─────────────────', platform, instagramAccountId, instagramAccessToken, appSecret);
          await new Promise(r => setTimeout(r, 300));
        }
      }
      // Build final QR bar — numbered selection + optional "عرض المزيد"
      const bookable = items.filter(el => el.buttons?.[0]?.payload);
      const selectionQR = bookable.map((el, i) => ({
        content_type: 'text' as const,
        title: IG_NUMS[i],
        payload: el.buttons![0].payload!,
      }));
      if (remaining.length > 0) {
        // Queue remaining batches for this sender
        const existingQueue = senderProductQueueMap.get(recipientId);
        const remainingBatches: CarouselElement[][] = [];
        for (let i = 0; i < remaining.length; i += PAGE_SIZE) remainingBatches.push(remaining.slice(i, i + PAGE_SIZE));
        senderProductQueueMap.set(recipientId, { batches: [...(existingQueue?.batches ?? []), ...remainingBatches], platform });
        selectionQR.push({ content_type: 'text' as const, title: `📲 ${remaining.length} أكثر`, payload: 'PRODUCTS_NEXT_PAGE' });
      }
      if (selectionQR.length > 0) {
        await sendMetaMessageWithQuickReplies(
          recipientId, pageId, accessToken,
          remaining.length > 0
            ? `👆 اختاري رقم الموديل أو شوفي المزيد (${remaining.length} موديل باقي)`
            : '👆 اختاري رقم الموديل اللي تريدين تحجزينه',
          selectionQR, platform, instagramAccountId, instagramAccessToken, appSecret,
        );
      }
    } else {
      // Menu-type cards → send as quick replies
      const qr = elements.filter(el => el.buttons?.[0]?.payload).slice(0, 13).map(el => ({
        content_type: 'text' as const,
        title: el.title.slice(0, 20),
        payload: el.buttons![0].payload!,
      }));
      if (qr.length > 0) {
        await sendMetaMessageWithQuickReplies(
          recipientId, pageId, accessToken,
          '🏪 اختاري من القائمة 👇',
          qr, platform, instagramAccountId, instagramAccessToken, appSecret,
        );
      }
    }
    return;
  }
  if (!elements.length) return;

  // ── Facebook product carousel → vertical numbered approach with pagination ──
  const isFbProductCarousel = elements.some(el => el.buttons?.[0]?.payload?.startsWith('BOOK_'));
  if (isFbProductCarousel) {
    const FB_PAGE_SIZE = 10;
    const FB_NUMS = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
    const items = elements.slice(0, FB_PAGE_SIZE);
    const remaining = elements.slice(FB_PAGE_SIZE);
    await sendMetaMessage(recipientId, pageId, accessToken, '🖼️ جاري ارسال الصور مع الأسعار...', 'facebook', null, null, appSecret);
    await new Promise(r => setTimeout(r, 400));
    for (let i = 0; i < items.length; i++) {
      const el = items[i];
      if (el.image_url) {
        await sendMetaImage(recipientId, pageId, accessToken, el.image_url, 'facebook', null, null, appSecret);
        await new Promise(r => setTimeout(r, 500));
      }
      const caption = [el.title, el.subtitle].filter(Boolean).join('\n💰 ');
      await sendMetaMessage(recipientId, pageId, accessToken, `${FB_NUMS[i]} ${caption}`, 'facebook', null, null, appSecret);
      await new Promise(r => setTimeout(r, 300));
      if (i < items.length - 1) {
        await sendMetaMessage(recipientId, pageId, accessToken, '─────────────────', 'facebook', null, null, appSecret);
        await new Promise(r => setTimeout(r, 300));
      }
    }
    const bookable = items.filter(el => el.buttons?.[0]?.payload);
    const selectionQR = bookable.map((el, i) => ({
      content_type: 'text' as const,
      title: FB_NUMS[i],
      payload: el.buttons![0].payload!,
    }));
    if (remaining.length > 0) {
      const existingQueue = senderProductQueueMap.get(recipientId);
      const remainingBatches: CarouselElement[][] = [];
      for (let i = 0; i < remaining.length; i += FB_PAGE_SIZE) remainingBatches.push(remaining.slice(i, i + FB_PAGE_SIZE));
      senderProductQueueMap.set(recipientId, { batches: [...(existingQueue?.batches ?? []), ...remainingBatches], platform: 'facebook' });
      selectionQR.push({ content_type: 'text' as const, title: `📲 ${remaining.length} أكثر`, payload: 'PRODUCTS_NEXT_PAGE' });
    }
    if (selectionQR.length > 0) {
      await sendMetaMessageWithQuickReplies(
        recipientId, pageId, accessToken,
        remaining.length > 0
          ? `👆 اختاري رقم الموديل أو شوفي المزيد (${remaining.length} موديل باقي)`
          : '👆 اختاري رقم الموديل اللي تريدين تحجزينه',
        selectionQR, 'facebook', null, null, appSecret,
      );
    }
    return;
  }

  // ── Facebook non-product carousel (menus, age-type, etc.) → horizontal carousel ──
  const actorId = pageId;
  const baseUrl = `https://graph.facebook.com/${META_API_VERSION}/${actorId}/messages`;
  const cards = elements.slice(0, 10).map(el => {
    const card: Record<string, unknown> = { title: el.title.slice(0, 80) };
    if (el.subtitle) card.subtitle = el.subtitle.slice(0, 80);
    if (el.image_url) card.image_url = el.image_url;
    if (el.buttons?.length) card.buttons = el.buttons.slice(0, 3);
    return card;
  });
  try {
    const res = await fetch(buildMetaUrl(baseUrl, accessToken, appSecret), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { attachment: { type: 'template', payload: { template_type: 'generic', image_aspect_ratio: 'square', elements: cards } } },
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.log(`[CAROUSEL_ERR] status=${res.status} body=${errBody.slice(0, 300)}`);
    } else {
      console.log(`[CAROUSEL_OK] Sent carousel (${cards.length} cards) to ${recipientId}`);
    }
  } catch (err: any) {
    console.log(`[CAROUSEL_FAIL] ${err?.message}`);
  }
}

/** Number emojis for the numbered menu list (1-20) */
const NUM_EMOJIS = ["1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣","🔟","⑪","⑫","⑬","⑭","⑮","⑯","⑰","⑱","⑲","⑳"];

/** Build a numbered menu text from active menu items */
function buildNumberedMenu(
  items: Array<{ title: string; shortTitle?: string }>,
  prompt: string,
): string {
  const lines = items.slice(0, 20).map((m, i) => {
    const badge = NUM_EMOJIS[i] ?? `${i + 1}.`;
    return `${badge} ${m.shortTitle || m.title}`;
  });
  return `${prompt}\n\n${lines.join("\n")}`;
}

/** Parse a customer's input as a 1-based menu index (handles Arabic & Western numerals) */
function parseMenuNumber(text: string): number | null {
  const t = text.trim()
    .replace(/[\u0660-\u0669]/g, c => String(c.charCodeAt(0) - 0x0660)) // Arabic-Indic
    .replace(/[\u06F0-\u06F9]/g, c => String(c.charCodeAt(0) - 0x06F0)); // Extended Arabic-Indic
  const n = parseInt(t, 10);
  if (!isNaN(n) && n >= 1 && n <= 20 && String(n) === t) return n;
  return null;
}

/**
 * Ensures the given image URL is an absolute public URL that Meta servers can fetch.
 * - If already https:// → use as-is
 * - If relative (/uploads/... or /api/storage/...) → prefix with the Replit public domain
 * Returns null if the URL cannot be resolved to an absolute public form.
 */
function ensureAbsoluteImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const rawDomain = (process.env.LOCAL_DOMAIN || "localhost:3000").split(",")[0].trim();
  // Normalise any object-storage URL to the CURRENT running domain.
  // Images uploaded in dev have a picard.replit.dev host; in production they
  // must be served from the live domain so Meta can fetch them publicly.
  if (url.includes("/api/storage/objects/")) {
    const pathMatch = url.match(/(\/api\/storage\/objects\/.+)/);
    if (pathMatch) {
      const storagePath = pathMatch[1];
      if (rawDomain) {
        const resolved = `https://${rawDomain}${storagePath}`;
        console.log(`[IMG_URL] Normalised storage URL → ${resolved.slice(0, 100)}`);
        return resolved;
      }
    }
  }
  if (url.startsWith("https://") || url.startsWith("http://")) return url;
  if (!rawDomain) {
    console.log(`[IMG_URL] Cannot resolve relative path "${url.slice(0, 80)}" — no LOCAL_DOMAIN set`);
    return null;
  }
  const path = url.startsWith("/") ? url : `/${url}`;
  return `https://${rawDomain}${path}`;
}

/** Build carousel elements from available inventory items that have images */
/** Map age in years to human-readable Arabic label */
function formatAgeLabel(years: number): string {
  const map: Record<number, string> = {
    0: '👶 حديث الولادة',
    1: '1️⃣ سنة',
    2: '2️⃣ سنتين',
    3: '3️⃣ ٣ سنوات',
    4: '4️⃣ ٤ سنوات',
    5: '5️⃣ ٥ سنوات',
    6: '6️⃣ ٦ سنوات',
    7: '7️⃣ ٧ سنوات',
    8: '8️⃣ ٨ سنوات',
    9: '9️⃣ ٩ سنوات',
    10: '🔟 ١٠ سنوات',
  };
  return map[years] ?? `${years} سنوات`;
}

/** Fetch distinct age groups from available inventory as quick-reply buttons */
async function getAgeRangeButtons(): Promise<Array<{ title: string; payload: string }>> {
  try {
    const items = await db.select({ ageMin: inventoryTable.ageMin, ageMax: inventoryTable.ageMax })
      .from(inventoryTable).where(eq(inventoryTable.available, true)).limit(200);
    const ages = new Set<number>();
    for (const item of items) {
      const min = item.ageMin ?? 0;
      const max = item.ageMax ?? min;
      for (let y = min; y <= max; y++) ages.add(y);
    }
    return Array.from(ages).sort((a, b) => a - b)
      .slice(0, 11)
      .map(y => ({ title: formatAgeLabel(y).slice(0, 20), payload: `AGE_PICK_${y}` }));
  } catch {
    return [];
  }
}

// Fixed store age ranges (in years) — sorted from youngest to oldest. Labels shown in months.
const STORE_AGE_RANGES: Array<{ minY: number; maxY: number; label: string; alwaysShow?: boolean }> = [
  { minY: 0.5, maxY: 1,  label: '6 الي 12 شهر',  alwaysShow: true },
  { minY: 1,   maxY: 2,  label: '1 الي 2 سنة' },
  { minY: 2,   maxY: 3,  label: '2 الي 3 سنة' },
  { minY: 3,   maxY: 4,  label: '3 الي 4 سنة' },
  { minY: 4,   maxY: 5,  label: '4 الي 5 سنة' },
  { minY: 5,   maxY: 6,  label: '5 الي 6 سنة' },
  { minY: 6,   maxY: 7,  label: '6 الي 7 سنة' },
  { minY: 7,   maxY: 8,  label: '7 الي 8 سنة' },
  { minY: 9,   maxY: 11, label: '9 الي 11 سنة' },
  { minY: 11,  maxY: 12, label: '11 الي 12 سنة' },
];

/** Translate English season category to Arabic */
function translateSeasonAr(category?: string | null): string {
  const map: Record<string, string> = {
    summer: 'صيفي',
    winter: 'شتوي',
    spring: 'بهاري',
    autumn: 'خريفي',
    fall: 'خريفي',
  };
  return map[(category ?? '').toLowerCase()] ?? (category ?? '');
}

/** Build season selection carousel cards (شتوي / صيفي / بهاري) */
function buildSeasonCarouselElements(): Array<{
  title: string; subtitle: string; image_url?: string;
  buttons: Array<{ type: 'postback'; title: string; payload: string }>;
}> {
  return [
    {
      title: '☀️ صيفي',
      subtitle: 'ملابس الصيف والمواسم الحارة',
      buttons: [{ type: 'postback' as const, title: 'صيفي', payload: 'SELECT_SEASON_summer' }],
    },
    {
      title: '🧥 شتوي',
      subtitle: 'ملابس الشتاء والمواسم الباردة',
      buttons: [{ type: 'postback' as const, title: 'شتوي', payload: 'SELECT_SEASON_winter' }],
    },
    {
      title: '🌸 بهاري',
      subtitle: 'ملابس الربيع والخريف',
      buttons: [{ type: 'postback' as const, title: 'بهاري', payload: 'SELECT_SEASON_spring' }],
    },
    {
      title: '🎀 كل المواسم',
      subtitle: 'عرض جميع الموديلات المتوفرة',
      buttons: [{ type: 'postback' as const, title: 'كل المواسم', payload: 'SELECT_SEASON_all' }],
    },
  ];
}

/** Build gender selection carousel cards (ولادي / بنات / مختلط) */
function buildGenderCarouselElements(): Array<{
  title: string; subtitle: string; image_url?: string;
  buttons: Array<{ type: 'postback'; title: string; payload: string }>;
}> {
  return [
    {
      title: '👧 بنات',
      subtitle: 'ملابس بنات',
      buttons: [{ type: 'postback' as const, title: 'بنات', payload: 'SELECT_GENDER_girls' }],
    },
    {
      title: '👦 ولادي',
      subtitle: 'ملابس أولاد',
      buttons: [{ type: 'postback' as const, title: 'ولادي', payload: 'SELECT_GENDER_boys' }],
    },
    {
      title: '👫 مختلط',
      subtitle: 'ملابس ولادي وبنات',
      buttons: [{ type: 'postback' as const, title: 'مختلط', payload: 'SELECT_GENDER_both' }],
    },
  ];
}

/**
 * Returns true if a product's age range(s) overlap with target [minY, maxY) years.
 * Reads ageRanges JSON first; falls back to scalar age_min / age_max.
 */
function productAgeOverlaps(
  item: { ageMin: number | null; ageMax: number | null; ageRanges: string | null },
  minY: number,
  maxY: number,
): boolean {
  if (item.ageRanges) {
    try {
      const ranges = JSON.parse(item.ageRanges) as Array<{ min: unknown; max: unknown }>;
      if (Array.isArray(ranges) && ranges.length > 0) {
        return ranges.some(r => {
          const rMin = parseAgeToYears(r.min as string | number);
          const rMax = parseAgeToYears(r.max as string | number);
          const effectiveMax = rMax > rMin ? rMax : rMin + 1;
          return rMin < maxY && effectiveMax > minY;
        });
      }
    } catch { /* ignore JSON parse errors */ }
  }
  // Fallback: scalar columns
  const pMin = Number(item.ageMin ?? 0);
  const pMax = Number(item.ageMax ?? pMin + 1);
  return pMin < maxY && pMax > minY;
}

/** Build age-range carousel cards using the store's fixed age categories */
async function buildAgeCarouselElements(season?: string, gender?: string): Promise<Array<{
  title: string;
  subtitle?: string;
  image_url?: string;
  buttons: Array<{ type: 'postback'; title: string; payload: string }>;
}>> {
  try {
    const allItems = await db.select({
      ageMin: inventoryTable.ageMin,
      ageMax: inventoryTable.ageMax,
      ageRanges: inventoryTable.ageRanges,
      category: inventoryTable.category,
      gender: inventoryTable.gender,
    }).from(inventoryTable).where(eq(inventoryTable.available, true)).limit(500);

    // Apply season filter — category stores "Summer"/"Winter"/"Spring" (case-insensitive)
    const seasonFiltered = (!season || season === 'all')
      ? allItems
      : allItems.filter(i => (i.category ?? '').toLowerCase() === season.toLowerCase());

    // Apply gender filter — gender stores "Girls"/"Boys"/"both" (case-insensitive)
    const items = (!gender || gender === 'both')
      ? seasonFiltered
      : seasonFiltered.filter(i => {
          const g = (i.gender ?? 'both').toLowerCase();
          return g === 'both' || g === gender.toLowerCase();
        });

    return STORE_AGE_RANGES.map(({ minY, maxY, label, alwaysShow }) => {
      const count = items.filter(i => productAgeOverlaps(i, minY, maxY)).length;

      const minMonths = Math.round(minY * 12);
      const maxMonths = Math.round(maxY * 12);
      const subtitle = `${count} موديل متوفر 👗`;
      return {
        title: label,
        subtitle,
        alwaysShow: alwaysShow ?? false,
        buttons: [{ type: 'postback' as const, title: label.slice(0, 20), payload: `AGE_RANGE_${minMonths}_${maxMonths}` }],
      };
    }).filter(card => {
      return card.alwaysShow || parseInt(card.subtitle!) > 0;
    });
  } catch {
    return [];
  }
}

async function buildInventoryCarousel(
  lang: 'ar' | 'ku',
  ageMin?: number,
  ageMax?: number,
  season?: string,
  gender?: string,
): Promise<Array<{ title: string; subtitle?: string; image_url?: string; buttons?: Array<{ type: 'postback'; title: string; payload: string }> }>> {
  try {
    const allItems = await db.select({
      nameAr: inventoryTable.nameAr,
      nameEn: inventoryTable.nameEn,
      price: inventoryTable.price,
      discountPrice: inventoryTable.discountPrice,
      isOnSale: inventoryTable.isOnSale,
      publicImageUrl: inventoryTable.publicImageUrl,
      imageUrl: inventoryTable.imageUrl,
      category: inventoryTable.category,
      ageMin: inventoryTable.ageMin,
      ageMax: inventoryTable.ageMax,
      ageRanges: inventoryTable.ageRanges,
      gender: inventoryTable.gender,
    }).from(inventoryTable).where(eq(inventoryTable.available, true)).limit(200);

    // Season filter — category stores "Summer"/"Winter"/"Spring" (case-insensitive)
    const seasonFiltered = (!season || season === 'all')
      ? allItems
      : allItems.filter(i => (i.category ?? '').toLowerCase() === season.toLowerCase());

    // Gender filter — gender stores "Girls"/"Boys"/"both" (case-insensitive)
    const genderFiltered = (!gender || gender === 'both')
      ? seasonFiltered
      : seasonFiltered.filter(i => {
          const g = (i.gender ?? 'both').toLowerCase();
          return g === 'both' || g === gender.toLowerCase();
        });

    // Age range filter — uses ageRanges JSON first, falls back to scalar age_min/age_max
    const agePassed = (ageMin != null && ageMax != null)
      ? genderFiltered.filter(i => productAgeOverlaps(i, ageMin, ageMax))
      : ageMin != null
        ? genderFiltered.filter(i => productAgeOverlaps(i, ageMin, ageMin + 0.01))
        : genderFiltered;
    const items = agePassed;

    // Deduplicate by nameAr — same model may have multiple colour variants in DB
    const seenNames = new Set<string>();
    const unique = agePassed.filter(item => {
      const key = (item.nameAr || '').trim().toLowerCase();
      if (seenNames.has(key)) return false;
      seenNames.add(key);
      return true;
    });

    // Prefer items with public images
    const withImages = unique.filter(i => i.publicImageUrl || i.imageUrl);
    const source = withImages.length >= 2 ? withImages : unique;

    return source.slice(0, 100).map(item => {
      const rawImg = item.publicImageUrl || item.imageUrl || '';
      const imgUrl = ensureAbsoluteImageUrl(rawImg) ?? undefined;
      const name = (lang === 'ku' ? item.nameEn : item.nameAr) || item.nameAr;
      const originalPrice = Number(item.price ?? 0);
      const salePrice = (item.isOnSale && item.discountPrice) ? Number(item.discountPrice) : null;
      // Effective price used for booking — use sale price if on sale
      const effectivePrice = salePrice ?? originalPrice;
      // Price label: show both if on sale ("40 ألف ← 35 ألف"), otherwise just the price
      const priceLabel = effectivePrice > 0
        ? salePrice
          ? `${Math.round(originalPrice / 1000)} الف ← ${Math.round(salePrice / 1000)} الف دينار 🏷️`
          : `${Math.round(originalPrice / 1000)} الف دينار`
        : '';
      // Encode effective (discounted) price in payload so booking sessions use correct price
      const bookPayload = `BOOK_${encodeURIComponent(item.nameAr || '')}_${Math.round(effectivePrice)}_${item.ageMin ?? 0}_${item.ageMax ?? 12}`;
      return {
        title: name.slice(0, 80),
        subtitle: [translateSeasonAr(item.category), priceLabel].filter(Boolean).join(' · ').slice(0, 80) || undefined,
        image_url: imgUrl,
        buttons: [{ type: 'postback' as const, title: lang === 'ku' ? 'داواکاری' : 'احجزيه', payload: bookPayload }],
      };
    });
  } catch (err: any) {
    console.log('[CAROUSEL_BUILD_ERR]', err?.message);
    return [];
  }
}

/** Build FAQ quick replies from the top active menu items */
function buildFaqQuickReplies(
  items: Array<{ title: string; shortTitle?: string }>,
  lang: 'ar' | 'ku',
): Array<{ title: string; payload: string }> {
  const top = items.slice(0, 10);
  // Always include a "back to menu" option at the end
  const qr = top.slice(0, 10).map((m, i) => ({
    title: ((m.shortTitle || m.title) as string).slice(0, 20),
    payload: `MENU_${i + 1}`,
  }));
  return qr.slice(0, 13);
}

/** Send carousel + FAQ quick replies in one go (carousel mode — text+carousel hybrid) */
async function sendCarouselAndFaq(
  senderId: string,
  pageId: string,
  accessToken: string,
  platform: string,
  lang: 'ar' | 'ku',
  activeMenuItems: Array<{ title: string; shortTitle?: string }>,
  appSecret?: string | null,
  ageFilter?: number,
  instagramAccountId?: string | null,
  instagramAccessToken?: string | null,
) {
  // 1. Carousel — skip if sent within the last 30s (double-tap guard)
  if (!isDuplicateCarouselSend(senderId)) {
    const elements = await buildInventoryCarousel(lang, ageFilter);
    if (elements.length >= 2) {
      await sendMetaGenericTemplate(senderId, pageId, accessToken, elements.slice(0, 10), platform, appSecret, instagramAccountId, instagramAccessToken);
      await new Promise(r => setTimeout(r, 700));
    }
  } else {
    console.log(`[CAROUSEL] Skipping duplicate send for ${senderId} (within 30s window)`);
  }
  // 2. Quick Replies with top FAQ buttons
  const qr = buildFaqQuickReplies(activeMenuItems, lang);
  const promptText = lang === 'ku'
    ? 'ژمارە بنووسە یان هەڵبژێرە 👇'
    : 'اكتبي الرقم أو اختاري سؤالك 👇';
  await sendMetaMessageWithQuickReplies(senderId, pageId, accessToken, promptText, qr, platform, instagramAccountId, instagramAccessToken, appSecret);
}

/** Send ALL inventory as carousels (carousel-only mode) — no text menu after */
async function sendAllCarouselsOnly(
  senderId: string,
  pageId: string,
  accessToken: string,
  platform: string,
  lang: 'ar' | 'ku',
  appSecret?: string | null,
  ageMin?: number,
  ageMax?: number,
  season?: string,
  gender?: string,
  force?: boolean,
  instagramAccountId?: string | null,
  instagramAccessToken?: string | null,
) {
  if (!force && isDuplicateCarouselSend(senderId)) {
    console.log(`[CAROUSEL] Skipping duplicate send for ${senderId} (within 30s window)`);
    return;
  }
  // Always update the timestamp (even when forced)
  if (force) lastCarouselSentAt.set(senderId, Date.now());
  const elements = await buildInventoryCarousel(lang, ageMin, ageMax, season, gender);
  if (elements.length === 0) {
    await sendMetaMessageWithQuickReplies(
      senderId, pageId, accessToken,
      lang === 'ku' ? 'ببورە، کاڵایەکی بەردەست نییە بۆ ئەم تەمەنە 😔' : 'نعتذر لج اختي 🙏\nماكو موديلات لهذا العمر حالياً',
      [{ content_type: 'text' as const, title: '🔄 تغيير العمر', payload: 'SHOW_AGE_CAROUSEL' }],
      platform, instagramAccountId, instagramAccessToken, appSecret,
    );
    return;
  }
  // Both Instagram and Facebook now use the vertical numbered approach inside sendMetaGenericTemplate
  await sendMetaGenericTemplate(senderId, pageId, accessToken, elements, platform, appSecret, instagramAccountId, instagramAccessToken);
}

async function sendMetaVideoByUrl(recipientId: string, pageId: string, accessToken: string, videoUrl: string, platform: string, instagramAccountId?: string | null, instagramAccessToken?: string | null, appSecret?: string | null) {
  const actorId = resolveMetaActorId(platform, pageId, instagramAccountId);
  const effectiveToken = accessToken; // Page Access Token has instagram_manage_messages permission
  const baseUrl = `https://graph.facebook.com/${META_API_VERSION}/${actorId}/messages`;
  try {
    const res = await fetch(buildMetaUrl(baseUrl, effectiveToken, appSecret), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { attachment: { type: 'video', payload: { url: videoUrl, is_reusable: true } } },
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.log(`[VIDEO_SEND_FAIL] HTTP ${res.status}: ${errBody.slice(0, 300)}`);
    } else {
      console.log(`[VIDEO_SENT] Tutorial video sent to ${recipientId} url=${videoUrl}`);
    }
  } catch (err: any) {
    console.log(`[VIDEO_SEND_FAIL] ${err?.message}`);
  }
}

async function sendMetaImage(recipientId: string, pageId: string, accessToken: string, imageUrl: string, platform: string, instagramAccountId?: string | null, instagramAccessToken?: string | null, appSecret?: string | null) {
  // Ensure Meta servers can fetch the image — must be an absolute public URL
  const absoluteUrl = ensureAbsoluteImageUrl(imageUrl);
  if (!absoluteUrl) {
    const errMsg = `[MEDIA_SEND_FAIL] Cannot resolve image URL to absolute: "${imageUrl.slice(0, 120)}"`;
    console.log(errMsg);
    throw new Error(errMsg);
  }

  const actorId = resolveMetaActorId(platform, pageId, instagramAccountId);
  const effectiveToken = accessToken; // Page Access Token has instagram_manage_messages permission
  const baseUrl = `https://graph.facebook.com/${META_API_VERSION}/${actorId}/messages`;

  try {
    const res = await fetch(buildMetaUrl(baseUrl, effectiveToken, appSecret), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { attachment: { type: "image", payload: { url: absoluteUrl, is_reusable: true } } },
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      const errMsg = `[MEDIA_SEND_FAIL] HTTP ${res.status} sending image to ${recipientId} | url=${imageUrl.slice(0, 120)} | meta_error=${errBody.slice(0, 400)}`;
      console.log(errMsg);
      throw new Error(errMsg);
    }
    const resData = await res.json().catch(() => ({})) as any;
    if (resData?.message_id) {
      console.log(`[META_IMG_OK] Sent to ${recipientId} | message_id=${resData.message_id}`);
    }
  } catch (err: any) {
    // Re-throw so callers can detect failure and log [MEDIA_SEND_FAIL]
    if (!err?.message?.startsWith("[MEDIA_SEND_FAIL]")) {
      console.log(`[MEDIA_SEND_FAIL] Network error sending image to ${recipientId} | url=${imageUrl.slice(0, 120)} | ${err?.message}`);
    }
    throw err;
  }
}


/* ── Fetch recent conversation messages from Meta API (safety-net for sparse DB history) ──
 * Used when our DB has < 8 messages for a sender, meaning the bot may have just started
 * tracking or the sender previously chatted without the bot. This fills context gaps.
 */
async function fetchMetaHistory(
  senderId: string, pageId: string, accessToken: string, platform: string, limit: number,
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  try {
    const userParam = platform === "instagram" ? "instagram_id" : "user_id";
    const url = `https://graph.facebook.com/v21.0/me/conversations` +
      `?${userParam}=${senderId}` +
      `&fields=messages.limit(${limit}){message,from,created_time}` +
      `&access_token=${accessToken}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json() as any;
    const conv = data?.data?.[0];
    if (!conv?.messages?.data) return [];
    // Meta returns messages newest-first; reverse to get chronological order
    const msgs: any[] = [...conv.messages.data].reverse();
    return msgs
      .map((m: any) => ({
        role: (m.from?.id === pageId ? "assistant" : "user") as "user" | "assistant",
        content: (m.message || "").trim(),
      }))
      .filter((m) => m.content.length > 0);
  } catch {
    return [];
  }
}

function parseSendProductsTag(reply: string): { cleanReply: string; productIds: string[] | null } {
  const match = reply.match(/\[SEND_PRODUCTS:([^\]]+)\]/i);
  if (!match) return { cleanReply: reply, productIds: null };
  const cleanReply = reply.replace(/\[SEND_PRODUCTS:[^\]]+\]/gi, "").trim();
  const ids = match[1].split(",").map((s: string) => s.trim()).filter(Boolean);
  return { cleanReply, productIds: ids.length > 0 ? ids : null };
}

/**
 * Senders for which the bot is deactivated (admin/service mode).
 * Populated from DB isEscalated=true on first message; persists per process restart.
 */
const deactivatedSenders = new Set<string>();

/** Bot message phrases that signal admin handover — trigger bot deactivation */
const COMPLAINT_HANDOVER_PHRASES = [
  "دزيت المشكلة لموظف المخزن",
  "رح يتواصل وياج مباشرة",
  "رح تتواصل وياج الإدارة",
];

function isComplaintHandover(reply: string): boolean {
  return COMPLAINT_HANDOVER_PHRASES.some(p => reply.includes(p));
}

/** Format price as human shorthand: 25000 → "25"  /  15500 → "15" */
function formatShorthandPrice(price: number | null | undefined): string {
  if (!price || price <= 0) return "غير متوفر";
  return price >= 1000 ? `${Math.round(price / 1000)}` : `${Math.round(price)}`;
}

/** Mark conversation as seen in Meta inbox so it clears from unread */
async function markMetaSeen(
  recipientId: string, pageId: string, accessToken: string,
): Promise<void> {
  try {
    await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/${pageId}/messages?access_token=${accessToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient: { id: recipientId }, sender_action: "mark_seen" }),
      },
    );
  } catch { /* non-critical */ }
}

/** Send typing_on to scroll the chat to the bottom and signal the bot is working */
async function sendTypingOn(
  recipientId: string, pageId: string, accessToken: string,
): Promise<void> {
  try {
    await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/${pageId}/messages?access_token=${accessToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient: { id: recipientId }, sender_action: "typing_on" }),
      },
    );
  } catch { /* non-critical */ }
}

/** Send typing_off to cancel the typing indicator */
async function sendTypingOff(
  recipientId: string, pageId: string, accessToken: string,
): Promise<void> {
  try {
    await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/${pageId}/messages?access_token=${accessToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient: { id: recipientId }, sender_action: "typing_off" }),
      },
    );
  } catch { /* non-critical */ }
}

/**
 * Fetch customer's Facebook/Instagram profile picture URL via Meta Graph API v19.0.
 * Logs the full API response so we can diagnose permission issues.
 * Returns the picture URL string, or null on failure.
 */
async function getMetaProfilePic(senderId: string, accessToken: string): Promise<string | null> {
  try {
    // Primary: fields=profile_pic on the PSID (v19.0 forced as required)
    const primaryUrl = `https://graph.facebook.com/v19.0/${senderId}?fields=profile_pic&access_token=${accessToken}`;
    const res = await fetch(primaryUrl, { signal: AbortSignal.timeout(8_000) });
    const data = await res.json() as any;
    console.log(`[PROFILE_PIC] Primary response for ${senderId}: ${JSON.stringify(data).slice(0, 300)}`);
    if (data?.profile_pic) {
      console.log(`[PROFILE_PIC] ✓ Got profile_pic for ${senderId}`);
      return data.profile_pic as string;
    }
    // Fallback A: /picture?type=large&redirect=false
    const picRes = await fetch(
      `https://graph.facebook.com/v19.0/${senderId}/picture?type=large&redirect=false&access_token=${accessToken}`,
      { signal: AbortSignal.timeout(8_000) },
    );
    const picData = await picRes.json() as any;
    console.log(`[PROFILE_PIC] Fallback-A picture response: ${JSON.stringify(picData).slice(0, 200)}`);
    if (picData?.data?.url) {
      console.log(`[PROFILE_PIC] ✓ Got picture URL via fallback-A for ${senderId}`);
      return picData.data.url as string;
    }
    console.log(`[PROFILE_PIC] ✗ No profile pic found for ${senderId} — check pages_messaging permission`);
    return null;
  } catch (err: any) {
    console.log(`[PROFILE_PIC] ✗ Exception for ${senderId}: ${err?.message}`);
    return null;
  }
}

/**
 * Download image bytes from any URL (including Meta auth-gated URLs).
 * Returns Buffer + content-type, or null on failure.
 */
async function downloadImageBuffer(url: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) {
      console.log(`[DOWNLOAD] HTTP ${res.status} for ${url.slice(0, 80)}`);
      return null;
    }
    const ct = res.headers.get("content-type") || "image/jpeg";
    const buf = Buffer.from(await res.arrayBuffer());
    console.log(`[DOWNLOAD] ✓ ${buf.length} bytes, type=${ct} from ${url.slice(0, 80)}`);
    return { buffer: buf, contentType: ct };
  } catch (err: any) {
    console.log(`[DOWNLOAD] ✗ ${err?.message} for ${url.slice(0, 80)}`);
    return null;
  }
}

interface TelegramMediaItem {
  buffer: Buffer;
  contentType: string;
  label: string; // attach name used in FormData
}

/**
 * Send multiple images as a Telegram media group.
 * Caption (HTML) goes on the first photo only.
 * Falls back to sendPhoto if only one image.
 */
async function sendTelegramMediaGroup(
  botToken: string, chatId: string,
  images: TelegramMediaItem[],
  caption: string,
): Promise<boolean> {
  if (images.length === 0) return false;

  try {
    const form = new FormData();
    form.append("chat_id", chatId);

    const mediaArray = images.map((img, i) => {
      const obj: Record<string, string> = { type: "photo", media: `attach://${img.label}` };
      if (i === 0) { obj.caption = caption; obj.parse_mode = "HTML"; }
      return obj;
    });
    form.append("media", JSON.stringify(mediaArray));

    for (const img of images) {
      const ext = img.contentType.includes("png") ? "png" : "jpg";
      const blob = new Blob([new Uint8Array(img.buffer)], { type: img.contentType });
      form.append(img.label, blob, `${img.label}.${ext}`);
    }

    const endpoint = images.length === 1 ? "sendPhoto" : "sendMediaGroup";
    // For sendPhoto we need different field name
    if (images.length === 1) {
      const form2 = new FormData();
      form2.append("chat_id", chatId);
      form2.append("caption", caption);
      form2.append("parse_mode", "HTML");
      const ext = images[0].contentType.includes("png") ? "png" : "jpg";
      form2.append("photo", new Blob([new Uint8Array(images[0].buffer)], { type: images[0].contentType }), `photo.${ext}`);
      const r = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
        method: "POST", body: form2, signal: AbortSignal.timeout(30_000),
      });
      const d = await r.json() as any;
      if (d.ok) { console.log(`[TELEGRAM] ✓ sendPhoto ok`); return true; }
      console.log(`[TELEGRAM] ✗ sendPhoto: ${JSON.stringify(d).slice(0, 200)}`);
      return false;
    }

    const res = await fetch(`https://api.telegram.org/bot${botToken}/${endpoint}`, {
      method: "POST", body: form, signal: AbortSignal.timeout(40_000),
    });
    const data = await res.json() as any;
    if (data.ok) {
      console.log(`[TELEGRAM] ✓ ${endpoint} sent ${images.length} photos`);
      return true;
    }
    console.log(`[TELEGRAM] ✗ ${endpoint} failed: ${JSON.stringify(data).slice(0, 300)}`);
    return false;
  } catch (err: any) {
    console.log(`[TELEGRAM] ✗ mediaGroup exception: ${err?.message}`);
    return false;
  }
}

/**
 * Mark a Facebook conversation as "Follow Up" (⭐ star) in Meta Business Suite.
 * Step 1: Fetch conversation ID via /{pageId}/conversations?user_id={senderId}
 * Step 2: POST /{conversationId}/labels  with access_token in query string.
 * Logs the full Meta API error message so missing permissions are visible.
 */
async function starMetaConversation(
  senderId: string, pageId: string, accessToken: string,
): Promise<void> {
  try {
    // Step 1: resolve conversation ID
    const convUrl = `https://graph.facebook.com/v19.0/${pageId}/conversations?user_id=${senderId}&fields=id&access_token=${accessToken}`;
    const convRes = await fetch(convUrl, { signal: AbortSignal.timeout(8_000) });
    const convData = await convRes.json() as any;
    console.log(`[STAR] Conversations lookup for sender ${senderId}: ${JSON.stringify(convData).slice(0, 300)}`);

    const convId = convData?.data?.[0]?.id;
    if (!convId) {
      console.log(`[STAR] ✗ No conversation found — Meta error: ${JSON.stringify(convData?.error || convData).slice(0, 300)}`);
      return;
    }

    // Step 2: apply follow_up label — access_token in query string (not body)
    const labelUrl = `https://graph.facebook.com/v19.0/${convId}/labels?access_token=${accessToken}`;
    const labelRes = await fetch(labelUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "follow_up" }),
      signal: AbortSignal.timeout(8_000),
    });
    const labelData = await labelRes.json() as any;
    console.log(`[STAR] Label POST for conv ${convId}: ${JSON.stringify(labelData).slice(0, 300)}`);
    if (labelData?.success) {
      console.log(`[STAR] ✓ Conversation ${convId} starred as Follow Up in Business Suite`);
    } else {
      console.log(`[STAR] ✗ Label failed — Meta error: ${JSON.stringify(labelData?.error || labelData).slice(0, 300)}`);
    }
  } catch (err: any) {
    console.log(`[STAR] ✗ Exception: ${err?.message}`);
  }
}

interface IdentifyResult {
  productId: string;
  code: string;
  name: string;
  price: number;
  imageUrl?: string;
}

/**
 * Send a Telegram message to admin via Bot API.
 * @returns true if the message was delivered successfully
 */
async function sendTelegramNotification(
  botToken: string, chatId: string, message: string,
  inlineKeyboard?: Array<Array<{ text: string; url: string }>>,
): Promise<boolean> {
  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const body: Record<string, any> = { chat_id: chatId, text: message, parse_mode: "HTML" };
    if (inlineKeyboard) body.reply_markup = { inline_keyboard: inlineKeyboard };
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const data = await res.json() as any;
    if (data.ok) {
      console.log(`[TELEGRAM] Message sent to chat ${chatId}`);
      return true;
    } else {
      console.log(`[TELEGRAM] Send failed: ${data.description}`);
      return false;
    }
  } catch (err: any) {
    console.log(`[TELEGRAM] Error: ${err?.message}`);
    return false;
  }
}

/** Fetch Facebook user's name and profile picture using their PSID */
async function fetchFbUserProfile(
  psid: string, pageAccessToken: string,
): Promise<{ name: string | null; profilePicUrl: string | null }> {
  try {
    const url = `https://graph.facebook.com/${psid}?fields=name,profile_pic&access_token=${pageAccessToken}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const data = await res.json() as any;
    if (data?.name || data?.profile_pic) {
      return { name: data.name ?? null, profilePicUrl: data.profile_pic ?? null };
    }
    return { name: null, profilePicUrl: null };
  } catch {
    return { name: null, profilePicUrl: null };
  }
}

/** Send a photo to Telegram using sendPhoto API, with optional inline keyboard buttons */
async function sendTelegramPhoto(
  botToken: string, chatId: string, photoUrl: string, caption?: string,
  inlineKeyboard?: Array<Array<{ text: string; url: string }>>,
): Promise<boolean> {
  try {
    const url = `https://api.telegram.org/bot${botToken}/sendPhoto`;
    const body: Record<string, any> = { chat_id: chatId, photo: photoUrl };
    if (caption) { body.caption = caption; body.parse_mode = 'HTML'; }
    if (inlineKeyboard?.length) body.reply_markup = { inline_keyboard: inlineKeyboard };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    const data = await res.json() as any;
    if (data.ok) {
      console.log(`[TELEGRAM_PHOTO] Photo sent to chat ${chatId}`);
      return true;
    } else {
      console.log(`[TELEGRAM_PHOTO] Send failed: ${data.description}`);
      return false;
    }
  } catch (err: any) {
    console.log(`[TELEGRAM_PHOTO] Error: ${err?.message}`);
    return false;
  }
}

/**
 * Build the standard dual-link inline keyboard for a conversation.
 * Vertical layout:
 *   [Business Suite 🖥️]
 *   [Messenger App 📱]
 */
function buildConvButtons(psid: string): Array<Array<{ text: string; url: string }>> {
  return [
    [{ text: "فتح المحادثة في Business Suite 🖥️", url: `https://business.facebook.com/latest/inbox/messenger?selected_item_id=${psid}` }],
    [{ text: "فتح في ماسنجر (m.me) 📱", url: `https://m.me/${psid}` }],
  ];
}

/**
 * Send a standalone Telegram message that contains only the conversation links
 * as inline buttons. Used after media groups (which don't support reply_markup).
 */
async function sendTelegramButtons(botToken: string, chatId: string, psid: string, label = "─── روابط المحادثة ───"): Promise<void> {
  try {
    await sendTelegramNotification(botToken, chatId, label, buildConvButtons(psid));
  } catch {/* non-critical */}
}

// ── Smart Suggest helpers ────────────────────────────────────────────────────

const VISION_BATCH_SIZE = 10; // Max suggestion images per GPT-4o call

/**
 * Load a suggestion image as base64, either from disk (local /uploads/ path)
 * or by downloading from an absolute URL.
 */
async function loadSuggestionImage(imageUrl: string): Promise<{ base64: string; ct: string } | null> {
  try {
    if (imageUrl.startsWith("http")) {
      const res = await fetch(imageUrl, { signal: AbortSignal.timeout(12_000) });
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      const ct = res.headers.get("content-type") || "image/jpeg";
      return { base64: buf.toString("base64"), ct };
    } else {
      // local file: imageUrl = /uploads/suggestions/uuid.jpg — use basename to prevent traversal
      const safeName = basename(imageUrl);
      const ALLOWED_EXT = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
      if (!safeName || safeName.startsWith(".") || !ALLOWED_EXT.some(e => safeName.toLowerCase().endsWith(e))) return null;
      const filePath = join(process.cwd(), "public", "uploads", "suggestions", safeName);
      const buf = await readFile(filePath);
      const ct = safeName.endsWith(".png") ? "image/png" : "image/jpeg";
      return { base64: buf.toString("base64"), ct };
    }
  } catch (err: any) {
    console.log(`[SUGGEST] loadSuggestionImage error for ${imageUrl.slice(0, 60)}: ${err?.message}`);
    return null;
  }
}

/**
 * Read the product code printed on a customer's image (e.g. "S380").
 * Returns the code in uppercase or null if none detected.
 */
async function extractCodeFromCustomerImage(base64: string, contentType: string): Promise<string | null> {
  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "What is the product/item code visible on this image? (e.g. S380, S391, S-380). Return ONLY the code in uppercase (like S380), or 'NONE' if no code is visible." },
          { type: "image_url", image_url: { url: `data:${contentType};base64,${base64}`, detail: "high" } },
        ],
      }],
      max_completion_tokens: 15,
      temperature: 0,
    });
    const code = (resp.choices[0]?.message?.content || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!code || code === "NONE" || code.length > 15) return null;
    return code;
  } catch { return null; }
}

/**
 * Scenario A: Search suggestion images for a specific product code using Vision AI.
 * Processes images in batches of VISION_BATCH_SIZE.
 * Returns the matched suggestion imageUrl and price text (read from the image), or null.
 */
async function findSuggestionByCode(
  code: string,
  suggestions: Array<{ id: number; imageUrl: string }>,
): Promise<{ imageUrl: string; priceText: string } | null> {
  for (let start = 0; start < suggestions.length; start += VISION_BATCH_SIZE) {
    const batch = suggestions.slice(start, start + VISION_BATCH_SIZE);
    const loaded = await Promise.all(batch.map(s => loadSuggestionImage(s.imageUrl)));

    const content: any[] = [{
      type: "text",
      text: `هذه ${batch.length} صور منتجات. اقرأ الكود المكتوب على كل صورة وأخبرني: هل كود "${code}" موجود في أي منها (بما فيها أشكال مثل ${code.replace(/^S/, "S-")} أو ${code.toLowerCase()})؟\nأجب بـ JSON فقط: {"foundIndex": رقم من 0 إلى ${batch.length - 1} أو -1 إذا لم يوجد, "price": "السعر المكتوب على الصورة أو null"}`,
    }];

    for (let i = 0; i < batch.length; i++) {
      if (!loaded[i]) continue;
      content.push({ type: "text", text: `صورة ${i}:` });
      content.push({ type: "image_url", image_url: { url: `data:${loaded[i]!.ct};base64,${loaded[i]!.base64}`, detail: "high" } });
    }

    try {
      const resp = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content }],
        max_completion_tokens: 60,
        temperature: 0,
      });
      const raw = (resp.choices[0]?.message?.content || "").trim().replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(raw);
      const idx = Number(parsed.foundIndex ?? -1);
      if (idx >= 0 && idx < batch.length) {
        const match = batch[idx];
        const priceText = parsed.price && parsed.price !== "null" ? String(parsed.price) : "—";
        console.log(`[SUGGEST] Scenario A: code ${code} found in suggestion id=${match.id}, price=${priceText}`);
        return { imageUrl: match.imageUrl, priceText };
      }
    } catch (err: any) {
      console.log(`[SUGGEST] findSuggestionByCode parse error batch${start}: ${err?.message}`);
    }
  }
  return null;
}

/**
 * Scenario B: Find suggestion images whose printed age range(s) cover the given age in months.
 * Each image may have MULTIPLE age stickers — the image matches if the target age falls into ANY
 * of its detected ranges (logical OR). Processes images in batches.
 */
async function findSuggestionsByAge(
  ageMonths: number,
  suggestions: Array<{ id: number; imageUrl: string }>,
): Promise<Array<{ id: number; imageUrl: string }>> {
  const results: Array<{ id: number; imageUrl: string }> = [];
  const ageYears = (ageMonths / 12).toFixed(1);

  for (let start = 0; start < suggestions.length; start += VISION_BATCH_SIZE) {
    const batch = suggestions.slice(start, start + VISION_BATCH_SIZE);
    const loaded = await Promise.all(batch.map(s => loadSuggestionImage(s.imageUrl)));

    const content: any[] = [{
      type: "text",
      text: `هذه ${batch.length} صور ملابس أطفال. كل صورة قد تحتوي على ستيكر أو أكثر يذكر نطاق عمر مناسب.
قواعد مهمة:
1. ابحث عن كل ستيكرات العمر الموجودة على كل صورة — قد تكون أكثر من ستيكر واحد.
2. حوّل كل نطاق إلى أشهر: 6M=6 أشهر، 1سنة=12، 2سنة=24، 3سنة=36، إلخ.
3. الصورة تعتبر مطابقة إذا كان العمر المطلوب يقع ضمن أي نطاق من نطاقاتها (OR logic).
العمر المطلوب: ${ageMonths} شهراً (حوالي ${ageYears} سنة).

أجب بـ JSON فقط بهذا الشكل الدقيق:
{
  "images": [
    {"index": 0, "ranges": [{"from": 6, "to": 24}, {"from": 36, "to": 48}], "matches": true},
    {"index": 1, "ranges": [{"from": 12, "to": 36}], "matches": false}
  ]
}
حيث "matches" = true إذا كان ${ageMonths} شهراً يقع بين "from" و"to" لأي نطاق من النطاقات.`,
    }];

    for (let i = 0; i < batch.length; i++) {
      if (!loaded[i]) continue;
      content.push({ type: "text", text: `صورة ${i}:` });
      content.push({ type: "image_url", image_url: { url: `data:${loaded[i]!.ct};base64,${loaded[i]!.base64}`, detail: "low" } });
    }

    try {
      const resp = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content }],
        max_completion_tokens: 400,
        temperature: 0,
      });
      const raw = (resp.choices[0]?.message?.content || "").trim().replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(raw);
      const images: Array<{ index: number; ranges: Array<{ from: number; to: number }>; matches: boolean }> =
        Array.isArray(parsed.images) ? parsed.images : [];

      for (const img of images) {
        if (!img.matches) continue;
        const idx = Number(img.index);
        if (idx >= 0 && idx < batch.length) {
          const rangesStr = (img.ranges || []).map((r: any) => `${r.from}-${r.to}m`).join(", ");
          console.log(`[SUGGEST] Scenario B: image idx=${idx} id=${batch[idx].id} ranges=[${rangesStr}] matches ageMonths=${ageMonths}`);
          results.push(batch[idx]);
        }
      }
    } catch (err: any) {
      console.log(`[SUGGEST] findSuggestionsByAge parse error batch${start}: ${err?.message}`);
    }
  }

  console.log(`[SUGGEST] Scenario B: found ${results.length} suggestion(s) for ageMonths=${ageMonths}`);
  return results;
}

/* ── Twilio WhatsApp alert ── */
async function sendTwilioAlert(
  accountSid: string, authToken: string, fromNumber: string,
  toNumber: string, message: string,
): Promise<void> {
  try {
    const from = fromNumber.startsWith("whatsapp:") ? fromNumber : `whatsapp:${fromNumber}`;
    const to = toNumber.startsWith("whatsapp:") ? toNumber : `whatsapp:${toNumber}`;
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ From: from, To: to, Body: message }).toString(),
    });
    const data = await res.json() as any;
    if (!res.ok) {
      console.log(`[TWILIO] Send failed: ${data?.message || res.status}`);
    } else {
      console.log(`[TWILIO] Alert sent to ${toNumber}: SID=${data.sid}`);
    }
  } catch (err: any) {
    console.log(`[TWILIO] Error: ${err?.message}`);
  }
}

// ── Detect booking confirmation and auto-create booking record ──────────────
const BOOKING_CONFIRM_KEYWORDS = [
  // exact phrases the bot actually generates
  "تم تسجيل الطلبية", "تم تسجيل طلبيتك", "تم تسجيل طلبك",
  "سجلت الطلبية", "سجلنا طلبك", "سجلنا طلبيتك",
  "استلمنا طلبك", "وصلنا طلبك", "تم استلام طلبك",
  "تم الحجز بنجاح عيني", "تم الحجز", "تأكيد الطلب", "مبروك",
  "المجموع الكلي", "سيوصل الطلب", "سيوصلك الطلب", "يوصل خلال",
  "راح نتواصل", "سيتم التواصل",
  "booking confirmed", "order confirmed",
];

function isBookingConfirmation(reply: string): boolean {
  const lower = reply.toLowerCase();
  return BOOKING_CONFIRM_KEYWORDS.some(k => lower.includes(k.toLowerCase()));
}

async function tryAutoCreateBooking(
  convId: string,
  platform: string,
  senderId: string,
  messages: Array<{ role: string; content: string }>,
  settings?: any,
  overrides?: { phone?: string; address?: string }, // Fix C: inject known values to prevent old-history pollution
) {
  try {
    // Session isolation: prevent duplicate booking within last 3 minutes
    // (do NOT block permanently via hasBooking — customers can place multiple orders)
    const recentBooking = await db.select({ id: bookingsTable.id, createdAt: bookingsTable.createdAt })
      .from(bookingsTable)
      .where(eq(bookingsTable.senderId, senderId))
      .orderBy(desc(bookingsTable.createdAt))
      .limit(1);
    if (recentBooking[0]?.createdAt) {
      const ageMs = Date.now() - new Date(recentBooking[0].createdAt).getTime();
      if (ageMs < 3 * 60 * 1000) {
        console.log(`[BOOKING] Skipping — duplicate within 3 min for ${senderId}`);
        return;
      }
    }

    // Fetch conversation for senderName update later
    const existing = await db.select()
      .from(chatConversationsTable)
      .where(eq(chatConversationsTable.id, convId))
      .limit(1);

    // ── Extract customer info via GPT ──────────────────────────────────
    const convoText = messages
      .filter(m => !m.content.startsWith("[image]"))
      .slice(-20)
      .map(m => `${m.role === "user" ? "زبون" : "بوت"}: ${m.content}`)
      .join("\n");

    const extractReply = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{
        role: "user",
        content: `من هذه المحادثة، استخرج معلومات الحجز بتنسيق JSON فقط:
${convoText}

أجب بهذا التنسيق الدقيق:
{"phone":"رقم_الهاتف","governorate":"المحافظة","address":"العنوان_الكامل","senderName":"اسم_الزبون","productCode":"كود_الموديل","productName":"اسم_المنتج","quantity":1,"unitPrice":0}

قواعد مهمة:
- إذا المعلومة غير موجودة استخدم null (بدون أقواس - JSON null حقيقي)
- لا تستخدم كلمة "null" بين أقواس
- للسعر: اكتب الرقم فقط بدون كلمة "ألف" (مثال: 30000 بدل "30 ألف")
- أجب بـ JSON فقط بدون أي نص آخر`,
      }],
      max_completion_tokens: 300,
      response_format: { type: "json_object" },
    });

    const raw = extractReply.choices[0]?.message?.content ?? "{}";
    let info: { phone?: string | null; governorate?: string | null; address?: string | null; senderName?: string | null; productCode?: string | null; productName?: string | null; quantity?: number | null; unitPrice?: number | null } = {};
    try { info = JSON.parse(raw); } catch { return; }

    const clean = (v: string | null | undefined) => (!v || v === "null" || v === "غير محدد" || v === "غير معروف" || v === "0" || v === "") ? null : v;
    info.phone       = clean(info.phone);
    info.governorate = clean(info.governorate);
    info.address     = clean(info.address);
    info.senderName  = clean(info.senderName);
    info.productCode = clean(info.productCode);
    info.productName = clean(info.productName);

    // Fix C: override phone/address with pre-extracted session values (prevents old-history pollution)
    if (overrides?.phone)   { info.phone   = overrides.phone;   console.log(`[BOOKING] Phone override applied: ${overrides.phone}`); }
    if (overrides?.address) { info.address = overrides.address; console.log(`[BOOKING] Address override applied: ${overrides.address}`); }

    if (!info.phone && !info.address) {
      console.log(`[BOOKING] Aborting — no phone or address found in conversation`);
      return;
    }

    // ── Server-side phone validation (double-check AI validation) ──
    const PHONE_REGEX = /^(\+9647\d{9}|07\d{9})$/;
    if (info.phone) {
      const digits = info.phone.replace(/[\s\-().]/g, "");
      if (!PHONE_REGEX.test(digits)) {
        console.log(`[BOOKING] Phone validation failed: "${info.phone}" — skipping booking`);
        return;
      }
    }

    // ── Server-side address validation (at least 2 words/components) ──
    if (info.address) {
      const parts = info.address.trim().split(/[\s\-،,\/]+/).filter(Boolean);
      if (parts.length < 2) {
        console.log(`[BOOKING] Address too vague: "${info.address}" — skipping booking`);
        return;
      }
    }

    // ── Build booking items ─────────────────────────────────────────────
    type BookingItem = { code?: string; name: string; quantity: number; unitPrice: number; totalPrice: number; imageUrl?: string };
    let bookingItems: BookingItem[] = [];
    let productImageUrl: string | null = null;

    // GPT-extracted single product — lookup in DB by code/name
    if (bookingItems.length === 0 && (info.productCode || info.productName)) {
      try {
        const searchTerm = (info.productCode || info.productName || "").trim();
        const products = await db.select().from(inventoryTable)
          .where(or(
            ilike(inventoryTable.productId, `%${searchTerm}%`),
            ilike(inventoryTable.nameAr, `%${searchTerm}%`),
          ))
          .limit(1);
        const product = products[0];
        const qty = Math.max(1, Number(info.quantity) || 1);

        // DB price is authoritative; GPT price is fallback (handle "30" vs "30000" ambiguity)
        let price = 0;
        if (product?.price) {
          price = Number(product.price);
        } else if (info.unitPrice) {
          const raw = Number(info.unitPrice);
          // If GPT returned shorthand like "30" instead of "30000", multiply
          price = raw > 0 && raw < 1000 ? raw * 1000 : raw;
        }

        console.log(`[BOOKING] Product lookup "${searchTerm}" → ${product ? `found: ${product.nameAr} (${product.productId}) price=${price}` : "NOT found in DB"}`);

        bookingItems = [{
          code: product?.productId ?? info.productCode ?? undefined,
          name: product?.nameAr ?? info.productName ?? "منتج غير محدد",
          quantity: qty,
          unitPrice: price,
          totalPrice: qty * price,
          imageUrl: product?.publicImageUrl ?? undefined,
        }];
        if (product?.publicImageUrl) productImageUrl = product.publicImageUrl;
      } catch (pErr: any) {
        console.log(`[BOOKING] Product lookup error: ${pErr?.message}`);
      }
    }

    // Priority 3: if still no items but have phone+address, create booking with unknown product
    if (bookingItems.length === 0) {
      console.log(`[BOOKING] No product identified — creating booking with unknown item`);
      bookingItems = [{ name: "منتج غير محدد", quantity: 1, unitPrice: 0, totalPrice: 0 }];
    }

    // ── Calculate total ─────────────────────────────────────────────────
    const totalAmount = bookingItems.reduce((sum, it) => sum + it.totalPrice, 0);

    // ── Delivery fee based on governorate ───────────────────────────────
    const deliveryFeesMap: Record<string, number> = (() => {
      try { return settings?.deliveryFees ? JSON.parse(settings.deliveryFees) : {}; }
      catch { return {}; }
    })();
    const normGov = (info.governorate || "").toLowerCase();
    const bookingDeliveryFee = (() => {
      const feeEntries = Object.entries(deliveryFeesMap).filter(([k]) => !k.startsWith("__days_"));
      if (!feeEntries.length) return 0;
      const match = feeEntries.find(([k]) => normGov.includes(k.toLowerCase()) || k.toLowerCase().includes(normGov));
      if (match) return Number(match[1]) || 0;
      const restKey = Object.keys(deliveryFeesMap).find(k => k.toLowerCase().includes("rest") || k.toLowerCase().includes("باقي"));
      return restKey ? Number(deliveryFeesMap[restKey]) || 0 : 0;
    })();

    // ── Generate receipt text and save to disk ──────────────────────────
    let receiptImageUrl: string | null = null;
    try {
      const receiptsDir = join(process.cwd(), "public", "uploads", "receipts");
      await mkdir(receiptsDir, { recursive: true });

      const ts = Date.now();
      const receiptName = `receipt-${ts}.txt`;
      const receiptPath = join(receiptsDir, receiptName);

      const itemLines = bookingItems.map((it, i) =>
        `${i + 1}. ${it.name}${it.code ? ` (${it.code})` : ""} — ${formatShorthandPrice(it.unitPrice)} ألف × ${it.quantity} = ${formatShorthandPrice(it.totalPrice)} ألف`,
      ).join("\n");

      const imageLinks = bookingItems
        .filter(it => it.imageUrl)
        .map((it, i) => `صورة ${i + 1}: ${it.imageUrl}`)
        .join("\n");

      const receiptText = [
        "══════════════════════════════",
        "         SONBOLA - فاتورة طلب",
        "══════════════════════════════",
        `الاسم   : ${info.senderName || "—"}`,
        `الهاتف  : ${info.phone || "—"}`,
        `المحافظة: ${info.governorate || "—"}`,
        `العنوان : ${info.address || "—"}`,
        `المنصة  : ${platform}`,
        "──────────────────────────────",
        "المنتجات:",
        itemLines || "—",
        "──────────────────────────────",
        `الإجمالي: ${formatShorthandPrice(totalAmount)} ألف`,
        "══════════════════════════════",
        ...(imageLinks ? ["\nروابط الصور:", imageLinks] : []),
      ].join("\n");

      await writeFile(receiptPath, receiptText, "utf8");

      // Build public URL — use same domain logic as permanent uploads
      const domains = (process.env.LOCAL_DOMAIN || "localhost:3000").split(",");
      const primaryDomain = domains[0]?.trim();
      if (primaryDomain) {
        receiptImageUrl = `https://${primaryDomain}/uploads/receipts/${receiptName}`;
      }
      console.log(`[BOOKING] Receipt saved: ${receiptPath}`);
    } catch (recErr: any) {
      console.log(`[BOOKING] Receipt generation failed: ${recErr?.message}`);
    }

    // ── Fetch customer profile picture (before INSERT so we can save URL) ─
    const accessTokenForPic = settings?.metaAccessToken || settings?.instagramAccessToken || null;
    let senderProfilePicUrl: string | null = null;
    if (accessTokenForPic) {
      senderProfilePicUrl = await getMetaProfilePic(senderId, accessTokenForPic);
    }

    // ── Insert booking record ───────────────────────────────────────────
    const hasFullInfo = !!(info.phone && info.address);
    const [inserted] = await db.insert(bookingsTable).values({
      platform,
      senderId,
      senderName: info.senderName || null,
      phoneNumber: info.phone || "غير معروف",
      governorate: info.governorate || "غير محدد",
      fullAddress: info.address || "غير محدد",
      items: bookingItems,
      status: "pending",
      starred: hasFullInfo,
      totalAmount: totalAmount > 0 ? String(totalAmount) : null,
      productImageUrl,
      receiptImageUrl,
      senderProfilePicUrl,
    }).returning({ id: bookingsTable.id });

    // Mark conversation as having a booking
    const convUpdate: Record<string, unknown> = { hasBooking: true, updatedAt: new Date() };
    if (info.senderName && existing[0] && !existing[0].senderName) {
      convUpdate.senderName = info.senderName;
    }
    await db.update(chatConversationsTable)
      .set(convUpdate)
      .where(eq(chatConversationsTable.id, convId));

    console.log(`[BOOKING] Created booking #${inserted?.id} for conv: ${convId} — ${bookingItems.length} items, total: ${totalAmount} profilePic=${!!senderProfilePicUrl}`);

    // ── Telegram notification (media group: profile pic + product images) ──
    if (settings?.telegramBotToken && settings?.telegramChatId) {
      const domain = (process.env.LOCAL_DOMAIN || "localhost:3000").split(",")[0]?.trim() || "";

      // ── Vertical price list — NO codes, just name + price ─────────────
      const verticalLines = bookingItems.map(it =>
        `${formatShorthandPrice(it.unitPrice * it.quantity)} الف (${it.name})`
      );
      if (bookingDeliveryFee > 0) {
        verticalLines.push(`${formatShorthandPrice(bookingDeliveryFee)} الف توصيل`);
      }
      const grandTotal = totalAmount + bookingDeliveryFee;
      verticalLines.push("──────────");
      verticalLines.push(`المجموع الكلي: ${formatShorthandPrice(grandTotal)} الف`);
      const verticalPriceList = verticalLines.join("\n");

      // ── Platform label ────────────────────────────────────────────────
      const platformLabel = platform === "instagram" ? "INSTAGRAM" : "FACEBOOK";

      const receiptLink = receiptImageUrl
        ? `🧾 <a href="${escHtml(receiptImageUrl)}">عرض الفاتورة الكاملة</a>` : "";

      // Full booking caption — links are sent as inline buttons separately
      const caption = [
        `🌟 <b>STARRED BOOKING ON ${escHtml(platformLabel)}</b>`,
        "─────────────────────────",
        `👤 <b>${escHtml(info.senderName || "زبون")}</b>`,
        `📞 ${info.phone || "—"}`,
        `🏙️ ${info.governorate || "—"} — ${info.address || "—"}`,
        "─────────────────────────",
        "<b>قايمة الطلبية:</b>",
        verticalPriceList,
        "─────────────────────────",
        ...(receiptLink ? [receiptLink] : []),
      ].join("\n");

      // ── Collect images for media group ──────────────────────────────────
      const mediaItems: TelegramMediaItem[] = [];

      // 1. Customer profile picture (first in group)
      if (senderProfilePicUrl) {
        const picData = await downloadImageBuffer(senderProfilePicUrl);
        if (picData) {
          mediaItems.push({ buffer: picData.buffer, contentType: picData.contentType, label: "profile" });
        }
      }

      // 2. Product images (subsequent items) — resolve absolute URLs first
      for (let i = 0; i < bookingItems.length && i < 8; i++) {
        const rawUrl = bookingItems[i].imageUrl;
        if (!rawUrl) continue;
        const absUrl = rawUrl.startsWith("http") ? rawUrl
          : domain ? `https://${domain}${rawUrl}` : rawUrl;
        const imgData = await downloadImageBuffer(absUrl);
        if (imgData) {
          mediaItems.push({ buffer: imgData.buffer, contentType: imgData.contentType, label: `prod${i}` });
        }
      }

      let tgSent = false;

      if (mediaItems.length > 0) {
        tgSent = await sendTelegramMediaGroup(
          settings.telegramBotToken, settings.telegramChatId,
          mediaItems, caption,
        );
        // sendMediaGroup doesn't support reply_markup — send buttons as a follow-up message
        if (tgSent) {
          await sendTelegramButtons(settings.telegramBotToken, settings.telegramChatId, senderId);
        }
      }

      // Fallback: text-only if all image downloads failed
      if (!tgSent) {
        tgSent = await sendTelegramNotification(
          settings.telegramBotToken, settings.telegramChatId, caption,
          buildConvButtons(senderId),
        );
      }

      // After successful Telegram delivery: star conversation + mark as seen in Meta
      if (tgSent && settings.metaAccessToken && settings.facebookPageId) {
        await starMetaConversation(senderId, settings.facebookPageId, settings.metaAccessToken);
        await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
      }
    }
  } catch (err: any) {
    console.log(`[BOOKING] Failed to auto-create booking: ${err?.message}\n${err?.stack?.slice(0, 400)}`);
  }
}

router.get("/webhook/meta", async (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log(`[WEBHOOK VERIFY] mode=${mode} token=${token} challenge=${challenge}`);

  try {
    const settingsRows = await db.select().from(settingsTable).limit(1);
    const dbToken = settingsRows[0]?.webhookVerifyToken;
    const verifyToken = dbToken || process.env.WEBHOOK_VERIFY_TOKEN || "sonbola_verify_secure_2026";

    console.log(`[WEBHOOK VERIFY] dbToken=${dbToken} verifyToken=${verifyToken} match=${token === verifyToken}`);

    if (mode === "subscribe" && token === verifyToken) {
      res.status(200).send(challenge);
    } else {
      console.error(`[WEBHOOK VERIFY] FAILED - token mismatch or wrong mode`);
      res.sendStatus(403);
    }
  } catch (err) {
    console.error(`[WEBHOOK VERIFY] DB error:`, err);
    const fallback = process.env.WEBHOOK_VERIFY_TOKEN || "sonbola_verify_secure_2026";
    if (mode === "subscribe" && token === fallback) {
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});

router.post("/webhook/meta", async (req, res) => {
  // Acknowledge immediately — Meta requires 200 within 20s
  res.sendStatus(200);

  try {
    const body = req.body;
    if (!body.object) return;

    console.log(`[WH] Received: object=${body.object} entries=${body.entry?.length || 0}`);

    let settings = settingsCache.get();
    if (!settings) {
      const rows = await db.select().from(settingsTable).limit(1);
      settings = rows[0];
      if (settings) settingsCache.set(settings);
    }
    if (!settings) { console.log("[WH] No settings found, skipping"); return; }

    const platform = body.object === "instagram" ? "instagram" : "facebook";

    // Check platform-specific bot toggle and schedule
    if (platform === 'instagram') {
      const platformEnabled = settings.instagramBotEnabled ?? settings.botEnabled;
      if (!platformEnabled) {
        console.log(`[WH] Bot disabled for instagram, skipping`);
        return;
      }
      if (settings.schedulerEnabled && !isWithinSchedule(settings.scheduleStart, settings.scheduleEnd)) {
        console.log("[WH] Outside schedule window, skipping");
        return;
      }
    } else if (platform === 'facebook') {
      const fbBotEnabled = settings.facebookBotEnabled ?? false;
      if (!fbBotEnabled) {
        // Bot disabled → be silent, do NOT send any redirect or tutorial message
        console.log(`[WH] Facebook bot disabled — skipping silently`);
        return;
      }
      // Bot enabled → obey scheduler too
      if (settings.schedulerEnabled && !isWithinSchedule(settings.scheduleStart, settings.scheduleEnd)) {
        console.log("[WH] Outside schedule window (facebook), skipping");
        return;
      }
    }

    for (const entry of (body.entry || [])) {
      for (const messagingEvent of (entry.messaging || entry.changes || [])) {
        const messaging = messagingEvent.value || messagingEvent;
        const isPostback = !!messaging.postback;
        if ((!messaging.message && !isPostback) || messaging.message?.is_echo) continue;

        const senderId = messaging.sender?.id || messaging.from?.id;
        const recipientId = messaging.recipient?.id || messaging.to?.id || null;
        const messageMid = messaging.message?.mid || null;
        // For postback events (carousel button taps), use the postback payload as the message text
        // For quick reply taps, prefer the quick_reply.payload over the visible button title
        const quickReplyPayload: string | null = messaging.message?.quick_reply?.payload ?? null;
        const messageText = (isPostback ? (messaging.postback?.payload || "") : "") || messaging.message?.text || "";
        // ── Ignore asterisk messages completely (no reply, no DB write) ──
        if (messageText.trim() === '*') continue;
        const attachments = messaging.message?.attachments || [];

        /** Recursively pull every real image URL from any attachment shape */
        function extractAllImageUrlsFromAttachments(atts: any[]): string[] {
          const urls: string[] = [];
          for (const a of atts) {
            // Skip stickers / reactions
            if (a.type === "sticker" || a.sticker_id || a.payload?.sticker_id) continue;
            // Direct image upload
            if (a.type === "image" && a.payload?.url) { urls.push(a.payload.url); continue; }
            // Video thumbnail (Reel / video share) — the thumbnail IS the product image
            if ((a.type === "video" || a.type === "reel") && a.payload?.thumbnail_url) {
              urls.push(a.payload.thumbnail_url); continue;
            }
            // Share type: might carry images array or thumbnail
            if (a.type === "share") {
              const shareImages: any[] = a.payload?.images || [];
              for (const img of shareImages) {
                if (img?.url) urls.push(img.url);
              }
              if (a.payload?.thumbnail_url) urls.push(a.payload.thumbnail_url);
            }
            // Subattachments (album / carousel post shared from feed)
            const subs = a.payload?.subattachments?.data || a.subattachments?.data || [];
            if (subs.length > 0) {
              urls.push(...extractAllImageUrlsFromAttachments(subs));
            }
            // Fallback: any attachment that has a payload.url and looks like an image
            if (!['sticker','video','reel','share','audio','file','location'].includes(a.type) && a.payload?.url) {
              const u: string = a.payload.url;
              if (u.match(/\.(jpg|jpeg|png|webp|gif)/i) || u.includes('scontent') || u.includes('fbcdn')) {
                if (!urls.includes(u)) urls.push(u);
              }
            }
          }
          return urls;
        }

        // ALL real image URLs in this message (preserves send order for vision model)
        const allImageUrls: string[] = extractAllImageUrlsFromAttachments(attachments);
        // First image URL (backward compatibility)
        const rawMetaImageUrl: string | null = allImageUrls[0] ?? null;

        if (!senderId) { console.log("[WH] No senderId, skipping event"); continue; }

        // DEBUG: log raw attachment structure for multi-image diagnosis
        if (attachments.length > 0) {
          console.log(`[WH_ATT] ${platform}/${senderId} — ${attachments.length} attachment(s), extracted ${allImageUrls.length} image URL(s)`);
          console.log(`[WH_ATT_RAW] ${JSON.stringify(attachments).slice(0, 800)}`);
        }

        console.log(`[WH] Message from ${platform}/${senderId}: "${messageText?.slice(0, 60)}" img=${!!rawMetaImageUrl}`);

        // ── Detect Reel / Video share (no image extracted, non-sticker attachment) ──
        // Instagram Reels arrive as {"type":"template","payload":{"generic":{"elements":[]}}}
        // Videos may arrive as {"type":"video"} without a thumbnail_url we can use.
        // When we have attachments but can't extract ANY image, and there's no text,
        // tell the customer to send a plain photo instead.
        // EXCEPTION: if customer is in booking flow, phone-number bubbles arrive as templates —
        // we must NOT treat them as Reels; just skip silently so the text event is handled.
        if (!messageText && !rawMetaImageUrl && !isPostback && !quickReplyPayload && attachments.length > 0) {
          const silentTypes = new Set(['sticker', 'audio', 'file', 'location', 'fallback']);
          const hasMediaAttachment = attachments.some((a: any) => !silentTypes.has(a.type));
          if (hasMediaAttachment) {
            // Check if customer is in a booking collection state — phone bubbles arrive here
            const _reelFlowState = senderConvFlowMap.get(senderId);
            const _inBookingFlow = _reelFlowState?.step === 'booking_collect_info' ||
                                   _reelFlowState?.step === 'booking_collect_address';
            if (_inBookingFlow) {
              // Silently skip — the actual phone text message will be handled separately
              console.log(`[WH_MEDIA] ${platform}/${senderId} — phone bubble/template in booking state → skip silently`);
              continue;
            }
            if (settings.metaAccessToken && settings.facebookPageId) {
              console.log(`[WH_MEDIA] ${platform}/${senderId} — video/reel/template share (0 images) → asking for photo`);
              await sendMetaMessage(
                senderId, settings.facebookPageId, settings.metaAccessToken,
                'عيني الريلز والفيديوهات ما أقدر أشوفهن 😊\nأرسلي صورة واضحة للموديل وأحدثلج بالسعر والأعمار فوراً 📸',
                platform, settings.instagramAccountId, settings.instagramAccessToken, settings.metaAppSecret
              );
            }
          }
          continue;
        }

        // ── Skip empty-text messages with no image (Instagram sends these after phone contacts) ──
        // These phantom events have no content and would incorrectly trigger WELCOME_FLOW,
        // destroying any active booking session.
        if (!messageText && !rawMetaImageUrl && !isPostback && !quickReplyPayload) {
          console.log(`[WH] Skipping empty non-image message from ${platform}/${senderId} (phantom event)`);
          continue;
        }

        // ── Auto-detect Instagram Account ID from webhook recipient field (saved once) ──
        // The webhook's recipient.id IS the Instagram Business Account ID — save it if missing.
        if (platform === "instagram" && recipientId && !settings.instagramAccountId) {
          console.log(`[IG_AUTO] Detected Instagram Account ID from webhook: ${recipientId}`);
          db.update(settingsTable)
            .set({ instagramAccountId: recipientId, updatedAt: new Date() })
            .where(eq(settingsTable.id, settings.id))
            .catch((e: any) => console.log("[IG_AUTO] Failed to save IG account ID:", e?.message));
          // Update local settings object so this webhook's reply uses it
          (settings as any).instagramAccountId = recipientId;
        }

        // ── Deduplication layer 1: in-memory MID (fast — catches rapid duplicates) ──
        if (messageMid && inMemoryDuplicate(messageMid)) {
          console.log(`[DEDUP-MEM] Skipping duplicate mid: ${messageMid}`);
          continue;
        }

        // ── Deduplication layer 1b: sender+content fingerprint (catches null-MID duplicates) ──
        // Skip fingerprint dedup for postbacks and quick replies — buttons are intentionally pressable multiple times
        const isButtonPress = isPostback || !!quickReplyPayload;
        if (!messageMid && !isButtonPress && inMemoryFingerprintDuplicate(senderId, messageText, !!rawMetaImageUrl)) {
          console.log(`[DEDUP-FP] Skipping null-MID duplicate from ${senderId}: "${messageText?.slice(0, 40)}"`);
          continue;
        }

        // ── Mirror image(s) to permanent storage IMMEDIATELY (Meta URLs expire quickly) ──
        // Mirror ALL images outside queueForSender (before queuing) so URLs don't expire.
        // Mirror up to 4 images concurrently — Meta image URLs expire, so we need permanent copies.
        const _mirroredImageMap = new Map<string, { permanentUrl: string; base64: string; contentType: string }>();
        if (allImageUrls.length > 0) {
          const _toMirror = allImageUrls.slice(0, 4); // cap at 4 to avoid excessive API time
          const _mirrorResults = await Promise.allSettled(_toMirror.map(u => mirrorMetaImage(u)));
          for (let _mi = 0; _mi < _toMirror.length; _mi++) {
            const r = _mirrorResults[_mi];
            if (r.status === 'fulfilled' && r.value) {
              _mirroredImageMap.set(_toMirror[_mi], r.value);
            }
          }
        }
        // Backward-compat: first image mirrored result
        const _mirroredImage = rawMetaImageUrl ? (_mirroredImageMap.get(rawMetaImageUrl) ?? null) : null;

        const convId = `${platform}_${senderId}`;

        // ── Queue per sender: all processing after dedup is serialized per sender ──
        // This prevents concurrent AI calls/double-replies for the same user.
        // Capture variables needed inside the closure.
        const _convId = convId, _senderId = senderId, _messageMid = messageMid;
        const _messageText = messageText, _platform = platform;
        const _settings = settings;
        const _allImageUrls = allImageUrls; // capture for closure
        const _mirroredImageMapCap = _mirroredImageMap; // capture for closure
        queueForSender(convId, async () => {
        const senderId = _senderId, messageMid = _messageMid;
        const messageText = _messageText;
        // Use permanent URL (or fall back to raw Meta URL if mirroring failed)
        const imageUrl = _mirroredImage?.permanentUrl || rawMetaImageUrl;
        const imageBase64 = _mirroredImage?.base64 || null;
        const imageContentType = _mirroredImage?.contentType || "image/jpeg";
        const platform = _platform, convId = _convId;
        const settings = _settings;

        // ── Deduplication layer 2: INSERT with UNIQUE(mid) as idempotency key ──
        // Done BEFORE conversation upsert so no side-effects (unreadCount etc.) happen twice.
        // PostgreSQL unique constraint on mid — atomic, race-condition-proof.
        try {
          await db.insert(chatMessagesTable).values({
            id: randomUUID(),
            conversationId: convId,
            role: "user",
            content: messageText || "[image]",
            imageUrl,
            mid: messageMid || undefined,
          });
        } catch (insertErr: any) {
          const isDuplicate =
            insertErr?.code === "23505" || // PostgreSQL unique violation
            insertErr?.message?.includes("unique") ||
            insertErr?.message?.includes("UNIQUE") ||
            insertErr?.message?.toLowerCase().includes("duplicate");
          if (isDuplicate && messageMid) {
            console.log(`[DEDUP-DB] Skipping duplicate mid (unique constraint): ${messageMid}`);
            return; // deduplicated — skip this message
          }
          throw insertErr; // Re-throw unexpected errors
        }

        // Upsert conversation — only after message insert succeeds (not a duplicate)
        const existing = await db.select().from(chatConversationsTable).where(eq(chatConversationsTable.id, convId));
        if (existing.length === 0) {
          await db.insert(chatConversationsTable).values({
            id: convId,
            platform,
            senderId,
            lastMessage: messageText,
            lastMessageAt: new Date(),
            status: "active",
            hasBooking: false,
            isEscalated: false,
          });
        } else {
          await db.update(chatConversationsTable).set({
            lastMessage: messageText,
            lastMessageAt: new Date(),
            unreadCount: (existing[0].unreadCount || 0) + 1,
            updatedAt: new Date(),
          }).where(eq(chatConversationsTable.id, convId));
        }

        // ── Safety lock: skip bot processing for escalated conversations ──────
        // isEscalated means admin has taken over — do not send automated replies.
        // EXCEPTION: if the sender has an active booking/image session in memory,
        // the bot must NOT ignore them — they may be in the middle of completing an order.
        const isEscalatedConv = existing[0]?.isEscalated ?? false;

        // ── DB is source of truth: if admin cleared escalation via dashboard, release the in-memory lock ──
        if (!isEscalatedConv && deactivatedSenders.has(senderId)) {
          deactivatedSenders.delete(senderId);
          console.log(`[BOT] Re-activated ${senderId} — DB shows isEscalated=false (admin cleared via dashboard)`);
        }

        if (isEscalatedConv || deactivatedSenders.has(senderId)) {
          if (!deactivatedSenders.has(senderId)) deactivatedSenders.add(senderId);
          console.log(`[BOT] ADMIN MODE — skipping automated reply for ${senderId}`);
          if (settings.metaAccessToken && settings.facebookPageId) {
            await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
          }
          return;
        }

        // ── Maintenance mode gate: pause ALL bot responses ─────────────────────
        if (settings.maintenanceMode) {
          console.log(`[BOT] MAINTENANCE MODE — skipping reply for ${senderId}`);
          if (settings.metaAccessToken && settings.facebookPageId) {
            await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
          }
          return;
        }

        // ── Message pre-processing ─────────────────────────────────────────────
        let txt = messageText || "";

        // ── Blacklist check: stop immediately if message contains a forbidden word ─
        if (txt && settings.blacklistKeywords) {
          try {
            const blacklist: string[] = JSON.parse(settings.blacklistKeywords);
            const normTxtBl = normalizeArabic(txt.toLowerCase());
            const hit = blacklist.find(w => w && normalizeArabic(w.toLowerCase()).length > 0 && normTxtBl.includes(normalizeArabic(w.toLowerCase())));
            if (hit) {
              console.log(`[BLACKLIST] Blocked message from ${senderId} — matched: "${hit}"`);
              if (settings.metaAccessToken && settings.facebookPageId) {
                await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
              }
              return;
            }
          } catch {}
        }

        // ── Slang expansion: translate known dialect words before processing ───
        if (txt && settings.slangMapper) {
          try {
            const slangPairs: Array<{ slang: string; meaning: string }> = JSON.parse(settings.slangMapper);
            for (const { slang, meaning } of slangPairs) {
              if (slang && meaning) {
                const re = new RegExp(slang.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
                txt = txt.replace(re, meaning);
              }
            }
          } catch {}
        }

        // ── Reset trigger: "0" or "قائمة" → restart carousel flow ────────────
        if (messageText && settings.metaAccessToken && settings.facebookPageId) {
          const trimmed = messageText.trim();
          const normTrimmed = normalizeArabic(trimmed);
          if (trimmed === "0" || normalizeArabic("قائمة") === normTrimmed) {
            senderModeMap.delete(senderId);
            senderAgeMap.delete(senderId);
            pendingAgeSelectSet.delete(senderId);
            bookingSessionMap.delete(senderId);
            senderModeMap.set(senderId, 'carousel');
            senderSeasonMap.delete(senderId);
            senderGenderMap.delete(senderId);
            pendingAgeSelectSet.add(senderId);
            console.log(`[MODE] ${senderId} → reset → carousel`);
            await sendMetaMessage(senderId, settings.facebookPageId, settings.metaAccessToken,
              '🧥 يا موسم تريد؟', platform, settings.instagramAccountId, settings.instagramAccessToken, settings.metaAppSecret);
            await new Promise(r => setTimeout(r, 350));
            const seasonElements = buildSeasonCarouselElements();
            await sendMetaGenericTemplate(senderId, settings.facebookPageId!, settings.metaAccessToken!, seasonElements, platform, settings.metaAppSecret, settings.instagramAccountId, settings.instagramAccessToken);
            await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
            return;
          }
        }

        // Customer language — always Arabic (interactive menu removed)
        const customerLang = senderLangMap.get(senderId) ?? 'ar';

        // ── Check conversation complaint state BEFORE menu matching ──────────────
        // If customer is in complaint mode, skip menu matching so the welcome-flow
        // complaint handler sends the correct holding/reset message instead.
        let isConversationInComplaintMode = false;
        {
          const lastBotForMenu = await db.select({ content: chatMessagesTable.content })
            .from(chatMessagesTable)
            .where(and(eq(chatMessagesTable.conversationId, convId), eq(chatMessagesTable.role, "assistant")))
            .orderBy(desc(chatMessagesTable.createdAt)).limit(1)
            .then(rows => rows[0]?.content ?? "");
          isConversationInComplaintMode = lastBotForMenu.includes(COMPLAINT_MARKER_TEXT);
        }

        // ── Facebook: send tutorial steps then redirect to website ───────────────
        // Only used when facebookBotEnabled = false (legacy/redirect mode).
        // When facebookBotEnabled = true the full conversational bot handles everything.
        if (platform === 'facebook' && !(settings.facebookBotEnabled ?? false) &&
            settings.metaAccessToken && settings.facebookPageId) {
          const isFirst = !facebookWelcomedSet.has(senderId);
          facebookWelcomedSet.add(senderId);
          if (isFirst) {
            type TutorialStep = { text?: string; images?: string[]; imageUrl?: string };
            let steps: TutorialStep[] = [];
            try {
              if (settings.tutorialImages) {
                const parsed = JSON.parse(settings.tutorialImages);
                if (Array.isArray(parsed)) steps = parsed;
              }
            } catch {}
            if (steps.length > 0) {
              for (const step of steps) {
                if (step.text?.trim()) {
                  await sendMetaMessage(senderId, settings.facebookPageId, settings.metaAccessToken, step.text.trim(), 'facebook', null, null, settings.metaAppSecret);
                  await new Promise(r => setTimeout(r, 500));
                }
                const imgs: string[] = Array.isArray(step.images) ? step.images : (step.imageUrl ? [step.imageUrl] : []);
                for (const imgUrl of imgs) {
                  if (imgUrl) {
                    await sendMetaImage(senderId, settings.facebookPageId, settings.metaAccessToken, imgUrl, 'facebook', null, null, settings.metaAppSecret);
                    await new Promise(r => setTimeout(r, 500));
                  }
                }
              }
            } else {
              await sendMetaMessage(senderId, settings.facebookPageId, settings.metaAccessToken, 'أهلا وسهلا بيكم بصفحة سونبولة 👶🌸\n\nللحجز تفضلي زوري موقعنا 👇\nhttps://sonbola.shop/', 'facebook', null, null, settings.metaAppSecret);
            }
          } else {
            await sendMetaMessage(senderId, settings.facebookPageId, settings.metaAccessToken, 'عيني لو سمحت شوفي الموقع كل شيء مرتب و واضح 🙏\nhttps://sonbola.shop/', 'facebook', null, null, settings.metaAppSecret);
          }
          await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
          return;
        }

        // ── Shared helpers (used by both legacy flow and conversational AI) ──────────
        const sendMsg = (text: string) =>
          sendMetaMessage(senderId, settings.facebookPageId!, settings.metaAccessToken!, text, platform, settings.instagramAccountId, settings.instagramAccessToken, settings.metaAppSecret);
        const sendQR = (text: string, qr: Array<{ content_type: 'text'; title: string; payload: string }>) =>
          sendMetaMessageWithQuickReplies(senderId, settings.facebookPageId!, settings.metaAccessToken!, text, qr, platform, null, null, settings.metaAppSecret);

        // ── Legacy Facebook Carousel Flow ──────────────────────────────────────────
        // Only runs when facebookBotEnabled = false.
        // When facebookBotEnabled = true, the full conversational AI handles everything.
        if (platform === 'facebook' && !(settings.facebookBotEnabled ?? false)) {
        // effectivePayload: quick_reply.payload takes precedence over visible button text
        let effectivePayload = (quickReplyPayload || messageText || '').trim();
        const existingSession = bookingSessionMap.get(senderId);

        // ── Image from customer: protect active booking, else flow to AI ──────────
        // During active booking stages let the stage-recovery handlers process the image.
        // Otherwise images fall through to the conversational AI vision section below.
        if (imageUrl && !isPostback && settings.metaAccessToken && settings.facebookPageId) {
          const activeBookingStages: BookingSession['stage'][] = [
            'pick_qty', 'pick_age', 'age_type_q', 'add_more', 'adding_piece',
            'province', 'province_sub', 'phone', 'address', 'landmark',
          ];
          const inActiveBooking = existingSession && activeBookingStages.includes(existingSession.stage);
          if (inActiveBooking) {
            // Booking in progress → remind customer to complete steps, don't run vision
            await sendMetaMessage(senderId, settings.facebookPageId, settings.metaAccessToken,
              '😊 عيني، أكملي الحجز من الخطوات 👆',
              platform, settings.instagramAccountId, settings.instagramAccessToken, settings.metaAppSecret);
            await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
            return;
          }
          // Not in booking → fall through to conversational AI / vision at end of handler
        }

        // ── Text → Payload mapping: typing button label works same as clicking ──
        // Normalise so we strip any leading ✅ emoji and extra whitespace
        // parsedAge* set when age was typed (not button-clicked) — used for confirmation msg below
        let parsedAgeMonths: number | null = null;
        let parsedAgeRangeLabel: string | null = null;
        {
          const textNorm = effectivePayload.replace(/^✅\s*/, '').trim();
          const TEXT_TO_PAYLOAD: Record<string, string> = {
            // ── Season ───────────────────────────────────────────────────────────
            'شتوي':          'SELECT_SEASON_winter',
            'شتاء':          'SELECT_SEASON_winter',
            'شتائي':         'SELECT_SEASON_winter',
            'صيفي':          'SELECT_SEASON_summer',
            'صيف':           'SELECT_SEASON_summer',
            'بهاري':         'SELECT_SEASON_spring',
            'ربيع':          'SELECT_SEASON_spring',
            'كل المواسم':    'SELECT_SEASON_all',
            'الكل':          'SELECT_SEASON_all',
            'كلهم':          'SELECT_SEASON_all',
            'كل':            'SELECT_SEASON_all',
            // ── Gender ───────────────────────────────────────────────────────────
            'ولادي':         'SELECT_GENDER_boys',
            'ولاد':          'SELECT_GENDER_boys',
            'بناتي':         'SELECT_GENDER_girls',
            'بنات':          'SELECT_GENDER_girls',
            'مختلط':         'SELECT_GENDER_both',
            'ولادي وبناتي':  'SELECT_GENDER_both',
            // ── Age ranges (match label text from STORE_AGE_RANGES) ───────────
            '6 شهر الي 1 سنة':  `AGE_RANGE_${Math.round(0.5*12)}_${Math.round(1*12)}`,
            '1 الي 2 سنة':       `AGE_RANGE_${Math.round(1*12)}_${Math.round(2*12)}`,
            '2 الي 3 سنة':       `AGE_RANGE_${Math.round(2*12)}_${Math.round(3*12)}`,
            '2 الي 3 سنه':       `AGE_RANGE_${Math.round(2*12)}_${Math.round(3*12)}`,
            '3 الي 4 سنة':       `AGE_RANGE_${Math.round(3*12)}_${Math.round(4*12)}`,
            '3 الي 4 سنه':       `AGE_RANGE_${Math.round(3*12)}_${Math.round(4*12)}`,
            '4 الي 5 سنة':       `AGE_RANGE_${Math.round(4*12)}_${Math.round(5*12)}`,
            '5 الي 6 سنة':       `AGE_RANGE_${Math.round(5*12)}_${Math.round(6*12)}`,
            '6 الي 7 سنة':       `AGE_RANGE_${Math.round(6*12)}_${Math.round(7*12)}`,
            '7 الي 8 سنة':       `AGE_RANGE_${Math.round(7*12)}_${Math.round(8*12)}`,
            '9 الي 11 سنة':      `AGE_RANGE_${Math.round(9*12)}_${Math.round(11*12)}`,
            '11 الي 12 سنة':     `AGE_RANGE_${Math.round(11*12)}_${Math.round(12*12)}`,
            // ── Booking qty ──────────────────────────────────────────────────────
            '1 قطعة':  'BOOK_QTY_1',
            '2 قطعة':  'BOOK_QTY_2',
            '3 قطعة':  'BOOK_QTY_3',
            '4 قطعة':  'BOOK_QTY_4',
            '5 قطعة':  'BOOK_QTY_5',
            // ── Add more / No more ───────────────────────────────────────────────
            'أضيفي موديل':  'CAROUSEL_ADD_MORE',
            'لا هذا بس':    'CAROUSEL_NO_MORE',
            'لا، هذا بس':   'CAROUSEL_NO_MORE',
            'هذا بس':       'CAROUSEL_NO_MORE',
            'بس':           'CAROUSEL_NO_MORE',
            // ── Language ─────────────────────────────────────────────────────────
            'عربي':   'LANG_AR',
            'عربية':  'LANG_AR',
            'كوردي':  'LANG_KU',
            'كردي':   'LANG_KU',
          };
          const mapped = TEXT_TO_PAYLOAD[textNorm];
          // looksLikePayload: already a structured payload string — skip dynamic parsing
          const looksLikePayload = /^[A-Z][A-Z0-9_]{2,}$/.test(textNorm);
          // In pick_size stage: typed text is a size label, not an age — skip age parsing
          // and map directly to CAROUSEL_SIZE_* payload
          const sessStageCheck = bookingSessionMap.get(senderId)?.stage;
          if (sessStageCheck === 'pick_size' && textNorm && !looksLikePayload) {
            // Normalize hyphen → en-dash to match generated size labels (e.g. "6-12 شهر" → "6–12 شهر")
            const normalizedSize = textNorm.replace(/-/g, '–').trim();
            effectivePayload = `CAROUSEL_SIZE_${normalizedSize}`;
            console.log(`[SIZE_MAP] pick_size text → ${effectivePayload}`);
          } else if (mapped) {
            effectivePayload = mapped;
          } else if (!looksLikePayload) {
            // ── Dynamic age text parsing ──────────────────────────────────────
            // Handles "4 سنة", "6 شهر", "سنة ونص", "سنتين", etc.
            // ONLY runs when the customer is actively in the age-selection step of the
            // booking flow — prevents random messages with age words from triggering
            // product carousels outside the structured flow.
            const _ageCheckSess = bookingSessionMap.get(senderId);
            const _isAwaitingAge = pendingAgeSelectSet.has(senderId) ||
              (_ageCheckSess && (_ageCheckSess.stage === 'pick_age' || _ageCheckSess.stage === 'age_type_q'));
            if (!_isAwaitingAge) {
              // Not in age-selection step — skip age parsing entirely
            } else {
            // Converts arabic-indic digits to western first
            const toWestern = (s: string) => s.replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660));
            const normAge = toWestern(textNorm);

            // Extract numeric value
            let ageYears: number | null = null;

            // ── Collect all numbers in text ───────────────────────────────────
            const allNums = [...normAge.matchAll(/(\d+(?:\.\d+)?)/g)].map(m => parseFloat(m[1]));
            const hasYearWord  = /سنة|سنوات|سنين|سنه/.test(textNorm);
            const hasMonthWord = /شهر|شهور|أشهر|اشهر/.test(textNorm);
            const hasHalf      = /ونص|ونصف|و نص|و نصف/.test(textNorm);

            if (/سنتين|سنتان/.test(textNorm)) {
              // "سنتين" = 2 years
              ageYears = 2;
            } else if (/نص سنة|نصف سنة/.test(textNorm) || (hasHalf && allNums.length === 0)) {
              // "نص سنة" or bare "ونص" with no leading number = 0.5
              ageYears = 0.5;
            } else if (hasYearWord && hasMonthWord && allNums.length >= 2) {
              // "4 سنة و 7 شهر" — first number = years, match months explicitly
              const monthNum = normAge.match(/(\d+(?:\.\d+)?)\s*(?:شهر|شهور|أشهر|اشهر)/);
              const yearNum  = normAge.match(/(\d+(?:\.\d+)?)\s*(?:سنة|سنوات|سنين|سنه)/);
              if (yearNum && monthNum) {
                ageYears = parseFloat(yearNum[1]) + parseFloat(monthNum[1]) / 12;
              }
            } else if (!hasYearWord && hasMonthWord && allNums.length >= 2) {
              // "4 و 7 أشهر" — two numbers, month word at end → years + months
              const monthNum = normAge.match(/(\d+(?:\.\d+)?)\s*(?:شهر|شهور|أشهر|اشهر)/);
              if (monthNum) {
                const months = parseFloat(monthNum[1]);
                const years  = allNums.find(n => n !== months) ?? 0;
                ageYears = years + months / 12;
              }
            } else if (!hasYearWord && hasMonthWord && allNums.length === 1) {
              // "6 شهر" — single number of months only
              ageYears = allNums[0] / 12;
            } else if (hasYearWord && allNums.length >= 1) {
              // "4 سنة" / "4ونص سنة" / "4 ونص"
              const yearNum = normAge.match(/(\d+(?:\.\d+)?)\s*(?:سنة|سنوات|سنين|سنه)/);
              ageYears = parseFloat(yearNum ? yearNum[1] : String(allNums[0]));
              if (hasHalf) ageYears += 0.5;
            } else if (hasHalf && allNums.length >= 1) {
              // "4ونص" — number + half, no year word
              ageYears = allNums[0] + 0.5;
            } else if (allNums.length === 1) {
              // Bare integer — only when bot is awaiting age selection
              const num = allNums[0];
              if (num >= 1 && num <= 12 && Number.isInteger(num)) {
                const sess = bookingSessionMap.get(senderId);
                const isPendingAge = pendingAgeSelectSet.has(senderId) ||
                  (sess && sess.stage === 'pick_age');
                if (isPendingAge) ageYears = num;
              }
            }

            if (ageYears !== null) {
              // Match to nearest STORE_AGE_RANGE.
              // Upper-bound is INCLUSIVE: age=5 → [4,5] not [5,6] (lower range wins at boundary).
              let best: (typeof STORE_AGE_RANGES)[0] | null = null;
              for (const r of STORE_AGE_RANGES) {
                if (ageYears >= r.minY && ageYears <= r.maxY) {
                  best = r;
                  break; // first (lowest) range wins at boundary
                }
              }
              if (!best) {
                // Outside all ranges — pick nearest by distance
                let bestDist = Infinity;
                for (const r of STORE_AGE_RANGES) {
                  const dist = Math.min(Math.abs(ageYears - r.minY), Math.abs(ageYears - r.maxY));
                  if (dist < bestDist) { bestDist = dist; best = r; }
                }
              }
              if (best) {
                effectivePayload = `AGE_RANGE_${Math.round(best.minY * 12)}_${Math.round(best.maxY * 12)}`;
                // Store for confirmation reply (only when age was typed, not button-clicked)
                if (!quickReplyPayload) {
                  parsedAgeMonths = Math.round(ageYears * 12);
                  parsedAgeRangeLabel = best.label;
                }
                console.log(`[AGE_PARSE] "${textNorm}" → ${ageYears.toFixed(2)}yr → ${effectivePayload} (${best.label})`);
              }
            }
            } // end _isAwaitingAge else
          }
        }

        // ── Stage-aware payload promotion ────────────────────────────────────────
        // If the customer is in pick_age (booking flow) and text mapping produced
        // AGE_RANGE_* (browsing payload), convert it to BOOK_AGE_* so the booking
        // handler can proceed instead of routing to the product-browsing handler.
        {
          const pickAgeSess = bookingSessionMap.get(senderId);
          const ageRangePromote = /^AGE_RANGE_(\d+)_(\d+)$/.exec(effectivePayload);
          if (ageRangePromote && pickAgeSess?.stage === 'pick_age') {
            effectivePayload = `BOOK_AGE_${ageRangePromote[1]}_${ageRangePromote[2]}`;
            console.log(`[PAYLOAD_PROMOTE] AGE_RANGE→BOOK_AGE for pick_age: ${effectivePayload}`);
          }
        }

        const menuLang = senderLangMap.get(senderId) ?? 'ar';

        // ── Age-parse confirmation ────────────────────────────────────────────────
        // When the customer typed an age (not button click), reply confirming what the
        // bot understood in months before processing the booking/browsing handler.
        if (parsedAgeMonths !== null && parsedAgeRangeLabel !== null && settings.metaAccessToken && settings.facebookPageId) {
          const sessLang = bookingSessionMap.get(senderId)?.lang ?? senderLangMap.get(senderId) ?? 'ar';
          let confirmMsg: string;
          if (parsedAgeMonths < 12) {
            confirmMsg = sessLang === 'ku'
              ? `👶 فهمم — ${parsedAgeMonths} مانگ (${parsedAgeRangeLabel})`
              : `👶 فهمت — ${parsedAgeMonths} شهر (${parsedAgeRangeLabel})`;
          } else {
            const years = Math.floor(parsedAgeMonths / 12);
            const months = parsedAgeMonths % 12;
            const ageStr = months > 0
              ? (sessLang === 'ku' ? `${years} ساڵ و ${months} مانگ` : `${years} سنة و ${months} شهر`)
              : (sessLang === 'ku' ? `${years} ساڵ` : `${years} سنة`);
            confirmMsg = sessLang === 'ku'
              ? `👶 فهمم — ${ageStr} = ${parsedAgeMonths} مانگ (${parsedAgeRangeLabel})`
              : `👶 فهمت — ${ageStr} = ${parsedAgeMonths} شهر (${parsedAgeRangeLabel})`;
          }
          await sendMsg(confirmMsg);
          await new Promise(r => setTimeout(r, 350));
        }

        // ── Tutorial choice handlers (نعم/لا quick replies) ─────────────────────
        if (settings.metaAccessToken && settings.facebookPageId) {
          if (effectivePayload === 'TUTORIAL_YES') {
            pendingTutorialChoiceSet.delete(senderId);
            console.log(`[TUTORIAL_CHOICE] ${senderId} chose YES — sending tutorial steps`);
            const rawTI = (settings as any).tutorialImages as string | null | undefined;
            if (rawTI) {
              let tutorialSteps: Array<any> = [];
              try { tutorialSteps = JSON.parse(rawTI); } catch {}
              for (const step of tutorialSteps) {
                if (typeof step === 'string') {
                  await sendMetaImage(senderId, settings.facebookPageId, settings.metaAccessToken, step, platform, settings.instagramAccountId, settings.instagramAccessToken, settings.metaAppSecret);
                } else {
                  if (step.text?.trim()) {
                    await sendMetaMessage(senderId, settings.facebookPageId, settings.metaAccessToken, step.text.trim(), platform, settings.instagramAccountId, settings.instagramAccessToken, settings.metaAppSecret);
                    await new Promise(r => setTimeout(r, 350));
                  }
                  const imgs: string[] = Array.isArray(step.images) ? step.images : (step.imageUrl ? [step.imageUrl] : []);
                  for (const imgUrl of imgs) {
                    if (!imgUrl) continue;
                    await sendMetaImage(senderId, settings.facebookPageId, settings.metaAccessToken, imgUrl, platform, settings.instagramAccountId, settings.instagramAccessToken, settings.metaAppSecret);
                    await new Promise(r => setTimeout(r, 350));
                  }
                }
                await new Promise(r => setTimeout(r, 400));
              }
            }
            // Re-send the 5 main menu cards so user can pick directly
            await new Promise(r => setTimeout(r, 600));
            const afterTutorialPrompt = menuLang === 'ku' ? '🌸 عیني یەکێک لە خوارەوە هەڵبژێرە' : '🌸 هسه اختر القسم اللي تريد 👇';
            await sendMetaMessage(senderId, settings.facebookPageId, settings.metaAccessToken, afterTutorialPrompt, platform, settings.instagramAccountId, settings.instagramAccessToken, settings.metaAppSecret);
            await new Promise(r => setTimeout(r, 400));
            const menuEls = buildMainMenuCarousel(menuLang);
            await sendMetaGenericTemplate(senderId, settings.facebookPageId, settings.metaAccessToken, menuEls, platform, settings.metaAppSecret, settings.instagramAccountId, settings.instagramAccessToken);
            await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
            return;
          }

          if (effectivePayload === 'TUTORIAL_NO') {
            pendingTutorialChoiceSet.delete(senderId);
            console.log(`[TUTORIAL_CHOICE] ${senderId} chose NO`);
            await sendMetaMessage(
              senderId, settings.facebookPageId, settings.metaAccessToken,
              'تمام عيني 🌸\nانقري على (أسعار و أعمار) تحت 👇',
              platform, settings.instagramAccountId, settings.instagramAccessToken, settings.metaAppSecret
            );
            await new Promise(r => setTimeout(r, 400));
            const _menuElsNo = buildMainMenuCarousel(customerLang);
            await sendMetaGenericTemplate(senderId, settings.facebookPageId, settings.metaAccessToken, _menuElsNo, platform, settings.metaAppSecret, settings.instagramAccountId, settings.instagramAccessToken);
            await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
            return;
          }

          // If user is pending tutorial choice and sends a random message (not a menu button) → remind them
          const isMainMenuPayload = /^(MENU_PRICES|MENU_TRACK|MENU_EXCHANGE|MENU_RETURN|MENU_DELIVERY|POST_BOOK_CANCEL|POST_BOOK_ADD|TUTORIAL_YES|TUTORIAL_NO)$/.test(effectivePayload);
          if (pendingTutorialChoiceSet.has(senderId) && !isMainMenuPayload) {
            console.log(`[TUTORIAL_CHOICE] ${senderId} sent random message while pending — reminding`);
            await sendMetaMessage(
              senderId, settings.facebookPageId, settings.metaAccessToken,
              'عيني الخطوات تحت واضحة 👇\nلازم تنقر على الأزرار حتى تعرف كل شيء 😊',
              platform, settings.instagramAccountId, settings.instagramAccessToken, settings.metaAppSecret
            );
            await new Promise(r => setTimeout(r, 400));
            const _menuElsRemind = buildMainMenuCarousel(customerLang);
            await sendMetaGenericTemplate(senderId, settings.facebookPageId, settings.metaAccessToken, _menuElsRemind, platform, settings.metaAppSecret, settings.instagramAccountId, settings.instagramAccessToken);
            await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
            return;
          }

          // Clicking any main menu button → clear pending tutorial state
          if (isMainMenuPayload) {
            pendingTutorialChoiceSet.delete(senderId);
          }
        }

        // ── Main menu handler (MENU_* payloads) ──────────────────────────────────
        if (settings.metaAccessToken && settings.facebookPageId) {

          // MENU_PRICES → step 1: show season selection cards
          if (effectivePayload === 'MENU_PRICES') {
            senderSeasonMap.delete(senderId);
            senderGenderMap.delete(senderId);
            pendingAgeSelectSet.add(senderId);
            const seasonEls = buildSeasonCarouselElements();
            const seasonPrompt = menuLang === 'ku' ? '🧥 کام وەرزێک؟' : '🧥 يا موسم تريد؟';
            await sendMsg(seasonPrompt);
            await new Promise(r => setTimeout(r, 350));
            await sendMetaGenericTemplate(senderId, settings.facebookPageId, settings.metaAccessToken, seasonEls, platform, settings.metaAppSecret, settings.instagramAccountId, settings.instagramAccessToken);
            return;
          }

          // SELECT_SEASON_* → step 2: save season, show gender selection cards
          const seasonMatch = /^SELECT_SEASON_(\w+)$/.exec(effectivePayload);
          if (seasonMatch && settings.metaAccessToken && settings.facebookPageId) {
            await sendTypingOn(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
            const chosenSeason = seasonMatch[1]; // winter | summer | spring | all
            senderSeasonMap.set(senderId, chosenSeason);
            senderGenderMap.delete(senderId);
            const seasonLabels: Record<string, string> = { winter: '🧥 شتوي', summer: '☀️ صيفي', spring: '🌸 بهاري', all: '🎀 كل المواسم' };
            const seasonLabel = seasonLabels[chosenSeason] ?? chosenSeason;
            const genderEls = buildGenderCarouselElements();
            await sendMsg(`✅ ${seasonLabel}\n\n👦👧 بناتي او ولادي؟`);
            await new Promise(r => setTimeout(r, 350));
            await sendMetaGenericTemplate(senderId, settings.facebookPageId, settings.metaAccessToken, genderEls, platform, settings.metaAppSecret, settings.instagramAccountId, settings.instagramAccessToken);
            return;
          }

          // SELECT_GENDER_* → step 3: save gender, show age selection cards
          const genderSelectMatch = /^SELECT_GENDER_(\w+)$/.exec(effectivePayload);
          if (genderSelectMatch && settings.metaAccessToken && settings.facebookPageId) {
            await sendTypingOn(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
            const chosenGender = genderSelectMatch[1]; // boys | girls | both
            senderGenderMap.set(senderId, chosenGender);
            const genderLabels: Record<string, string> = { boys: '👦 ولادي', girls: '👧 بنات', both: '👫 مختلط' };
            const genderLabel = genderLabels[chosenGender] ?? chosenGender;
            const savedSeason = senderSeasonMap.get(senderId);
            const ageEls = await buildAgeCarouselElements(savedSeason, chosenGender);
            if (ageEls.length > 0) {
              await sendMsg(`✅ ${genderLabel}\n\n👶 شنو العمر؟`);
              await new Promise(r => setTimeout(r, 350));
              await sendMetaGenericTemplate(senderId, settings.facebookPageId, settings.metaAccessToken, ageEls, platform, settings.metaAppSecret, settings.instagramAccountId, settings.instagramAccessToken);
            } else {
              await sendMsg('نعتذر لج 🙏\nماكو موديلات متوفرة لهذا الاختيار حالياً');
            }
            return;
          }

          // MENU_TRACK → notify Telegram + patience reply
          if (effectivePayload === 'MENU_TRACK') {
            const trackMsg = menuLang === 'ku'
              ? 'عیني 📦 تا ئێستا نۆبەی ئامادەکردنی داواکاریەکەت نەگاتووە\nبەڵام کاتێک نۆبەت بگات ئێمە پەیوەندیت پێ دەکەین 🙏'
              : 'عيني 📦 لحد هسة ما اج دور تحضير طلبيتج\nبس تجي دور طلبيتج رح نتواصل وياكم 🙏';
            await sendMsg(trackMsg);
            if (settings.telegramBotToken && settings.telegramChatId) {
              const tgMsg = `📦 *استفسار عن طلبية*\n\n👤 المستخدم: ${senderId}\n📱 المنصة: ${platform === 'instagram' ? 'انستقرام' : 'فيسبوك'}\n\n⚠️ الزبون يسأل عن أين طلبيته — يرجى التحقق والرد`;
              await sendTelegramNotification(settings.telegramBotToken, settings.telegramChatId, tgMsg, []).catch(() => {});
            }
            return;
          }

          // MENU_EXCHANGE → set issue mode + notify Telegram + reply customer
          if (effectivePayload === 'MENU_EXCHANGE') {
            senderIssueMap.set(senderId, 'exchange');
            const issueMsg = menuLang === 'ku'
              ? 'عیني 🔄 پەیامت ئەنێرمە بۆ کارمەندی مەخزەن تا کێشەکەت چارەسەر بکات\nکەمێک صەبر بکە تاکو پەیوەندیت پێ دەکەن 🙏'
              : 'عيني 🔄 رح أدز رسالة لموظف المخزن حتى يحل مشكلتج\nشوية صبر لو سمحتِ حتى يتواصل وياج 🙏';
            await sendMsg(issueMsg);
            if (settings.telegramBotToken && settings.telegramChatId) {
              const tgMsg = `🔄 *طلب تبديل جديد*\n\n👤 المستخدم: ${senderId}\n📱 المنصة: ${platform === 'instagram' ? 'انستقرام' : 'فيسبوك'}\n\n⚠️ يرجى التواصل مع الزبون في أسرع وقت`;
              await sendTelegramNotification(settings.telegramBotToken, settings.telegramChatId, tgMsg, []).catch(() => {});
            }
            return;
          }

          // MENU_RETURN → show 2 sub-cards: received / returned
          if (effectivePayload === 'MENU_RETURN') {
            const returnPrompt = menuLang === 'ku'
              ? '↩️ تکایە بڵێ ئایا طلبیاکەت وەرگرتووتە یان گەڕاندوتەوە؟'
              : '↩️ هل استلمتِ الطلبية أم رجعتيها؟';
            await sendMsg(returnPrompt);
            await new Promise(r => setTimeout(r, 350));
            const returnSubCards = menuLang === 'ku'
              ? [
                  {
                    title: '📦 وەرگرتم',
                    subtitle: 'طلبیاکەم وەرگرتم و دەمەوێت بیگەڕێنمەوە',
                    buttons: [{ type: 'postback' as const, title: '📦 وەرگرتمی', payload: 'RETURN_RECEIVED' }],
                  },
                  {
                    title: '✅ گەڕاندمەوە',
                    subtitle: 'طلبیاکەم گەڕاندمەوە',
                    buttons: [{ type: 'postback' as const, title: '✅ گەڕاندمەوە', payload: 'RETURN_RETURNED' }],
                  },
                ]
              : [
                  {
                    title: '📦 استلمت الطلبية',
                    subtitle: 'استلمت الطلبية وأريد إرجاعها',
                    buttons: [{ type: 'postback' as const, title: '📦 استلمتها', payload: 'RETURN_RECEIVED' }],
                  },
                  {
                    title: '✅ رجعتها',
                    subtitle: 'رجعت الطلبية مسبقاً',
                    buttons: [{ type: 'postback' as const, title: '✅ رجعتيها', payload: 'RETURN_RETURNED' }],
                  },
                ];
            await sendMetaGenericTemplate(senderId, settings.facebookPageId, settings.metaAccessToken, returnSubCards, platform, settings.metaAppSecret, settings.instagramAccountId, settings.instagramAccessToken);
            return;
          }

          // RETURN_RECEIVED → customer received order and wants to return it
          if (effectivePayload === 'RETURN_RECEIVED') {
            senderIssueMap.set(senderId, 'return');
            const returnMsg = menuLang === 'ku'
              ? 'عیني ↩️ پەیامت ئەنێرمە بۆ کارمەندی مەخزەن تا پەیوەندیت پێ بکات\nکەمێک صەبر بکە لو سمحتِ 🙏'
              : 'عيني ↩️ رح أدز رسالة لموظف المخزن حتى يتواصل وياج\nشوية صبر لو سمحتِ 🙏';
            await sendMsg(returnMsg);
            if (settings.telegramBotToken && settings.telegramChatId) {
              const tgMsg = `↩️ *طلب ترجيع جديد*\n\n👤 المستخدم: ${senderId}\n📱 المنصة: ${platform === 'instagram' ? 'انستقرام' : 'فيسبوك'}\n\n⚠️ الزبون استلم الطلبية ويريد إرجاعها — يرجى التواصل`;
              await sendTelegramNotification(settings.telegramBotToken, settings.telegramChatId, tgMsg, []).catch(() => {});
            }
            return;
          }

          // RETURN_RETURNED → customer already returned order
          if (effectivePayload === 'RETURN_RETURNED') {
            const doneMsg = menuLang === 'ku'
              ? 'عیني 🙏 باشە خیر\nئەگەر پێویستت بە هیچ شتێک بوو بەردەوام بی'
              : 'عيني 🙏 صار خير\nإذا احتجتِ أي شي ثاني نحن هنا دائماً 🌸';
            await sendMsg(doneMsg);
            senderIssueMap.delete(senderId);
            return;
          }

          // MENU_DELIVERY → show delivery price cards
          if (effectivePayload === 'MENU_DELIVERY') {
            const dlvIntro = menuLang === 'ku'
              ? '🚚 نرخەکانی گەیاندن بۆ پارێزگاکان:'
              : '🚚 أسعار التوصيل للمحافظات:';
            await sendMsg(dlvIntro);
            await new Promise(r => setTimeout(r, 350));
            const dlvCards = buildDeliveryInfoCarousel((settings as any).deliveryFees, menuLang);
            if (dlvCards.length > 0) {
              await sendMetaGenericTemplate(senderId, settings.facebookPageId, settings.metaAccessToken, dlvCards, platform, settings.metaAppSecret, settings.instagramAccountId, settings.instagramAccessToken);
            } else {
              const noFees = menuLang === 'ku'
                ? 'ببورە، ئێستا زانیاری گەیاندن بەردەست نییە'
                : 'عذراً، معلومات التوصيل غير متوفرة حالياً';
              await sendMsg(noFees);
            }
            return;
          }

          // DELIVERY_OK → acknowledgment of delivery info
          if (effectivePayload === 'DELIVERY_OK') {
            const ackMsg = menuLang === 'ku'
              ? '🌸 هیوادارم بەسوودت بێت! ئەگەر داواکاریت هەیە دوگمەی "استفسار عن الأسعار" بکە'
              : '🌸 إن شاء الله تستفيدين! إذا أردتِ طلب شيء اضغطي على "أسعار و أعمار"';
            await sendMsg(ackMsg);
            return;
          }

          // ── POST_BOOK_PRICES → same as MENU_PRICES: start with season ────────────────────────
          if (effectivePayload === 'POST_BOOK_PRICES') {
            senderSeasonMap.delete(senderId);
            senderGenderMap.delete(senderId);
            pendingAgeSelectSet.add(senderId);
            const seasonEls2 = buildSeasonCarouselElements();
            await sendMsg('🧥 يا موسم تريد؟');
            await new Promise(r => setTimeout(r, 350));
            await sendMetaGenericTemplate(senderId, settings.facebookPageId!, settings.metaAccessToken!, seasonEls2, platform, settings.metaAppSecret, settings.instagramAccountId, settings.instagramAccessToken);
            return;
          }

          // ── POST_BOOK_CANCEL → ask confirmation ──────────────────────────
          if (effectivePayload === 'POST_BOOK_CANCEL') {
            const cancelConfirmEls = [
              {
                title: menuLang === 'ku' ? '✅ بەڵێ، هەڵبوەشێنەوە' : '✅ الغي الطلب',
                subtitle: menuLang === 'ku' ? 'داواکاریەکەت هەڵدەبوەشێنرێتەوە' : 'رح نلغي طلبيتج',
                buttons: [{ type: 'postback' as const, title: menuLang === 'ku' ? '✅ بەڵێ' : '✅ الغي الطلب', payload: 'CANCEL_YES' }],
              },
              {
                title: menuLang === 'ku' ? '❌ نەخێر، مانەوە' : '❌ لا تلغي الطلب',
                subtitle: menuLang === 'ku' ? 'داواکاریەکەت دەمێنێتەوە' : 'خليها، لا تلغي الطلب',
                buttons: [{ type: 'postback' as const, title: menuLang === 'ku' ? '❌ نەخێر' : '❌ لا تلغي الطلب', payload: 'CANCEL_NO' }],
              },
            ];
            const cancelQ = menuLang === 'ku' ? 'عیني، دەتەوێت داواکاریەکەت هەڵبوەشێنیتەوە؟' : 'عيني نلغي الطلبية؟ 🤔';
            await sendMsg(cancelQ);
            await new Promise(r => setTimeout(r, 400));
            await sendMetaGenericTemplate(senderId, settings.facebookPageId!, settings.metaAccessToken!, cancelConfirmEls, platform, settings.metaAppSecret, settings.instagramAccountId, settings.instagramAccessToken);
            return;
          }

          // ── CANCEL_YES → mark cancelled + resend receipt with لغو overlay ─
          if (effectivePayload === 'CANCEL_YES' && settings.metaAccessToken && settings.facebookPageId) {
            const cancelLang = existingSession?.lang ?? menuLang;
            // Update DB status to cancelled
            if (existingSession?.dbBookingId) {
              await db.update(bookingsTable).set({ status: 'cancelled' }).where(eq(bookingsTable.id, existingSession.dbBookingId)).catch(() => {});
            }
            const cancelledMsg = cancelLang === 'ku'
              ? 'تمام عيني، داواکاریەکەت هەڵوەشاندەوە ✅'
              : 'تمام عيني، تم إلغاء الطلبية ✅';
            await sendMsg(cancelledMsg);
            await new Promise(r => setTimeout(r, 400));
            // Resend receipt image with cancelled overlay to customer
            const cancelTok = existingSession?.receiptToken;
            if (cancelTok && settings.facebookPageId && settings.metaAccessToken) {
              const baseDomainC = (process.env.LOCAL_DOMAIN || 'localhost:3000').split(',')[0]?.trim() || 'sonbola.shop';
              const cancelledImageUrl = `https://${baseDomainC}/api/public/receipt/${cancelTok}/image?cancelled=1`;
              await sendMetaImage(senderId, settings.facebookPageId, settings.metaAccessToken, cancelledImageUrl, platform, settings.instagramAccountId, settings.instagramAccessToken, settings.metaAppSecret).catch(() => {});
              // Notify Telegram: text + cancelled receipt image
              if (settings.telegramBotToken && settings.telegramChatId) {
                const orderNum = existingSession?.dbBookingId ? existingSession.dbBookingId + ORDER_OFFSET : '—';
                const cancelTgMsg = `❌ <b>إلغاء طلبية #${orderNum}</b>\n\n👤 المستخدم: <code>${senderId}</code>\n⚠️ الزبون ألغى الطلبية`;
                await sendTelegramNotification(settings.telegramBotToken, settings.telegramChatId, cancelTgMsg, []).catch(() => {});
                await sendTelegramPhoto(settings.telegramBotToken, settings.telegramChatId, cancelledImageUrl, `❌ لغو طلب #${orderNum}`).catch(() => {});
              }
            }
            return;
          }

          // ── CANCEL_NO → keep order ────────────────────────────────────────
          if (effectivePayload === 'CANCEL_NO') {
            const keepMsg = existingSession?.lang === 'ku'
              ? 'تمام عیني، داواکاریەکەت ئەوەی مایەوە 🌸\nکەمێک صەبر بکە تاکو نۆبەت بگات'
              : 'تمام عيني طلبيتج ما اج دور تحضيرها شوية صبر 🌸';
            await sendMsg(keepMsg);
            return;
          }

          // ── POST_BOOK_ADD → ask about adding a piece ─────────────────────
          if (effectivePayload === 'POST_BOOK_ADD') {
            const addConfirmEls = [
              {
                title: menuLang === 'ku' ? '✅ بەڵێ، زیادکردن' : '✅ نعم، أضيفي',
                subtitle: menuLang === 'ku' ? 'قەبارەی نوێ هەڵبژێرە' : 'رح تضيفين قطعة جديدة',
                buttons: [{ type: 'postback' as const, title: menuLang === 'ku' ? '✅ بەڵێ' : '✅ نعم', payload: 'ADD_ITEM_YES' }],
              },
              {
                title: menuLang === 'ku' ? '❌ نەخێر' : '❌ لا',
                subtitle: menuLang === 'ku' ? 'داواکاریەکەت ئەوەی مایەوە' : 'طلبيتج تبقى نفسها',
                buttons: [{ type: 'postback' as const, title: menuLang === 'ku' ? '❌ نەخێر' : '❌ لا', payload: 'ADD_ITEM_NO' }],
              },
            ];
            const addQ = menuLang === 'ku' ? 'عیني، دەتەوێت قەبارەیەکی تر زیاد بکەیت بۆ داواکاریەکەت؟' : 'عيني تريدي تضيفين على الطلبية؟ 👗';
            await sendMsg(addQ);
            await new Promise(r => setTimeout(r, 400));
            await sendMetaGenericTemplate(senderId, settings.facebookPageId!, settings.metaAccessToken!, addConfirmEls, platform, settings.metaAppSecret, settings.instagramAccountId, settings.instagramAccessToken);
            return;
          }

          // ── ADD_ITEM_YES → start new item booking flow (adding to existing) ─
          if (effectivePayload === 'ADD_ITEM_YES' && existingSession && settings.metaAccessToken && settings.facebookPageId) {
            existingSession.addingToExisting = true;
            existingSession.baseProductsCount = existingSession.products.length;
            existingSession.stage = 'adding_piece';
            bookingSessionMap.set(senderId, existingSession);
            senderSeasonMap.delete(senderId);
            senderGenderMap.delete(senderId);
            pendingAgeSelectSet.add(senderId);
            const seasonEls3 = buildSeasonCarouselElements();
            await sendMsg('🧥 يا موسم تريد؟');
            await new Promise(r => setTimeout(r, 350));
            await sendMetaGenericTemplate(senderId, settings.facebookPageId!, settings.metaAccessToken!, seasonEls3, platform, settings.metaAppSecret, settings.instagramAccountId, settings.instagramAccessToken);
            return;
          }

          // ── ADD_ITEM_NO → confirm and resend receipt image to customer only ─
          if (effectivePayload === 'ADD_ITEM_NO' && settings.metaAccessToken && settings.facebookPageId) {
            const noAddMsg = existingSession?.lang === 'ku'
              ? 'تمام عیني، داواکاریەکەت ئەوەی مایەوە 🌸'
              : 'تمام عيني طلبيتج نفسها 🌸';
            await sendMsg(noAddMsg);
            // Resend receipt image to customer ONLY (not Telegram)
            const noAddTok = existingSession?.receiptToken;
            if (noAddTok && settings.facebookPageId && settings.metaAccessToken) {
              await new Promise(r => setTimeout(r, 400));
              const baseDomainNA = (process.env.LOCAL_DOMAIN || 'localhost:3000').split(',')[0]?.trim() || 'sonbola.shop';
              const noAddImageUrl = `https://${baseDomainNA}/api/public/receipt/${noAddTok}/image`;
              await sendMetaImage(senderId, settings.facebookPageId, settings.metaAccessToken, noAddImageUrl, platform, settings.instagramAccountId, settings.instagramAccessToken, settings.metaAppSecret).catch(() => {});
            }
            return;
          }

          // ── Auto-reply for customers in exchange/return issue mode ────────────
          if (senderIssueMap.has(senderId) && !isPostback && messageText.trim()) {
            const issueType = senderIssueMap.get(senderId);
            const patienceMsg = menuLang === 'ku'
              ? `عیوني 🙏 ${issueType === 'exchange' ? 'گۆڕینەوەکەت' : 'گەڕاندنەوەکەت'} تۆمار کراوە\nکەمێک صەبر بکە تاکو کارمەند پەیوەندیت پێ دەکات`
              : `عيوني 🙏 ${issueType === 'exchange' ? 'طلب التبديل' : 'طلب الترجيع'} مسجل عندنا\nشوية صبر حتى يجاوبج موظف المخزن`;
            await sendMsg(patienceMsg);
            return;
          }
        }

        // ── Booking complete: handle post-booking payloads + BOOK_ postback ──
        if (existingSession?.stage === 'complete' && settings.metaAccessToken && settings.facebookPageId) {

          // ── POST_BOOK_PRICES ────────────────────────────────────────────
          if (effectivePayload === 'POST_BOOK_PRICES') {
            senderSeasonMap.delete(senderId);
            senderGenderMap.delete(senderId);
            pendingAgeSelectSet.add(senderId);
            const seasonElsC = buildSeasonCarouselElements();
            await sendMsg('🧥 يا موسم تريد؟');
            await new Promise(r => setTimeout(r, 350));
            await sendMetaGenericTemplate(senderId, settings.facebookPageId, settings.metaAccessToken, seasonElsC, platform, settings.metaAppSecret, settings.instagramAccountId, settings.instagramAccessToken);
            await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
            return;
          }

          // ── POST_BOOK_CANCEL ────────────────────────────────────────────
          if (effectivePayload === 'POST_BOOK_CANCEL') {
            const cancelConfirmElsC = [
              {
                title: existingSession.lang === 'ku' ? '✅ بەڵێ، هەڵبوەشێنەوە' : '✅ الغي الطلب',
                subtitle: existingSession.lang === 'ku' ? 'داواکاریەکەت هەڵدەبوەشێنرێتەوە' : 'رح نلغي طلبيتج',
                buttons: [{ type: 'postback' as const, title: existingSession.lang === 'ku' ? '✅ بەڵێ' : '✅ الغي الطلب', payload: 'CANCEL_YES' }],
              },
              {
                title: existingSession.lang === 'ku' ? '❌ نەخێر، مانەوە' : '❌ لا تلغي الطلب',
                subtitle: existingSession.lang === 'ku' ? 'داواکاریەکەت دەمێنێتەوە' : 'خليها، لا تلغي الطلب',
                buttons: [{ type: 'postback' as const, title: existingSession.lang === 'ku' ? '❌ نەخێر' : '❌ لا تلغي الطلب', payload: 'CANCEL_NO' }],
              },
            ];
            await sendMsg(existingSession.lang === 'ku' ? 'عیني، دەتەوێت داواکاریەکەت هەڵبوەشێنیتەوە؟' : 'عيني نلغي الطلبية؟ 🤔');
            await new Promise(r => setTimeout(r, 400));
            await sendMetaGenericTemplate(senderId, settings.facebookPageId, settings.metaAccessToken, cancelConfirmElsC, platform, settings.metaAppSecret, settings.instagramAccountId, settings.instagramAccessToken);
            await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
            return;
          }

          // ── CANCEL_YES ──────────────────────────────────────────────────
          if (effectivePayload === 'CANCEL_YES') {
            if (existingSession.dbBookingId) {
              await db.update(bookingsTable).set({ status: 'cancelled' }).where(eq(bookingsTable.id, existingSession.dbBookingId)).catch(() => {});
            }
            const cancelledMsgC = existingSession.lang === 'ku'
              ? 'تمام عيني، داواکاریەکەت هەڵوەشاندەوە ✅'
              : 'تمام عيني، تم إلغاء الطلبية ✅';
            await sendMsg(cancelledMsgC);
            await new Promise(r => setTimeout(r, 400));
            const cancelTokC = existingSession.receiptToken;
            if (cancelTokC) {
              const baseDomainCC = (process.env.LOCAL_DOMAIN || 'localhost:3000').split(',')[0]?.trim() || 'sonbola.shop';
              const cancelledImgUrl = `https://${baseDomainCC}/api/public/receipt/${cancelTokC}/image?cancelled=1`;
              await sendMetaImage(senderId, settings.facebookPageId, settings.metaAccessToken, cancelledImgUrl, platform, settings.instagramAccountId, settings.instagramAccessToken, settings.metaAppSecret).catch(() => {});
              if (settings.telegramBotToken && settings.telegramChatId) {
                const orderNumC = existingSession.dbBookingId ? existingSession.dbBookingId + ORDER_OFFSET : '—';
                const cancelTgMsgC = `❌ <b>إلغاء طلبية #${orderNumC}</b>\n\n👤 المستخدم: <code>${senderId}</code>\n⚠️ الزبون ألغى الطلبية`;
                await sendTelegramNotification(settings.telegramBotToken, settings.telegramChatId, cancelTgMsgC, []).catch(() => {});
                await sendTelegramPhoto(settings.telegramBotToken, settings.telegramChatId, cancelledImgUrl, `❌ لغو طلب #${orderNumC}`).catch(() => {});
              }
            }
            await new Promise(r => setTimeout(r, 500));
            const postCardsC = buildPostBookingCarousel(existingSession.lang);
            await sendMetaGenericTemplate(senderId, settings.facebookPageId, settings.metaAccessToken, postCardsC, platform, settings.metaAppSecret, settings.instagramAccountId, settings.instagramAccessToken);
            await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
            return;
          }

          // ── CANCEL_NO ───────────────────────────────────────────────────
          if (effectivePayload === 'CANCEL_NO') {
            const keepMsgC = existingSession.lang === 'ku'
              ? 'تمام عیني، داواکاریەکەت ئەوەی مایەوە 🌸\nکەمێک صەبر بکە تاکو نۆبەت بگات'
              : 'تمام عيني طلبيتج ما اج دور تحضيرها شوية صبر 🌸';
            await sendMsg(keepMsgC);
            await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
            return;
          }

          // ── POST_BOOK_ADD ───────────────────────────────────────────────
          if (effectivePayload === 'POST_BOOK_ADD') {
            const addConfirmElsC = [
              {
                title: existingSession.lang === 'ku' ? '✅ بەڵێ، زیادکردن' : '✅ نعم، أضيفي',
                subtitle: existingSession.lang === 'ku' ? 'قەبارەی نوێ هەڵبژێرە' : 'رح تضيفين قطعة جديدة',
                buttons: [{ type: 'postback' as const, title: existingSession.lang === 'ku' ? '✅ بەڵێ' : '✅ نعم', payload: 'ADD_ITEM_YES' }],
              },
              {
                title: existingSession.lang === 'ku' ? '❌ نەخێر' : '❌ لا',
                subtitle: existingSession.lang === 'ku' ? 'داواکاریەکەت ئەوەی مایەوە' : 'طلبيتج تبقى نفسها',
                buttons: [{ type: 'postback' as const, title: existingSession.lang === 'ku' ? '❌ نەخێر' : '❌ لا', payload: 'ADD_ITEM_NO' }],
              },
            ];
            await sendMsg(existingSession.lang === 'ku' ? 'عیني، دەتەوێت قەبارەیەکی تر زیاد بکەیت بۆ داواکاریەکەت؟' : 'عيني تريدي تضيفين على الطلبية؟ 👗');
            await new Promise(r => setTimeout(r, 400));
            await sendMetaGenericTemplate(senderId, settings.facebookPageId, settings.metaAccessToken, addConfirmElsC, platform, settings.metaAppSecret, settings.instagramAccountId, settings.instagramAccessToken);
            await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
            return;
          }

          // ── ADD_ITEM_YES ────────────────────────────────────────────────
          if (effectivePayload === 'ADD_ITEM_YES') {
            existingSession.addingToExisting = true;
            existingSession.baseProductsCount = existingSession.products.length;
            existingSession.stage = 'adding_piece';
            bookingSessionMap.set(senderId, existingSession);
            senderSeasonMap.delete(senderId);
            senderGenderMap.delete(senderId);
            pendingAgeSelectSet.add(senderId);
            const seasonElsAdd = buildSeasonCarouselElements();
            await sendMsg('🧥 يا موسم تريد؟');
            await new Promise(r => setTimeout(r, 350));
            await sendMetaGenericTemplate(senderId, settings.facebookPageId, settings.metaAccessToken, seasonElsAdd, platform, settings.metaAppSecret, settings.instagramAccountId, settings.instagramAccessToken);
            await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
            return;
          }

          // ── ADD_ITEM_NO ─────────────────────────────────────────────────
          if (effectivePayload === 'ADD_ITEM_NO') {
            const noAddMsgC = existingSession.lang === 'ku'
              ? 'تمام عیني، داواکاریەکەت ئەوەی مایەوە 🌸'
              : 'تمام عيني طلبيتج نفسها 🌸';
            await sendMsg(noAddMsgC);
            const noAddTokC = existingSession.receiptToken;
            if (noAddTokC) {
              await new Promise(r => setTimeout(r, 400));
              const baseDomainNAC = (process.env.LOCAL_DOMAIN || 'localhost:3000').split(',')[0]?.trim() || 'sonbola.shop';
              const noAddImgUrl = `https://${baseDomainNAC}/api/public/receipt/${noAddTokC}/image`;
              await sendMetaImage(senderId, settings.facebookPageId, settings.metaAccessToken, noAddImgUrl, platform, settings.instagramAccountId, settings.instagramAccessToken, settings.metaAppSecret).catch(() => {});
            }
            await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
            return;
          }

          // Browsing + new-booking payloads must fall through to their proper handlers below.
          // BOOK_ (احجزيه on a new product) starts a fresh session via the regular BOOK_ handler.
          const isBrowsingPayload = /^(SELECT_SEASON_|SELECT_GENDER_|AGE_RANGE_|AGE_PICK_|SHOW_AGE_CAROUSEL|CAROUSEL_ADD_MORE|CAROUSEL_NO_MORE|BOOK_QTY_|BOOK_AGE_|BOOK_|PRODUCTS_NEXT_PAGE)/.test(effectivePayload);
          if (isBrowsingPayload) {
            // Do NOT return — let it fall through to the proper handler below
          } else {
            // Any other unrecognized message → re-show post-booking cards
            const postCardsHold = buildPostBookingCarousel(existingSession.lang);
            await sendMetaGenericTemplate(senderId, settings.facebookPageId, settings.metaAccessToken, postCardsHold, platform, settings.metaAppSecret, settings.instagramAccountId, settings.instagramAccessToken);
            await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
            return;
          }
        }

        // ── AGE_RANGE_minMonths_maxMonths: user selected an age range (new format) ──
        const ageRangeMatch = /^AGE_RANGE_(\d+)_(\d+)$/.exec(effectivePayload);
        // ── AGE_PICK_n: legacy integer-year format (kept for backward compat) ──
        const agePickMatch = /^AGE_PICK_(\d+)$/.exec(effectivePayload);
        if ((ageRangeMatch || agePickMatch) && settings.metaAccessToken && settings.facebookPageId) {
          await sendTypingOn(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
          let chosenAge: number;
          let ageLabel: string;
          if (ageRangeMatch) {
            const minMonths = parseInt(ageRangeMatch[1], 10);
            const maxMonths = parseInt(ageRangeMatch[2], 10);
            chosenAge = minMonths / 12;
            if (minMonths < 12) {
              ageLabel = `${minMonths} شهر الي ${Math.round(maxMonths / 12)} سنة`;
            } else {
              ageLabel = `${Math.round(minMonths / 12)} الي ${Math.round(maxMonths / 12)} سنة`;
            }
          } else {
            chosenAge = parseInt(agePickMatch![1], 10);
            ageLabel = formatAgeLabel(chosenAge);
          }
          let chosenAgeMax: number | undefined;
          if (ageRangeMatch) {
            const maxMonths2 = parseInt(ageRangeMatch[2], 10);
            chosenAgeMax = maxMonths2 / 12;
          }
          pendingAgeSelectSet.delete(senderId);
          senderAgeMap.set(senderId, chosenAge);
          if (chosenAgeMax != null) senderAgeMaxMap.set(senderId, chosenAgeMax);
          senderProductQueueMap.delete(senderId); // clear any stale pagination queue
          senderLangMap.set(senderId, 'ar');
          senderModeMap.set(senderId, 'carousel');
          const savedSeasonAge = senderSeasonMap.get(senderId);
          const savedGenderAge = senderGenderMap.get(senderId);
          console.log(`[AGE_PICK] ${senderId} → age=${chosenAge}-${chosenAgeMax} season=${savedSeasonAge} gender=${savedGenderAge} (${ageLabel})`);
          await sendMetaMessage(senderId, settings.facebookPageId, settings.metaAccessToken,
            `✅ عيني، هسة رح أدز كل الموديلات المتوفرة بالمخزن لعمر ${ageLabel} 👇`,
            platform, settings.instagramAccountId, settings.instagramAccessToken, settings.metaAppSecret);
          await new Promise(r => setTimeout(r, 400));
          // force=true: bypass 30s carousel dedup so multiple age ranges can be sent in sequence
          await sendAllCarouselsOnly(senderId, settings.facebookPageId, settings.metaAccessToken,
            platform, 'ar', settings.metaAppSecret, chosenAge, chosenAgeMax, savedSeasonAge, savedGenderAge, true,
            settings.instagramAccountId, settings.instagramAccessToken);
          await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
          return;
        }

        // ── Detect BOOK_ postback ────────────────────────────────────────────
        const bookMatch = /^BOOK_(.+)_(\d+)_([\d.]+)_([\d.]+)$/.exec(effectivePayload);
        if (bookMatch && settings.metaAccessToken && settings.facebookPageId) {
          // mark_seen + typing_on combo: forces Messenger to scroll to bottom immediately
          await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
          await sendTypingOn(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
          const [, encodedName, priceStr, ageMinStr, ageMaxStr] = bookMatch;
          const product: BookingProduct = {
            nameAr: decodeURIComponent(encodedName),
            price: parseInt(priceStr, 10),
            ageMin: parseAgeToYears(ageMinStr),
            ageMax: parseAgeToYears(ageMaxStr),
          };
          // Add to existing session or create new one
          const session: BookingSession = existingSession && (existingSession.stage === 'add_more' || existingSession.stage === 'adding_piece')
            ? existingSession
            : { stage: 'add_more', products: [], currentProductIdx: 0, currentPieceAgeIdx: 0, lang: customerLang };
          session.products.push(product);
          session.stage = 'add_more';
          bookingSessionMap.set(senderId, session);

          // Try to find and send the product image first, and save URL into session
          try {
            const [imgRow] = await db.select({
              publicImageUrl: inventoryTable.publicImageUrl,
              imageUrl: inventoryTable.imageUrl,
              productId: inventoryTable.productId,
            }).from(inventoryTable)
              .where(eq(inventoryTable.nameAr, product.nameAr))
              .limit(1);
            const rawImg = imgRow?.publicImageUrl || imgRow?.imageUrl || '';
            const imgUrl = ensureAbsoluteImageUrl(rawImg);
            // Save image URL + productId back into the session product
            const lastIdx = session.products.length - 1;
            if (lastIdx >= 0) {
              if (imgUrl) session.products[lastIdx].publicImageUrl = imgUrl;
              if (imgRow?.productId) session.products[lastIdx].productId = imgRow.productId;
            }
            bookingSessionMap.set(senderId, session);
            if (imgUrl) {
              await sendMetaImage(senderId, settings.facebookPageId, settings.metaAccessToken,
                imgUrl, platform, settings.instagramAccountId, settings.instagramAccessToken, settings.metaAppSecret);
              await new Promise(r => setTimeout(r, 400));
            }
          } catch { /* no image — skip */ }

          const priceK = product.price ? `${(product.price / 1000).toFixed(0)} ألف` : '';
          // Step 1: Ask how many pieces
          const qtyPrompt = customerLang === 'ku'
            ? `${priceK}\n\nچەند دانەی دەتەوێت؟ 🧮`
            : `${priceK ? priceK + '\n\n' : ''}عيني، جم قطعة تريدين؟ اختاري تحت 👇`;
          {
            // Single message + quick-reply buttons on all platforms
            const qtyQR = [1,2,3,4,5,6].map(n => ({
              content_type: 'text' as const,
              title: customerLang === 'ku' ? `${n} دانە` : `${n} قطعة`,
              payload: `BOOK_QTY_${n}`,
            }));
            await sendQR(qtyPrompt, qtyQR);
          }
          session.stage = 'pick_qty';
          bookingSessionMap.set(senderId, session);
          return;
        }

        // ── PRODUCTS_NEXT_PAGE: show next batch of products ──────────────────────
        if (effectivePayload === 'PRODUCTS_NEXT_PAGE' && settings.metaAccessToken && settings.facebookPageId) {
          const queue = senderProductQueueMap.get(senderId);
          if (queue && queue.batches.length > 0) {
            const nextBatch = queue.batches.shift()!;
            if (queue.batches.length === 0) senderProductQueueMap.delete(senderId);
            else senderProductQueueMap.set(senderId, queue);
            // Pass the next batch through sendMetaGenericTemplate (it handles both platforms)
            await sendMetaGenericTemplate(senderId, settings.facebookPageId!, settings.metaAccessToken!, nextBatch, platform, settings.metaAppSecret, settings.instagramAccountId, settings.instagramAccessToken);
          } else {
            await sendMsg('عيني ماكو موديلات ثانية 😊');
          }
          await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
          return;
        }

        // ── SHOW_AGE_CAROUSEL: change age ──
        if (effectivePayload === 'SHOW_AGE_CAROUSEL' && settings.metaAccessToken && settings.facebookPageId) {
          // Clear browsing age in all cases
          senderAgeMap.delete(senderId);
          senderAgeMaxMap.delete(senderId);

          // If there is an active booking session, reset ages on all pieces and go back to pick_age
          if (existingSession) {
            for (const p of existingSession.products) {
              p.pickedAgeMin = undefined;
              p.pickedAgeMax = undefined;
            }
            existingSession.currentPieceAgeIdx = 0;
            existingSession.stage = 'pick_age';
            bookingSessionMap.set(senderId, existingSession);
            const ageQRChange = STORE_AGE_RANGES.map(({ minY, maxY, label }) => ({
              content_type: 'text' as const,
              title: label.slice(0, 20),
              payload: `BOOK_AGE_${Math.round(minY * 12)}_${Math.round(maxY * 12)}`,
            }));
            await sendTypingOn(senderId, settings.facebookPageId!, settings.metaAccessToken!);
            await sendQR(existingSession.lang === 'ku' ? 'تەمەنی مناڵەکەت چەندە؟ 👶' : 'يا عمر تريد؟ 👶', ageQRChange);
            await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
            return;
          }

          // No booking session → full restart from season selection
          senderSeasonMap.delete(senderId);
          senderGenderMap.delete(senderId);
          bookingSessionMap.delete(senderId);
          pendingAgeSelectSet.add(senderId);
          const seasonElsBack = buildSeasonCarouselElements();
          await sendMsg('🧥 شنو الموسم؟');
          await new Promise(r => setTimeout(r, 350));
          await sendMetaGenericTemplate(senderId, settings.facebookPageId!, settings.metaAccessToken!, seasonElsBack, platform, settings.metaAppSecret, settings.instagramAccountId, settings.instagramAccessToken);
          await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
          return;
        }

        // ── BOOK_QTY_n: customer picked quantity during pick_qty stage ──────
        const bookQtyMatch = /^BOOK_QTY_(\d+)$/.exec(effectivePayload);
        if (bookQtyMatch && existingSession?.stage === 'pick_qty' && settings.metaAccessToken && settings.facebookPageId) {
          const qty = parseInt(bookQtyMatch[1], 10);
          const templateProduct = existingSession.products[existingSession.products.length - 1];
          for (let i = 1; i < qty; i++) {
            existingSession.products.push({ ...templateProduct, pickedAgeMin: undefined, pickedAgeMax: undefined, selectedSize: undefined });
          }
          existingSession.currentPieceAgeIdx = existingSession.products.length - qty;
          existingSession.sameAgeForAll = undefined;
          const qtyLabel = qty > 1
            ? (existingSession.lang === 'ku' ? `${qty} دانە ✅` : `${qty} قطعة ✅`)
            : '✅';

          // ── qty > 1: ask same-age or different-ages with quick reply buttons ──
          if (qty > 1) {
            existingSession.stage = 'age_type_q';
            bookingSessionMap.set(senderId, existingSession);
            const ageTypeQR = [
              { content_type: 'text' as const, title: existingSession.lang === 'ku' ? 'هەمان تەمەن ✅' : 'نفس العمر ✅', payload: 'BOOK_SAME_AGE' },
              { content_type: 'text' as const, title: existingSession.lang === 'ku' ? 'تەمەنی جیاواز 🔀' : 'أعمار مختلفة 🔀', payload: 'BOOK_DIFF_AGE' },
            ];
            const ageTypePrompt = existingSession.lang === 'ku'
              ? `${qtyLabel}\n\n🎀 هەمان تەمەن بۆ هەموو قەبارەکان یان تەمەنی جیاواز؟`
              : `${qtyLabel}\n\n🎀 نفس العمر للكل أو أعمار مختلفة؟`;
            await sendQR(ageTypePrompt, ageTypeQR);
            await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
            return;
          }

          // ── qty = 1: auto-skip if browsing age is already set ──
          existingSession.stage = 'pick_age';
          const browsingAgeMin1 = senderAgeMap.get(senderId);
          const browsingAgeMax1 = senderAgeMaxMap.get(senderId);
          if (browsingAgeMin1 !== undefined && browsingAgeMax1 !== undefined) {
            existingSession.products[existingSession.currentPieceAgeIdx].pickedAgeMin = browsingAgeMin1;
            existingSession.products[existingSession.currentPieceAgeIdx].pickedAgeMax = browsingAgeMax1;
            existingSession.currentPieceAgeIdx = existingSession.products.length;
            existingSession.stage = 'add_more';
            bookingSessionMap.set(senderId, existingSession);
            const addMoreQR2 = [
              { content_type: 'text' as const, title: existingSession.lang === 'ku' ? '➕ زیادکردن' : '➕ أضيفي موديل', payload: 'CAROUSEL_ADD_MORE' },
              { content_type: 'text' as const, title: existingSession.lang === 'ku' ? '✅ ئەوەی بس' : '✅ لا، هذا بس', payload: 'CAROUSEL_NO_MORE' },
            ];
            const addMoreConfirm1 = existingSession.lang === 'ku'
              ? `${qtyLabel}\n\nدەتەوێ موودێلێکی تر زیاد بکەیت؟`
              : `${qtyLabel}\n\nتريدين تضيفين موديل ثاني؟`;
            await sendQR(addMoreConfirm1, addMoreQR2);
            await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
            return;
          }
          bookingSessionMap.set(senderId, existingSession);
          const ageQR1 = STORE_AGE_RANGES.map(({ minY, maxY, label }) => ({
            content_type: 'text' as const,
            title: label.slice(0, 20),
            payload: `BOOK_AGE_${Math.round(minY * 12)}_${Math.round(maxY * 12)}`,
          }));
          await sendQR(`يا عمر تريد؟ 👶`, ageQR1);
          await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
          return;
        }

        // ── BOOK_SAME_AGE: all pieces get the same age ───────────────────────
        if (effectivePayload === 'BOOK_SAME_AGE' && existingSession?.stage === 'age_type_q' && settings.metaAccessToken && settings.facebookPageId) {
          const totalPcs = existingSession.products.length - existingSession.currentPieceAgeIdx;
          const qtyLabelSame = existingSession.lang === 'ku' ? `${totalPcs} دانە ✅` : `${totalPcs} قطعة ✅`;
          const browsingAgeMinS = senderAgeMap.get(senderId);
          const browsingAgeMaxS = senderAgeMaxMap.get(senderId);
          if (browsingAgeMinS !== undefined && browsingAgeMaxS !== undefined) {
            // Auto-apply browsing age to all pieces
            for (let i = existingSession.currentPieceAgeIdx; i < existingSession.products.length; i++) {
              existingSession.products[i].pickedAgeMin = browsingAgeMinS;
              existingSession.products[i].pickedAgeMax = browsingAgeMaxS;
            }
            existingSession.currentPieceAgeIdx = existingSession.products.length;
            existingSession.stage = 'add_more';
            bookingSessionMap.set(senderId, existingSession);
            const addMoreQRS = [
              { content_type: 'text' as const, title: existingSession.lang === 'ku' ? '➕ زیادکردن' : '➕ أضيفي موديل', payload: 'CAROUSEL_ADD_MORE' },
              { content_type: 'text' as const, title: existingSession.lang === 'ku' ? '✅ ئەوەی بس' : '✅ لا، هذا بس', payload: 'CAROUSEL_NO_MORE' },
            ];
            const addMoreConfirmS = existingSession.lang === 'ku'
              ? `${qtyLabelSame}\n\nدەتەوێ موودێلێکی تر زیاد بکەیت؟`
              : `${qtyLabelSame}\n\nتريدين تضيفين موديل ثاني؟`;
            await sendQR(addMoreConfirmS, addMoreQRS);
            await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
            return;
          }
          // No browsing age → ask once and apply to all
          existingSession.sameAgeForAll = true;
          existingSession.stage = 'pick_age';
          bookingSessionMap.set(senderId, existingSession);
          const ageQRS = STORE_AGE_RANGES.map(({ minY, maxY, label }) => ({
            content_type: 'text' as const,
            title: label.slice(0, 20),
            payload: `BOOK_AGE_${Math.round(minY * 12)}_${Math.round(maxY * 12)}`,
          }));
          await sendQR(`${qtyLabelSame}\n\n👶 يا عمر تريد للكل؟`, ageQRS);
          await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
          return;
        }

        // ── BOOK_DIFF_AGE: each piece gets its own age ───────────────────────
        if (effectivePayload === 'BOOK_DIFF_AGE' && existingSession?.stage === 'age_type_q' && settings.metaAccessToken && settings.facebookPageId) {
          existingSession.sameAgeForAll = false;
          existingSession.stage = 'pick_age';
          bookingSessionMap.set(senderId, existingSession);
          const firstPieceNum = existingSession.currentPieceAgeIdx + 1;
          const totalPiecesD = existingSession.products.length;
          const ageQRD = STORE_AGE_RANGES.map(({ minY, maxY, label }) => ({
            content_type: 'text' as const,
            title: label.slice(0, 20),
            payload: `BOOK_AGE_${Math.round(minY * 12)}_${Math.round(maxY * 12)}`,
          }));
          const diffPrompt = existingSession.lang === 'ku'
            ? `قطعەی ${firstPieceNum}ەم (${firstPieceNum}/${totalPiecesD}) — تەمەنی مناڵەکەت چەندە؟ 👶`
            : `${arabicOrdinal(firstPieceNum)} قطعة — اشقد عمر؟ 👶`;
          await sendQR(diffPrompt, ageQRD);
          await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
          return;
        }

        // ── BOOK_AGE_*: customer picked age range during pick_age stage ─────
        const bookAgeMatch = /^BOOK_AGE_(\d+)_(\d+)$/.exec(effectivePayload);
        if (bookAgeMatch && existingSession?.stage === 'pick_age' && settings.metaAccessToken && settings.facebookPageId) {
          const pickedMin = parseInt(bookAgeMatch[1], 10) / 12;
          const pickedMax = parseInt(bookAgeMatch[2], 10) / 12;
          const currentIdx = existingSession.currentPieceAgeIdx;

          // ── sameAgeForAll mode: apply this age to all remaining pieces at once ──
          if (existingSession.sameAgeForAll) {
            for (let i = currentIdx; i < existingSession.products.length; i++) {
              existingSession.products[i].pickedAgeMin = pickedMin;
              existingSession.products[i].pickedAgeMax = pickedMax;
            }
            existingSession.currentPieceAgeIdx = existingSession.products.length;
            existingSession.stage = 'add_more';
            bookingSessionMap.set(senderId, existingSession);
            const addMoreQRSame = [
              { content_type: 'text' as const, title: existingSession.lang === 'ku' ? '➕ زیادکردن' : '➕ أضيفي موديل', payload: 'CAROUSEL_ADD_MORE' },
              { content_type: 'text' as const, title: existingSession.lang === 'ku' ? '✅ ئەوەی بس' : '✅ لا، هذا بس', payload: 'CAROUSEL_NO_MORE' },
            ];
            const confirmSame = existingSession.lang === 'ku'
              ? 'دەتەوێ موودێلێکی تر زیاد بکەیت؟'
              : 'تريدين تضيفين موديل ثاني؟';
            await sendQR(confirmSame, addMoreQRSame);
            await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
            return;
          }

          // ── per-piece mode: save age for this piece only ──
          if (currentIdx < existingSession.products.length) {
            existingSession.products[currentIdx].pickedAgeMin = pickedMin;
            existingSession.products[currentIdx].pickedAgeMax = pickedMax;
          }
          existingSession.currentPieceAgeIdx = currentIdx + 1;
          bookingSessionMap.set(senderId, existingSession);

          // Check if more pieces still need age selection
          if (existingSession.currentPieceAgeIdx < existingSession.products.length) {
            const nextPieceNum = existingSession.currentPieceAgeIdx + 1;
            const totalPieces = existingSession.products.length;
            const nextAgeQR = STORE_AGE_RANGES.map(({ minY, maxY, label }) => ({
              content_type: 'text' as const,
              title: label.slice(0, 20),
              payload: `BOOK_AGE_${Math.round(minY * 12)}_${Math.round(maxY * 12)}`,
            }));
            const nextAgePrompt = existingSession.lang === 'ku'
              ? `قطعەی ${nextPieceNum}ەم (${nextPieceNum}/${totalPieces}) — تەمەنی مناڵەکەت چەندە؟ 👶`
              : `${arabicOrdinal(nextPieceNum)} قطعة — اشقد عمر؟ 👶`;
            await sendQR(nextAgePrompt, nextAgeQR);
            await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
            return;
          }

          // All pieces have ages → ask to add another model
          existingSession.stage = 'add_more';
          bookingSessionMap.set(senderId, existingSession);
          const addMoreQR = [
            { content_type: 'text' as const, title: existingSession.lang === 'ku' ? '➕ زیادکردن' : '➕ أضيفي موديل', payload: 'CAROUSEL_ADD_MORE' },
            { content_type: 'text' as const, title: existingSession.lang === 'ku' ? '✅ ئەوەی بس' : '✅ لا، هذا بس', payload: 'CAROUSEL_NO_MORE' },
          ];
          const confirmText = existingSession.lang === 'ku'
            ? 'دەتەوێ موودێلێکی تر زیاد بکەیت؟'
            : 'تريدين تضيفين موديل ثاني؟';
          await sendQR(confirmText, addMoreQR);
          await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
          return;
        }

        // ── CAROUSEL_ADD_MORE: show product carousel (no menu/faq) ──────────
        if (effectivePayload === 'CAROUSEL_ADD_MORE' && existingSession && settings.metaAccessToken && settings.facebookPageId) {
          // Restart full flow: Season → Gender → Age → Products
          existingSession.stage = 'adding_piece';
          bookingSessionMap.set(senderId, existingSession);
          const seasonEls = buildSeasonCarouselElements();
          const seasonQ = existingSession.lang === 'ku' ? 'کەی موسم دەتەوێ؟ 🧥' : 'يا موسم تريد؟ 🧥';
          await sendMsg(seasonQ);
          await new Promise(r => setTimeout(r, 300));
          await sendMetaGenericTemplate(senderId, settings.facebookPageId!, settings.metaAccessToken!, seasonEls, platform, settings.metaAppSecret, settings.instagramAccountId, settings.instagramAccessToken);
          return;
        }

        // ── CAROUSEL_NO_MORE: auto-derive size from picked age → skip pick_size ─
        if (effectivePayload === 'CAROUSEL_NO_MORE' && existingSession && settings.metaAccessToken && settings.facebookPageId) {
          // Auto-set selectedSize for every piece from the age already chosen in pick_age
          for (const prod of existingSession.products) {
            const sMin = prod.pickedAgeMin ?? prod.ageMin;
            const sMax = prod.pickedAgeMax ?? prod.ageMax;
            prod.selectedSize = ageToSizeLabel(sMin, sMax, existingSession.lang);
          }
          existingSession.currentProductIdx = existingSession.products.length;

          if (existingSession.addingToExisting && existingSession.dbBookingId) {
            // Adding to existing booking: update DB and skip province/phone/address
            const allItems = existingSession.products.map((p: any) => ({
              code: p.productId ?? undefined,
              name: p.nameAr ?? 'منتج',
              quantity: p.quantity ?? 1,
              unitPrice: Number(p.price ?? 0),
              totalPrice: (p.quantity ?? 1) * Number(p.price ?? 0),
              imageUrl: p.publicImageUrl ?? undefined,
              size: p.selectedSize ?? undefined,
              ageMin: p.pickedAgeMin ?? p.ageMin ?? undefined,
              ageMax: p.pickedAgeMax ?? p.ageMax ?? undefined,
            }));
            const newTotal = allItems.reduce((s: number, it: any) => s + (it.totalPrice ?? 0), 0);
            const deliveryCostNum = existingSession.deliveryCost ?? 0;
            const grandTotalNum = newTotal + deliveryCostNum;
            await db.update(bookingsTable).set({
              items: allItems,
              totalAmount: grandTotalNum > 0 ? String(grandTotalNum) : null,
            }).where(eq(bookingsTable.id, existingSession.dbBookingId)).catch(() => {});
            existingSession.addingToExisting = false;
            existingSession.stage = 'complete';
            bookingSessionMap.set(senderId, existingSession);
            const addDoneMsg = existingSession.lang === 'ku'
              ? 'تمام عیني، زیادکراوە بۆ داواکاریەکەت ✅'
              : 'تمام عيني، تمت الإضافة لطلبيتج ✅';
            await sendMsg(addDoneMsg);
            await new Promise(r => setTimeout(r, 500));
            const addTok = existingSession.receiptToken;
            if (addTok) {
              const baseDomainA2 = (process.env.LOCAL_DOMAIN || 'localhost:3000').split(',')[0]?.trim() || 'sonbola.shop';
              const addImageUrl2 = `https://${baseDomainA2}/api/public/receipt/${addTok}/image?added=1`;
              await sendMetaImage(senderId, settings.facebookPageId!, settings.metaAccessToken!, addImageUrl2, platform, settings.instagramAccountId, settings.instagramAccessToken, settings.metaAppSecret).catch(() => {});
              if (settings.telegramBotToken && settings.telegramChatId) {
                const addOrderNum2 = existingSession.dbBookingId ? existingSession.dbBookingId + ORDER_OFFSET : '—';
                const addTgMsg2 = `➕ <b>إضافة على طلبية #${addOrderNum2}</b>\n\n👤 المستخدم: <code>${senderId}</code>\n⚠️ الزبون أضاف قطعة للطلبية`;
                await sendTelegramNotification(settings.telegramBotToken, settings.telegramChatId, addTgMsg2, []).catch(() => {});
                await sendTelegramPhoto(settings.telegramBotToken, settings.telegramChatId, addImageUrl2, `➕ إضافة لطلب #${addOrderNum2}`).catch(() => {});
              }
            }
            await new Promise(r => setTimeout(r, 400));
            const postCardsAdd2 = buildPostBookingCarousel(existingSession.lang);
            await sendMetaGenericTemplate(senderId, settings.facebookPageId!, settings.metaAccessToken!, postCardsAdd2, platform, settings.metaAppSecret, settings.instagramAccountId, settings.instagramAccessToken);
          } else {
            // New booking → go straight to province
            existingSession.stage = 'province';
            bookingSessionMap.set(senderId, existingSession);
            const provPrompt = existingSession.lang === 'ku'
              ? '🏙️ پارێزگاکەت یان ناوچەکەت هەڵبژێرە:'
              : '🏙️ اختر المحافظة أو المنطقة';
            await sendMsg(provPrompt);
            await new Promise(r => setTimeout(r, 400));
            const provElements = buildProvinceCarouselElements((settings as any).deliveryFees, existingSession.lang);
            if (provElements.length >= 1) {
              await sendMetaGenericTemplate(senderId, settings.facebookPageId!, settings.metaAccessToken!, provElements, platform, settings.metaAppSecret, settings.instagramAccountId, settings.instagramAccessToken);
            } else {
              const provQR = buildProvinceQuickReplies((settings as any).deliveryFees, existingSession.lang);
              if (provQR.length > 0) await sendQR('اختاري:', provQR);
            }
          }
          return;
        }

        // ── CAROUSEL_SIZE_*: store size and advance ──────────────────────────
        if (effectivePayload.startsWith('CAROUSEL_SIZE_') && existingSession?.stage === 'pick_size' && settings.metaAccessToken && settings.facebookPageId) {
          // Normalize typed hyphen → en-dash to match generated size labels
          const rawSize = effectivePayload.replace('CAROUSEL_SIZE_', '');
          const size = rawSize.replace(/-/g, '–').trim();
          existingSession.products[existingSession.currentProductIdx].selectedSize = size;
          existingSession.currentProductIdx++;

          if (existingSession.currentProductIdx < existingSession.products.length) {
            const nextProd = existingSession.products[existingSession.currentProductIdx];
            // Use the customer's selected age for this piece, fallback to product DB range
            const nextSizeAgeMin = nextProd.pickedAgeMin ?? nextProd.ageMin;
            const nextSizeAgeMax = nextProd.pickedAgeMax ?? nextProd.ageMax;
            const sizeQR = buildSizeQuickReplies(nextSizeAgeMin, nextSizeAgeMax, existingSession.lang);
            const totalPieces = existingSession.products.length;
            const pieceNum = existingSession.currentProductIdx + 1;
            const sizePrompt = totalPieces > 1
              ? (existingSession.lang === 'ku'
                ? `قطعەی ${ordinalKu(pieceNum)} (${nextProd.nameAr}) — قەبارە هەڵبژێرە 👇`
                : `القطعة ${ordinalAr(pieceNum)} (${nextProd.nameAr}) — اختاري الحجم 👇`)
              : (existingSession.lang === 'ku'
                ? `بۆ موودێل ${nextProd.nameAr} — قەبارە هەڵبژێرە 👇`
                : `لموديل ${nextProd.nameAr} — اختاري الحجم 👇`);
            await sendQR(sizePrompt, sizeQR);
          } else if (existingSession.addingToExisting && existingSession.dbBookingId) {
            // ── Adding to existing booking: skip province/phone/address ────
            const allItems = existingSession.products.map((p: any) => ({
              code: p.productId ?? undefined,
              name: p.nameAr ?? 'منتج',
              quantity: p.quantity ?? 1,
              unitPrice: Number(p.price ?? 0),
              totalPrice: (p.quantity ?? 1) * Number(p.price ?? 0),
              imageUrl: p.publicImageUrl ?? undefined,
              size: p.selectedSize ?? undefined,
              ageMin: p.pickedAgeMin ?? p.ageMin ?? undefined,
              ageMax: p.pickedAgeMax ?? p.ageMax ?? undefined,
            }));
            const newTotal = allItems.reduce((s: number, it: any) => s + (it.totalPrice ?? 0), 0);
            const deliveryCostNum = existingSession.deliveryCost ?? 0;
            const grandTotalNum = newTotal + deliveryCostNum;
            // Update booking in DB with merged items
            await db.update(bookingsTable).set({
              items: allItems,
              totalAmount: grandTotalNum > 0 ? String(grandTotalNum) : null,
            }).where(eq(bookingsTable.id, existingSession.dbBookingId)).catch(() => {});
            existingSession.addingToExisting = false;
            existingSession.stage = 'complete';
            bookingSessionMap.set(senderId, existingSession);
            const addDoneMsg = existingSession.lang === 'ku'
              ? 'تمام عیني، زیادکراوە بۆ داواکاریەکەت ✅'
              : 'تمام عيني، تمت الإضافة لطلبيتج ✅';
            await sendMsg(addDoneMsg);
            await new Promise(r => setTimeout(r, 500));
            // Resend updated receipt image to customer
            const addTok = existingSession.receiptToken;
            if (addTok) {
              const baseDomainA = (process.env.LOCAL_DOMAIN || 'localhost:3000').split(',')[0]?.trim() || 'sonbola.shop';
              const addImageUrl = `https://${baseDomainA}/api/public/receipt/${addTok}/image?added=1`;
              // Send "إضافة" overlay image to customer
              await sendMetaImage(senderId, settings.facebookPageId!, settings.metaAccessToken!, addImageUrl, platform, settings.instagramAccountId, settings.instagramAccessToken, settings.metaAppSecret).catch(() => {});
              // Notify Telegram: text + "إضافة" overlay receipt image
              if (settings.telegramBotToken && settings.telegramChatId) {
                const addOrderNum = existingSession.dbBookingId ? existingSession.dbBookingId + ORDER_OFFSET : '—';
                const addTgMsg = `➕ <b>إضافة على طلبية #${addOrderNum}</b>\n\n👤 المستخدم: <code>${senderId}</code>\n⚠️ الزبون أضاف قطعة للطلبية`;
                await sendTelegramNotification(settings.telegramBotToken, settings.telegramChatId, addTgMsg, []).catch(() => {});
                await sendTelegramPhoto(settings.telegramBotToken, settings.telegramChatId, addImageUrl, `➕ إضافة لطلب #${addOrderNum}`).catch(() => {});
              }
            }
            await new Promise(r => setTimeout(r, 400));
            const postCardsAdd = buildPostBookingCarousel(existingSession.lang);
            await sendMetaGenericTemplate(senderId, settings.facebookPageId!, settings.metaAccessToken!, postCardsAdd, platform, settings.metaAppSecret, settings.instagramAccountId, settings.instagramAccessToken);
          } else {
            // All sizes selected → ask for province/region as carousel cards
            existingSession.stage = 'province';
            const provPrompt = existingSession.lang === 'ku'
              ? '🏙️ پارێزگاکەت یان ناوچەکەت هەڵبژێرە:'
              : '🏙️ اختر المحافظة أو المنطقة';
            await sendMsg(provPrompt);
            await new Promise(r => setTimeout(r, 400));
            const provElements = buildProvinceCarouselElements((settings as any).deliveryFees, existingSession.lang);
            if (provElements.length >= 1) {
              await sendMetaGenericTemplate(senderId, settings.facebookPageId!, settings.metaAccessToken!, provElements, platform, settings.metaAppSecret, settings.instagramAccountId, settings.instagramAccessToken);
            } else {
              // Fallback: quick replies if no groups configured
              const provQR = buildProvinceQuickReplies((settings as any).deliveryFees, existingSession.lang);
              if (provQR.length > 0) await sendQR('اختاري:', provQR);
            }
          }
          bookingSessionMap.set(senderId, existingSession);
          return;
        }

        // ── Province input (PROVINCE_GRP:key payload or typed text) ────────
        const provinceFromPayload = effectivePayload.startsWith('PROVINCE_')
          ? effectivePayload.replace('PROVINCE_', '')
          : null;

        // ── province_sub: individual province selected within a group ─────────
        const isProvinceSubStage = existingSession?.stage === 'province_sub' && settings.metaAccessToken && settings.facebookPageId;
        if (isProvinceSubStage && provinceFromPayload?.startsWith('NAME:')) {
          const provName = provinceFromPayload.replace('NAME:', '');
          const grpKey = existingSession!.selectedGroup ?? 'rest';
          const groups = extractGroupsFromFees((settings as any).deliveryFees);
          const grp = groups.find(g => g.key === grpKey);
          existingSession!.province = provName;
          existingSession!.deliveryCost = grp?.fee;
          existingSession!.deliveryDays = grp?.days ?? '';
          existingSession!.stage = 'phone';
          bookingSessionMap.set(senderId, existingSession!);
          await sendMsg(buildProvinceConfirmMsg(provName, grp?.fee, grp?.days ?? '', existingSession!.lang));
          return;
        }

        // ── province: group card tapped → route to sub-provinces or confirm ──
        const isProvinceStage = existingSession?.stage === 'province' && settings.metaAccessToken && settings.facebookPageId;

        // ── Province stage: detect price-only inquiry (don't treat as province name) ──
        if (isProvinceStage && !isPostback && !provinceFromPayload && messageText.trim()) {
          const priceLookupNorm = normalizeArabic(messageText.trim().toLowerCase());
          const PRICE_KEYWORDS = ['سعر', 'ثمن', 'كم', 'بكم', 'اعرف', 'أعرف', 'فقط', 'بس', 'ماكو', 'لا حجز', 'مو حجز', 'دون حجز', 'بدون حجز'];
          const isPriceInquiry = PRICE_KEYWORDS.some(kw => priceLookupNorm.includes(normalizeArabic(kw)));
          if (isPriceInquiry) {
            const pLang = existingSession!.lang ?? 'ar';
            const priceMsg = pLang === 'ku'
              ? 'عیني نرخەکەت لە سەرەوە نووسیمانە شوفی لو سمحت 🌸\n\nئەگەر دەتەوێت داواکاری تۆمار بکەیت، پارێزگاکەت هەڵبژێرە 👇'
              : 'عيني كتبنالج السعر فوق شوفي لو سمحت 🌸\n\nإذا أردتِ الحجز، اختاري المحافظة أو المنطقة 👇';
            await sendMsg(priceMsg);
            await new Promise(r => setTimeout(r, 400));
            const provElsReask = buildProvinceCarouselElements((settings as any).deliveryFees, pLang);
            if (provElsReask.length >= 1) {
              await sendMetaGenericTemplate(senderId, settings.facebookPageId!, settings.metaAccessToken!, provElsReask, platform, settings.metaAppSecret, settings.instagramAccountId, settings.instagramAccessToken);
            }
            await markMetaSeen(senderId, settings.facebookPageId!, settings.metaAccessToken!).catch(() => {});
            return;
          }
        }

        if (isProvinceStage && (provinceFromPayload || (!isPostback && messageText.trim()))) {
          let resolvedLabel: string;
          let resolvedCost: number | undefined;
          let resolvedDays: string = '';

          if (provinceFromPayload?.startsWith('GRP:')) {
            const grpKey = provinceFromPayload.replace('GRP:', '');
            const groups = extractGroupsFromFees((settings as any).deliveryFees);
            const grp = groups.find(g => g.key === grpKey);

            // زاخو: single city → go straight to phone
            if (grpKey === 'zakho') {
              existingSession!.province = grp?.label ?? 'زاخو';
              existingSession!.deliveryCost = grp?.fee;
              existingSession!.deliveryDays = grp?.days ?? '';
              existingSession!.stage = 'phone';
              bookingSessionMap.set(senderId, existingSession!);
              await sendMsg(buildProvinceConfirmMsg(grp?.label ?? 'زاخو', grp?.fee, grp?.days ?? '', existingSession!.lang));
              return;
            }

            // Multi-province group → show sub-province carousel
            if (grp) {
              existingSession!.selectedGroup = grpKey;
              existingSession!.stage = 'province_sub';
              bookingSessionMap.set(senderId, existingSession!);
              const selectPrompt = existingSession!.lang === 'ku'
                ? `📍 پارێزگاکەت هەڵبژێرە:`
                : `📍 حددي المحافظة لو سمحت`;
              await sendMsg(selectPrompt);
              await new Promise(r => setTimeout(r, 350));
              const subProvs = extractProvincesForGroup((settings as any).deliveryFees, grpKey);
              const subElements = buildSubProvinceCarouselElements(subProvs, grp, existingSession!.lang);
              if (subElements.length >= 1) {
                await sendMetaGenericTemplate(senderId, settings.facebookPageId!, settings.metaAccessToken!, subElements, platform, settings.metaAppSecret, settings.instagramAccountId, settings.instagramAccessToken);
              }
              return;
            }
          }

          // Typed text fallback
          const typed = (provinceFromPayload && !provinceFromPayload.startsWith('GRP:'))
            ? provinceFromPayload
            : detectProvinceInText(messageText.trim()) || messageText.trim();
          resolvedLabel = typed;
          const feesMap = parseDeliveryFeesMap((settings as any).deliveryFees);
          resolvedCost = getShippingCost(typed, feesMap) ?? undefined;

          existingSession!.province = resolvedLabel;
          existingSession!.deliveryCost = resolvedCost;
          existingSession!.deliveryDays = resolvedDays;
          existingSession!.stage = 'phone';
          bookingSessionMap.set(senderId, existingSession!);
          await sendMsg(buildProvinceConfirmMsg(resolvedLabel, resolvedCost, resolvedDays, existingSession!.lang));
          return;
        }

        // ── Phone input ──────────────────────────────────────────────────────
        if (existingSession?.stage === 'phone' && messageText.trim() && !isPostback && settings.metaAccessToken && settings.facebookPageId) {
          const phoneRaw = messageText.trim().replace(/\s/g, '');
          const phoneValid = /^(\+9647|07)\d{9}$/.test(phoneRaw) || /^\d{10,13}$/.test(phoneRaw);
          if (!phoneValid) {
            const retry = existingSession.lang === 'ku'
              ? '❌ ژمارەکە دروست نییە. تکایە دووبارە بنووسە (مێنمونە: 07xxxxxxxxx):'
              : '❌ الرقم غير صحيح. اكتبيه مرة أخرى (مثال: 07xxxxxxxxx):';
            await sendMsg(retry);
            return;
          }
          existingSession.phone = phoneRaw;
          existingSession.stage = 'address';
          bookingSessionMap.set(senderId, existingSession);
          const addrPrompt = existingSession.lang === 'ku'
            ? '📍 ناوی گەڕەک یان ناوچە و نزیکترین خاڵی ناسراو بنووسە (دوکان، مزگەوت، رێستۆران...)'
            : '📍 لو سمحت اسم الحي أو المنطقة، وأقرب نقطة دالة (محل، مسجد، مطعم معروف...)';
          await sendMsg(addrPrompt);
          return;
        }

        // ── Address input (combined address + landmark in one message) ──────
        if (existingSession?.stage === 'address' && messageText.trim() && !isPostback && settings.metaAccessToken && settings.facebookPageId) {
          existingSession.address = messageText.trim();
          existingSession.landmark = messageText.trim(); // same combined response
          existingSession.stage = 'complete';
          bookingSessionMap.set(senderId, existingSession);

          // ── 1) Save carousel booking to DB first (to get ID + order number) ─
          let receiptUrl: string | null = null;
          try {
            const sessionProducts = existingSession.products ?? [];
            const sessionItems = sessionProducts.map((p: any) => ({
              code: p.productId ?? undefined,
              name: p.nameAr ?? 'منتج',
              quantity: p.quantity ?? 1,
              unitPrice: Number(p.price ?? 0),
              totalPrice: (p.quantity ?? 1) * Number(p.price ?? 0),
              imageUrl: p.publicImageUrl ?? undefined,
              size: p.selectedSize ?? undefined,
              ageMin: p.pickedAgeMin ?? p.ageMin ?? undefined,
              ageMax: p.pickedAgeMax ?? p.ageMax ?? undefined,
            }));
            const sessionTotal = sessionItems.reduce((s: number, it: any) => s + (it.totalPrice ?? 0), 0);
            const receiptTok = Math.random().toString(36).slice(2, 10);
            const [insertedCarousel] = await db.insert(bookingsTable).values({
              platform,
              senderId,
              senderName: null,
              phoneNumber: existingSession.phone ?? 'غير معروف',
              governorate: existingSession.province ?? 'غير محدد',
              fullAddress: existingSession.address ?? 'غير محدد',
              items: sessionItems,
              status: 'pending',
              starred: true,
              totalAmount: sessionTotal > 0 ? String(sessionTotal) : null,
              receiptToken: receiptTok,
              deliveryCost: existingSession.deliveryCost != null ? String(existingSession.deliveryCost) : null,
            }).returning({ id: bookingsTable.id });

            if (insertedCarousel?.id) {
              existingSession.dbBookingId = insertedCarousel.id;
              existingSession.receiptToken = receiptTok;
              bookingSessionMap.set(senderId, existingSession);
              const baseDomain = (process.env.LOCAL_DOMAIN || 'localhost:3000').split(',')[0]?.trim() || 'sonbola.shop';
              receiptUrl = `https://${baseDomain}/receipt/${receiptTok}`;
              const orderNum = insertedCarousel.id + ORDER_OFFSET;
              const platformLabel = platform === 'instagram' ? 'انستقرام 📷' : 'فيسبوك 📘';

              // ── 2) Notify Telegram: profile pic + text invoice + receipt image ─
              if (settings.telegramBotToken && settings.telegramChatId) {
                // Fetch customer's FB profile (name + photo)
                const fbProfile = settings.metaAccessToken
                  ? await fetchFbUserProfile(senderId, settings.metaAccessToken).catch(() => ({ name: null, profilePicUrl: null }))
                  : { name: null, profilePicUrl: null };

                // Send customer profile picture with name caption + Business Suite link button
                if (fbProfile.profilePicUrl) {
                  const profileCaption = fbProfile.name
                    ? `👤 <b>${fbProfile.name}</b>\n🆔 PSID: <code>${senderId}</code>\n${platformLabel}`
                    : `👤 PSID: <code>${senderId}</code>\n${platformLabel}`;
                  const bsUrl = `https://business.facebook.com/latest/inbox/messenger?selected_item_id=${senderId}`;
                  const profileButtons = [[{ text: '💬 فتح المحادثة في Business Suite', url: bsUrl }]];
                  await sendTelegramPhoto(settings.telegramBotToken, settings.telegramChatId, fbProfile.profilePicUrl, profileCaption, profileButtons).catch(() => {});
                }

                // Send text invoice
                const invoice = formatBookingInvoice(existingSession, senderId, orderNum);
                const customerLine = fbProfile.name ? `👤 الزبون: <b>${fbProfile.name}</b>\n` : '';
                const telegramMsg = `${customerLine}${invoice}\n\n🔖 المنصة: ${platformLabel}\n🧾 وصلة الإيصال: ${receiptUrl}`;
                await sendTelegramNotification(settings.telegramBotToken, settings.telegramChatId, telegramMsg, []).catch(() => {});

                // Send the receipt image
                const receiptImageUrl = `https://${baseDomain}/api/public/receipt/${receiptTok}/image`;
                await sendTelegramPhoto(settings.telegramBotToken, settings.telegramChatId, receiptImageUrl, `📦 طلب #${orderNum}`).catch(() => {});
              }
            }
          } catch (dbErr: any) {
            console.error('[CAROUSEL_BOOKING] DB insert failed:', dbErr?.message);
            // Fallback: still send Telegram without order number
            if (settings.telegramBotToken && settings.telegramChatId) {
              const invoice = formatBookingInvoice(existingSession, senderId);
              await sendTelegramNotification(settings.telegramBotToken, settings.telegramChatId, invoice, []).catch(() => {});
            }
          }

          // ── 3) Send receipt text to customer ────────────────────────────────
          const receipt = formatCustomerReceipt(existingSession);
          await sendMsg(receipt);
          await new Promise(r => setTimeout(r, 600));

          // ── 4) Send receipt as IMAGE to customer ─────────────────────────────
          if (receiptUrl && settings.facebookPageId && settings.metaAccessToken) {
            // Derive the image URL from the receipt token
            const receiptTokFinal = receiptUrl.split('/receipt/')[1] ?? '';
            if (receiptTokFinal) {
              const baseDomain2 = (process.env.LOCAL_DOMAIN || 'localhost:3000').split(',')[0]?.trim() || 'sonbola.shop';
              const imageUrl = `https://${baseDomain2}/api/public/receipt/${receiptTokFinal}/image`;
              await sendMetaImage(senderId, settings.facebookPageId, settings.metaAccessToken, imageUrl, platform, settings.instagramAccountId, settings.instagramAccessToken, settings.metaAppSecret).catch(() => {
                // fallback: send as text link if image fails
                sendMsg(`🧾 ${receiptUrl}`);
              });
              await new Promise(r => setTimeout(r, 400));
            }
          }
          const infoMsg = existingSession.lang === 'ku'
            ? 'عیني، ئێستا داواکاری تۆمار کرا، ئەم نامەیەمان بۆ کارمەندی مەخزەن ناردووە 📦'
            : 'عيني، الآن تم الحجز، رح ادز هاي الرسالة لموظف المخزن 📦';
          await sendMsg(infoMsg);
          await new Promise(r => setTimeout(r, 500));
          const postCardsEnd = buildPostBookingCarousel(existingSession.lang);
          await sendMetaGenericTemplate(senderId, settings.facebookPageId!, settings.metaAccessToken!, postCardsEnd, platform, settings.metaAppSecret, settings.instagramAccountId, settings.instagramAccessToken);
          return;
        }

        // ── Correction flow ──────────────────────────────────────────────────
        const correctionKeywords = ['صحح', 'تصحيح', 'غلط', 'خطأ', 'خطا', 'عدل', 'تعديل', 'بدل', 'تبديل', 'گۆڕان', 'هەڵە'];
        const isCorrectionRequest = correctionKeywords.some(k => messageText.includes(k));
        if (isCorrectionRequest && existingSession?.stage === 'complete' && settings.metaAccessToken && settings.facebookPageId) {
          const fixQR = [
            { content_type: 'text' as const, title: customerLang === 'ku' ? '📱 ژمارە' : '📱 الرقم', payload: 'CAROUSEL_FIX_PHONE' },
            { content_type: 'text' as const, title: customerLang === 'ku' ? '📍 ناونیشان' : '📍 العنوان', payload: 'CAROUSEL_FIX_ADDRESS' },
          ];
          const fixPrompt = customerLang === 'ku' ? 'چی دەتەوێ گۆڕبێت؟' : 'ماذا تريدين تصحيح؟';
          await sendQR(fixPrompt, fixQR);
          return;
        }
        if (effectivePayload === 'CAROUSEL_FIX_PHONE' && existingSession && settings.metaAccessToken && settings.facebookPageId) {
          existingSession.stage = 'phone';
          bookingSessionMap.set(senderId, existingSession);
          await sendMsg(customerLang === 'ku' ? '📱 ژمارەی نوێت بنووسە:' : '📱 اكتبي الرقم الجديد:');
          return;
        }
        if (effectivePayload === 'CAROUSEL_FIX_ADDRESS' && existingSession && settings.metaAccessToken && settings.facebookPageId) {
          existingSession.stage = 'address';
          bookingSessionMap.set(senderId, existingSession);
          await sendMsg(customerLang === 'ku' ? '📍 ناونیشانی نوێت بنووسە:' : '📍 اكتبي العنوان الجديد:');
          return;
        }
        // Re-send invoice after correction is applied (phone/address stage completes again)
        if (existingSession?.stage === 'complete' && existingSession.phone && existingSession.address && !isPostback && messageText.trim() && settings.metaAccessToken && settings.facebookPageId) {
          if (settings.telegramBotToken && settings.telegramChatId) {
            const editOrderNum = existingSession.dbBookingId ? existingSession.dbBookingId + ORDER_OFFSET : undefined;
            const invoice = formatBookingInvoice(existingSession, senderId, editOrderNum);
            await sendTelegramNotification(settings.telegramBotToken, settings.telegramChatId,
              `🔄 <b>تعديل على طلب</b>\n\n${invoice}`, []).catch(() => {});
          }
          await sendMsg(customerLang === 'ku' ? '✅ گۆڕانکاری تۆمار کرا!' : '✅ تم التعديل!');
          return;
        }

        // ── Booking stage recovery: re-show the right prompt if user sends anything mid-booking ──
        if (existingSession && settings.metaAccessToken && settings.facebookPageId) {
          const recStage = existingSession.stage;
          const recLang = existingSession.lang ?? 'ar';

          if (recStage === 'add_more') {
            const addMoreQRRec = [
              { content_type: 'text' as const, title: recLang === 'ku' ? '➕ زیادکردن' : '➕ أضيفي موديل', payload: 'CAROUSEL_ADD_MORE' },
              { content_type: 'text' as const, title: recLang === 'ku' ? '✅ ئەوەی بس' : '✅ لا، هذا بس', payload: 'CAROUSEL_NO_MORE' },
            ];
            await sendQR(recLang === 'ku' ? 'دەتەوێت موودێلێکی تر زیاد بکەیت؟' : 'تريدين تضيفين موديل ثاني؟', addMoreQRRec);
            await markMetaSeen(senderId, settings.facebookPageId!, settings.metaAccessToken!).catch(() => {});
            return;
          }

          if (recStage === 'adding_piece') {
            const seasonElsRec = buildSeasonCarouselElements();
            await sendMsg(recLang === 'ku' ? 'کەی موسم دەتەوێ؟ 🧥' : 'يا موسم تريد؟ 🧥');
            await new Promise(r => setTimeout(r, 300));
            await sendMetaGenericTemplate(senderId, settings.facebookPageId!, settings.metaAccessToken!, seasonElsRec, platform, settings.metaAppSecret, settings.instagramAccountId, settings.instagramAccessToken);
            await markMetaSeen(senderId, settings.facebookPageId!, settings.metaAccessToken!).catch(() => {});
            return;
          }

          if (recStage === 'pick_qty') {
            const lastProdRec = existingSession.products[existingSession.products.length - 1];
            if (lastProdRec) {
              const priceKRec = lastProdRec.price ? `${(lastProdRec.price / 1000).toFixed(0)} ألف` : '';
              const qtyEmojisRec = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣'];
              const qtyElsRec = qtyEmojisRec.map((emoji, i) => {
                const n = i + 1;
                return {
                  title: `${emoji}  ${n} ${recLang === 'ku' ? 'دانە' : 'قطعة'}`,
                  subtitle: n === 1 ? (recLang === 'ku' ? 'قطعەیەک' : 'قطعة واحدة') : (recLang === 'ku' ? `${n} دانە` : `${n} قطع`),
                  buttons: [{ type: 'postback' as const, title: recLang === 'ku' ? `✅ ${n} دانە` : `✅ ${n} قطعة`, payload: `BOOK_QTY_${n}` }],
                };
              });
              await sendMsg(recLang === 'ku' ? `${priceKRec}\n\nچەند دانەی دەتەوێت؟ 🧮` : `${priceKRec}\n\nكم قطعة تريدين؟ 🧮`);
              await new Promise(r => setTimeout(r, 350));
              await sendMetaGenericTemplate(senderId, settings.facebookPageId!, settings.metaAccessToken!, qtyElsRec, platform, settings.metaAppSecret, settings.instagramAccountId, settings.instagramAccessToken);
              await markMetaSeen(senderId, settings.facebookPageId!, settings.metaAccessToken!).catch(() => {});
              return;
            }
          }

          if (recStage === 'age_type_q') {
            const lastProdAT = existingSession.products[existingSession.products.length - 1];
            const imgUrlAT = lastProdAT?.publicImageUrl ?? '';
            const ageTypeElsRec = [
              { title: recLang === 'ku' ? '👶 هەمان تەمەن' : '👶 نفس العمر', subtitle: recLang === 'ku' ? 'هەمان کۆمەڵی تەمەن' : 'جميع القطع لنفس الفئة العمرية', image_url: imgUrlAT, buttons: [{ type: 'postback' as const, title: recLang === 'ku' ? 'هەمان تەمەن ✅' : 'نفس العمر ✅', payload: 'BOOK_SAME_AGE' }] },
              { title: recLang === 'ku' ? '👧👦 تەمەنی جیاواز' : '👧👦 أعمار مختلفة', subtitle: recLang === 'ku' ? 'هەر قطعەیەک تەمەنێکی جیاواز' : 'كل قطعة لفئة عمرية مختلفة', image_url: imgUrlAT, buttons: [{ type: 'postback' as const, title: recLang === 'ku' ? 'تەمەنی جیاواز 🔀' : 'أعمار مختلفة 🔀', payload: 'BOOK_DIFF_AGE' }] },
            ];
            await sendMsg(recLang === 'ku' ? '🎀 هەمان تەمەن یان تەمەنی جیاواز؟' : '🎀 القطع لنفس الفئة العمرية أو أعمار مختلفة؟');
            await new Promise(r => setTimeout(r, 350));
            await sendMetaGenericTemplate(senderId, settings.facebookPageId!, settings.metaAccessToken!, ageTypeElsRec, platform, settings.metaAppSecret, settings.instagramAccountId, settings.instagramAccessToken);
            await markMetaSeen(senderId, settings.facebookPageId!, settings.metaAccessToken!).catch(() => {});
            return;
          }

          if (recStage === 'pick_age') {
            const ageQRRec = STORE_AGE_RANGES.map(({ minY, maxY, label }) => ({
              content_type: 'text' as const,
              title: label.slice(0, 20),
              payload: `BOOK_AGE_${Math.round(minY * 12)}_${Math.round(maxY * 12)}`,
            }));
            await sendQR(recLang === 'ku' ? 'تەمەنی مناڵەکەت چەندە؟ 👶' : 'يا عمر تريد؟ 👶', ageQRRec);
            await markMetaSeen(senderId, settings.facebookPageId!, settings.metaAccessToken!).catch(() => {});
            return;
          }
        }
        } // end legacy Facebook-only carousel flow (facebookBotEnabled=false)

        // ══════════════════════════════════════════════════════════════════════════
        // ── Conversational AI Bot — Instagram + Facebook (both platforms) ──────────
        // All non-postback, non-quick-reply messages handled here.
        // Provides: greeting, price inquiry from images, age info, availability,
        //           booking intent detection, delivery fee info, post-booking flows.
        // ══════════════════════════════════════════════════════════════════════════
        if (!isPostback && !quickReplyPayload &&
            (platform === 'instagram' || platform === 'facebook') &&
            settings.metaAccessToken && settings.facebookPageId) {

          // ── Complaint keyword check (fast path) ────────────────────────────────
          const normMsgAI = normalizeArabic((messageText || '').toLowerCase());
          const isComplaintAI = MENU_RETURN_KEYWORDS.some(kw =>
            kw && normMsgAI.includes(normalizeArabic(kw))
          );
          if (isComplaintAI) {
            const crMsg = 'رح انقل الرسالة للادارة عيني 💚\nرح نحل المشكلة ان شاء الله 🙏';
            await sendMsg(crMsg);
            if (settings.telegramBotToken && settings.telegramChatId) {
              await sendTelegramNotification(settings.telegramBotToken, settings.telegramChatId,
                `🔄 <b>مشكلة تبديل/ترجيع</b>\n👤 <code>${escHtml(senderId)}</code>\n💬 "${escHtml((messageText || '').slice(0, 300))}"`,
                buildConvButtons(senderId),
              ).catch(() => {});
            }
            await db.insert(chatMessagesTable).values({
              id: randomUUID(), conversationId: convId, role: 'assistant', content: crMsg,
            }).catch(() => {});
            await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
            return;
          }

          // ── First-time greeting ────────────────────────────────────────────────
          // After server restart, welcomedSendersSet is empty. Check DB to avoid re-greeting returning users.
          if (!welcomedSendersSet.has(senderId)) {
            welcomedSendersSet.add(senderId);
            // Check if this sender has previous messages (returning user / server restarted)
            const _existingHistory = await db.select({ id: chatMessagesTable.id })
              .from(chatMessagesTable)
              .where(eq(chatMessagesTable.conversationId, convId))
              .limit(1).catch(() => [] as any[]);
            const _isReturning = Array.isArray(_existingHistory) && _existingHistory.length > 0;
            if (!_isReturning) {
              recentGreetingMap.set(senderId, Date.now());
              const _gl = senderLangMap.get(senderId) ?? 'ar';
              const _gm = _gl === 'ku'
                ? 'بەخێربێن 🌸 سونبولة — جلوبەرگی منداڵان\nعیني، چی پێویستت هەیە؟ دەتوانی وێنەی بەرهەمەکان بنێرمەو نرخ و تەمەنەکانیان بزانی 😊'
                : 'أهلا وسهلا عيني 🌸\nتقدرين ترسلين صورة أي موديل وأحدثلج بالسعر والأعمار، أو تسأليني عن أي شي 😊';
              await sendMsg(_gm);
              await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
              return;
            }
            // Returning user after restart — fall through to normal processing
          }

          // ── Load inventory (cached) ────────────────────────────────────────────
          const _aiInventory = productsCache.get() ?? await (async () => {
            const d = await db.select().from(inventoryTable).where(eq(inventoryTable.available, true));
            productsCache.set(d);
            return d;
          })();

          // ═══════════════════════════════════════════════════════════════════════
          // ── State Machine ──────────────────────────────────────────────────────
          const _flowState = senderConvFlowMap.get(senderId);
          const _normTxt = normalizeArabic(txt.toLowerCase());

          // ── STAFF HANDOFF: Bot is completely silent — staff handles conversation ──
          if (_flowState?.step === 'staff_handoff') {
            // Silently mark as seen and do nothing — staff is in control
            await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
            return;
          }

          // ── B-ZERO: SAVED REPLIES — highest priority at EVERY stage ───────────────
          // Before any state handler, check if the message matches a saved reply keyword.
          // This ensures general bot Q&A (fabric, delivery, returns...) is always answered
          // regardless of the current conversation state.
          // EXCEPTION: Skip B-Zero when in active conversation flow to prevent false matches
          // from overriding booking intent, YES/NO responses, or in-progress ordering steps.
          const _earlyCtxProds = _flowState?.products ?? senderIdentifiedProductsMap.get(senderId) ?? [];
          const _activeFlowSteps = ['price_shown','age_replied','age_ask_pending','suggest_asked','suggestions_shown','booking_collect_info','booking_collect_address'];
          const _inActiveFlow = !!(_flowState?.step && _activeFlowSteps.includes(_flowState.step));
          const _isBookingMsg = isBookingIntent(normalizeArabic(txt.toLowerCase()));
          const _isYesNoMsg = detectYesNo(txt) !== null;
          // Skip B-Zero when: in active flow + (booking intent OR yes/no OR collecting phone/address)
          const _skipBZero = _inActiveFlow && (_isBookingMsg || _isYesNoMsg || _earlyCtxProds.length > 0);
          if (txt.length > 0 && !_skipBZero) {
            const _zReplies = repliesCache.get() ?? await (async () => {
              const d = await db.select().from(savedRepliesTable)
                .where(eq(savedRepliesTable.isActive, true))
                .orderBy(asc(savedRepliesTable.id));
              repliesCache.set(d);
              return d;
            })();
            const _zMatch = getSavedReplyMatch(txt, _zReplies);
            if (_zMatch) {
              const _isArLang = settings.language !== 'en';
              let _zReplyText = _isArLang ? _zMatch.replyAr : _zMatch.replyEn;
              // Inject delivery fees placeholder
              if (_zReplyText.includes('{أسعار_التوصيل}') || _zReplyText.includes('{delivery_fees}')) {
                const _dlvMapZ: Record<string, number> = (() => { try { return settings.deliveryFees ? JSON.parse(settings.deliveryFees) : {}; } catch { return {}; } })();
                const _dlvListZ = Object.entries(_dlvMapZ).map(([p, c]) => `${p}: ${c / 1000} الف`).join(' | ') || '—';
                _zReplyText = _zReplyText.replace(/\{أسعار_التوصيل\}/g, _dlvListZ).replace(/\{delivery_fees\}/g, _dlvListZ);
              }
              console.log(`[B0_SAVED_REPLY] keyword="${_zMatch.matchedKeyword}" step="${_flowState?.step ?? 'none'}" → sending saved reply`);
              await sendMsg(_zReplyText);
              await db.insert(chatMessagesTable).values({ id: randomUUID(), conversationId: convId, role: 'assistant', content: _zReplyText }).catch(() => {});
              // Update conversation history (keep state unchanged)
              const _zHist = senderConversationHistory.get(senderId) ?? [];
              _zHist.push({ role: 'user', content: txt });
              _zHist.push({ role: 'assistant', content: _zReplyText });
              if (_zHist.length > MAX_CONV_HISTORY) _zHist.splice(0, _zHist.length - MAX_CONV_HISTORY);
              senderConversationHistory.set(senderId, _zHist);
              await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
              return;
            }
          }

          // ── B0-delivery_ask_gov: Customer gave their governorate → look up fee ──
          if (_flowState?.step === 'delivery_ask_gov') {
            const _dlvResult = lookupDeliveryForCity(txt, (settings as any).deliveryFees);
            if (_dlvResult) {
              const _feeK = (_dlvResult.fee / 1000).toFixed(0);
              const _daysStr = _dlvResult.days ? ` و ${_dlvResult.days} يتاخر` : '';
              const _dlvReply = `${_feeK} الف توصيل${_daysStr} 😊`;
              await sendMsg(_dlvReply);
              // Update flow state with delivery info, preserve products
              senderConvFlowMap.set(senderId, {
                ..._flowState,
                step: 'price_shown',
                governorate: _dlvResult.label,
                deliveryFee: _dlvResult.fee,
                deliveryDays: _dlvResult.days,
              });
              await db.insert(chatMessagesTable).values({ id: randomUUID(), conversationId: convId, role: 'assistant', content: _dlvReply }).catch(() => {});
            } else {
              // Couldn't find the governorate — show all options
              const _grps = extractGroupsFromFees((settings as any).deliveryFees);
              const _allCities = _grps.map(g => `${g.label}: ${(g.fee / 1000).toFixed(0)} الف${g.days ? ` (${g.days})` : ''}`).join('\n');
              const _fallback = _allCities ? `ما عرفت المحافظة 😊 أسعار التوصيل:\n${_allCities}` : 'تواصلوا معنا لمعرفة سعر التوصيل 😊';
              await sendMsg(_fallback);
              // Stay in delivery_ask_gov so customer can retry
            }
            await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
            return;
          }

          // ── Helper: complete booking with phone + address ──────────────────
          const _completeBooking = async (phone: string, addrRaw: string) => {
            const _bkProds = _flowState!.products.length > 0 ? _flowState!.products : (senderIdentifiedProductsMap.get(senderId) ?? []);
            const _bkGov = _flowState!.governorate ?? '';
            let _bkFee = _flowState!.deliveryFee ?? 0;
            if (_bkFee === 0 && settings.deliveryFees) {
              const _autoGov = lookupDeliveryForCity(addrRaw, (settings as any).deliveryFees)
                ?? lookupDeliveryForCity(_bkGov || addrRaw, (settings as any).deliveryFees);
              if (_autoGov) _bkFee = _autoGov.fee;
            }
            const _bkTotalItem = _bkProds.reduce((s, p) => s + p.price, 0);
            const _bkGrand = _bkTotalItem + _bkFee;
            const _bkPriceLines = _bkProds.length > 0
              ? _bkProds.map(p => `• ${p.price.toLocaleString('en-US')} دينار${p.colors ? ' — ' + p.colors : ''}`).join('\n')
              : '• منتج محدد لاحقاً';
            const _confirmMsg =
              `✅ تمام عيني محجوزة!\n\n` +
              _bkPriceLines +
              (_bkFee > 0 ? `\n• توصيل: ${(_bkFee / 1000).toFixed(0)} الف` : '') +
              `\n──────────\n💰 المجموع: ${_bkGrand > 0 ? _bkGrand.toLocaleString('en-US') + ' دينار' : 'سيتم التأكيد'}\n\n📍 ${addrRaw}\n📱 ${phone}`;
            await sendMsg(_confirmMsg);
            const _bkHistory = [
              ...(_bkProds.length > 0 ? [{ role: 'assistant' as const, content: `سعر المنتج: ${_bkTotalItem.toLocaleString('en-US')} دينار` }] : []),
              { role: 'user' as const, content: txt },
              { role: 'assistant' as const, content: _confirmMsg },
            ];
            await tryAutoCreateBooking(
              convId, platform, senderId, _bkHistory, settings,
              { phone, address: `${_bkGov ? _bkGov + ' — ' : ''}${addrRaw}` },
            );
            senderConvFlowMap.delete(senderId);
            await db.insert(chatMessagesTable).values({ id: randomUUID(), conversationId: convId, role: 'assistant', content: _confirmMsg }).catch(() => {});
          };

          // ── B0a-booking_collect_info: Waiting for phone number ──────────────
          if (_flowState?.step === 'booking_collect_info') {
            const _phone = extractIraqiPhone(txt);
            if (!_phone) {
              await sendMsg('عيني الرقم يجب يكون 11 رقم ويبدأ بـ 07 مثل 07XXXXXXXXX 😊');
              await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
              return;
            }
            // Phone found — check if address also provided in same message
            const _addrInline = txt.replace(/07[0-9]{9}/g, '').replace(/\s+/g, ' ').trim();
            if (_addrInline.length >= 5) {
              // Both phone and address in same message — complete booking
              await _completeBooking(_phone, _addrInline);
            } else {
              // Phone only — save it and ask for address separately
              senderConvFlowMap.set(senderId, { ..._flowState, step: 'booking_collect_address', savedPhone: _phone });
              await sendMsg('تمام عيني 😊 هسه دزيلنا العنوان الكامل (المحافظة + الحي + الشارع)');
            }
            await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
            return;
          }

          // ── B0b-booking_collect_address: Phone saved, waiting for address ───
          if (_flowState?.step === 'booking_collect_address') {
            const _savedPhone = _flowState.savedPhone ?? '';
            // Check if customer sent a new phone number in this message too (edge case)
            const _newPhone = extractIraqiPhone(txt);
            const _phone = _newPhone || _savedPhone;
            const _addrRaw = txt.replace(/07[0-9]{9}/g, '').replace(/\s+/g, ' ').trim();
            if (_addrRaw.length < 5) {
              await sendMsg('عيني دزيلنا العنوان كامل (المحافظة + الحي + الشارع) 😊');
              await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
              return;
            }
            await _completeBooking(_phone, _addrRaw);
            await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
            return;
          }

          // ── POST-BOOKING: CANCELLATION ─────────────────────────────────────────
          if (isCancellationRequest(_normTxt)) {
            const _cancelMsg = 'تمام عيني تم إلغاء طلبيتك، شكراً لتواصلك معنا 😊 إذا احتجتي أي شي نحن هنا!';
            await sendMsg(_cancelMsg);
            senderConvFlowMap.delete(senderId);
            await db.insert(chatMessagesTable).values({ id: randomUUID(), conversationId: convId, role: 'assistant', content: _cancelMsg }).catch(() => {});
            await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
            return;
          }

          // ── POST-BOOKING: ADDITION / EXCHANGE / RETURN → handoff to staff ─────
          if (isAddToOrderRequest(_normTxt) || isExchangeRequest(_normTxt) || isReturnRequest(_normTxt)) {
            const _handoffType = isAddToOrderRequest(_normTxt)
              ? { label: 'إضافة على الطلبية', emoji: '➕' }
              : isExchangeRequest(_normTxt)
                ? { label: 'تبديل قطعة', emoji: '🔄' }
                : { label: 'ترجيع طلبية', emoji: '↩️' };
            const _ackMsg = 'تمام عيني لحظات 😊';
            await sendMsg(_ackMsg);
            await db.insert(chatMessagesTable).values({ id: randomUUID(), conversationId: convId, role: 'assistant', content: _ackMsg }).catch(() => {});
            // Notify staff via Telegram
            if (settings.telegramBotToken && settings.telegramChatId) {
              const _convRow = await db.select({ senderName: chatConversationsTable.senderName })
                .from(chatConversationsTable)
                .where(eq(chatConversationsTable.id, convId))
                .limit(1).catch(() => []);
              const _customerName = (_convRow[0] as any)?.senderName || senderId;
              const _tgMsg = `${_handoffType.emoji} <b>${_handoffType.label}</b>\n\n👤 الزبون: ${_customerName}\n💬 رسالته: ${txt.slice(0, 200)}\n\n⚠️ يرجى التواصل مع الزبون مباشرة.`;
              const _dashLink = platform === 'instagram'
                ? `https://business.facebook.com/latest/inbox/direct?selected_item_id=${senderId}`
                : `https://business.facebook.com/latest/inbox/messenger?selected_item_id=${senderId}`;
              await sendTelegramNotification(
                settings.telegramBotToken, settings.telegramChatId,
                _tgMsg,
                [[{ text: '📱 فتح المحادثة', url: _dashLink }]],
              ).catch(() => {});
            }
            // Set staff_handoff — bot goes completely silent from now on for this user
            senderConvFlowMap.set(senderId, {
              step: 'staff_handoff',
              products: _flowState?.products ?? [],
            });
            await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
            return;
          }

          // ── DELIVERY QUESTION → ask for governorate ─────────────────────────
          if (_normTxt.includes('توصيل') || _normTxt.includes('تسليم') || _normTxt.includes('شحن') || _normTxt.includes('ايصال')) {
            // If customer already typed a city in the same message, try to look it up
            const _dlvInline = lookupDeliveryForCity(txt.replace(/توصيل|تسليم|شحن|ايصال|اشقد|بكم/g, ''), (settings as any).deliveryFees);
            if (_dlvInline) {
              const _feeK = (_dlvInline.fee / 1000).toFixed(0);
              const _daysStr = _dlvInline.days ? ` و ${_dlvInline.days} يتاخر` : '';
              const _reply = `${_feeK} الف توصيل${_daysStr} 😊`;
              await sendMsg(_reply);
              // Store delivery info in flow state
              const _curState0 = senderConvFlowMap.get(senderId);
              senderConvFlowMap.set(senderId, {
                step: _curState0?.step ?? 'price_shown',
                products: _curState0?.products ?? (senderIdentifiedProductsMap.get(senderId) ?? []),
                governorate: _dlvInline.label,
                deliveryFee: _dlvInline.fee,
                deliveryDays: _dlvInline.days,
              });
              await db.insert(chatMessagesTable).values({ id: randomUUID(), conversationId: convId, role: 'assistant', content: _reply }).catch(() => {});
            } else {
              // Ask for governorate
              const _askGovMsg = 'يا محافظة؟ 😊';
              await sendMsg(_askGovMsg);
              const _curState0 = senderConvFlowMap.get(senderId);
              senderConvFlowMap.set(senderId, {
                step: 'delivery_ask_gov',
                products: _curState0?.products ?? (senderIdentifiedProductsMap.get(senderId) ?? []),
                governorate: _curState0?.governorate,
                deliveryFee: _curState0?.deliveryFee,
                deliveryDays: _curState0?.deliveryDays,
              });
              await db.insert(chatMessagesTable).values({ id: randomUUID(), conversationId: convId, role: 'assistant', content: _askGovMsg }).catch(() => {});
            }
            await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
            return;
          }

          // ── Saved replies (keyword match — only when NO active state machine flow) ─
          // Skip saved replies when in active conversation state (price_shown/age/suggest)
          // to prevent keyword false-matches overriding the state machine logic.
          const _hasActiveFlow = !!_flowState;
          if (txt.length > 0 && !_hasActiveFlow) {
            const _aiSavedReplies = repliesCache.get() ?? await (async () => {
              const d = await db.select().from(savedRepliesTable)
                .where(eq(savedRepliesTable.isActive, true))
                .orderBy(asc(savedRepliesTable.id));
              repliesCache.set(d);
              return d;
            })();
            const _aiSavedMatch = getSavedReplyMatch(txt, _aiSavedReplies);
            if (_aiSavedMatch) {
              const _isAr = settings.language !== 'en';
              let _savedTxt = _isAr ? _aiSavedMatch.replyAr : _aiSavedMatch.replyEn;
              if (_savedTxt.includes('{أسعار_التوصيل}') || _savedTxt.includes('{delivery_fees}')) {
                const _dlvM: Record<string, any> = (() => { try { return settings.deliveryFees ? JSON.parse(settings.deliveryFees) : {}; } catch { return {}; } })();
                const _dlvL = Object.entries(_dlvM).map(([p, c]) => {
                  const n = Number(c); return !isNaN(n) && n > 0 ? `${p}: ${n / 1000} الف` : `${p}: ${c}`;
                }).join(' | ');
                _savedTxt = _savedTxt.replace(/\{أسعار_التوصيل\}/g, _dlvL || '—').replace(/\{delivery_fees\}/g, _dlvL || '—');
              }
              await sendMsg(_savedTxt);
              await db.insert(chatMessagesTable).values({
                id: randomUUID(), conversationId: convId, role: 'assistant', content: _savedTxt,
              }).catch(() => {});
              await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
              return;
            }
          }

          // Helper: send product as plain image + text label (no cards/carousel)
          const _sendProductImg = async (p: IdentifiedProduct, label: string) => {
            if (p.imageUrl) {
              await sendMetaImage(senderId, settings.facebookPageId!, settings.metaAccessToken!, p.imageUrl,
                platform, settings.instagramAccountId, settings.instagramAccessToken, settings.metaAppSecret).catch(() => {});
              await new Promise(r => setTimeout(r, 250));
            }
            await sendMsg(label);
          };
          // Send image only (no text below) — used for suggestions since code is printed on the image
          const _sendImgOnly = async (p: IdentifiedProduct) => {
            if (p.imageUrl) {
              await sendMetaImage(senderId, settings.facebookPageId!, settings.metaAccessToken!, p.imageUrl,
                platform, settings.instagramAccountId, settings.instagramAccessToken, settings.metaAppSecret).catch(() => {});
              await new Promise(r => setTimeout(r, 400));
            }
          };
          // Returns a human-readable product label — uses colors field when nameAr looks like a product code
          const _pLabel = (p: IdentifiedProduct, withPrice = false): string => {
            const isCode = /^[A-Za-z]{1,3}[\d.]/.test(p.nameAr.trim());
            const name = (isCode && p.colors) ? p.colors : (isCode ? '' : p.nameAr);
            if (withPrice) {
              const priceStr = `${p.price.toLocaleString('en-US')} دينار`;
              return name ? `${name}: ${priceStr}` : priceStr;
            }
            return name || p.nameAr;
          };

          // ── A. IMAGE MESSAGE → run vision, show prices only ────────────────────
          if (imageUrl && _allImageUrls.length > 0) {
            // ── A_PRE: detect album / rapid-fire group send ─────────────────────
            const _nowMs = Date.now();
            const _lastImgMs = senderLastImageTimeMap.get(senderId);
            const _isRapidFire = _lastImgMs !== undefined && (_nowMs - _lastImgMs) < 8000;
            const _isAlbum = _allImageUrls.length > 1;
            // Update tracker regardless
            senderLastImageTimeMap.set(senderId, _nowMs);
            if (_isAlbum || _isRapidFire) {
              console.log(`[IMG_GROUP] ${senderId} — album=${_isAlbum} rapidFire=${_isRapidFire} (gap=${_lastImgMs ? _nowMs - _lastImgMs : '∞'}ms)`);
              const _groupMsg = _isAlbum
                ? 'عيني لازم ترسلين الصور وحدة وحدة 📸\nلو ترسلين مجموعة ما تبين عندي — أرسلين صورة واحدة وأجاوبج فوراً 😊'
                : 'عيني لازم ترسلين الصور وحدة وحدة 📸\nلو ترسلين مجموعة ما تبين عندي — أرسلين صورة واحدة وأجاوبج فوراً 😊';
              await sendMsg(_groupMsg);
              await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
              return;
            }

            let _smIdentified: IdentifiedProduct[] = [];
            let _vrRaw = ''; // hoisted so accessible after try/catch for error message
            try {
              // ── Step A0: check if messageText or allImageUrls contain a direct product code ──
              const _directCodeRe = /\b([A-Za-z]{1,3}\d{2,5})\b/g;
              const _directCodesFound: string[] = [];
              let _dcm;
              const _scanText = txt + ' ' + _allImageUrls.join(' ');
              while ((_dcm = _directCodeRe.exec(_scanText)) !== null) {
                const _candidate = _dcm[1].toUpperCase();
                if (!_directCodesFound.includes(_candidate)) _directCodesFound.push(_candidate);
              }
              for (const _dc of _directCodesFound) {
                // Try exact match first, then prefix match for color variants (e.g. S385 → S385.1, S385.2)
                const _dcLower = _dc.toLowerCase();
                const _exactProd = (_aiInventory as any[]).find((p: any) =>
                  (p.productId || '').toLowerCase() === _dcLower
                );
                const _directProds = _exactProd
                  ? [_exactProd]
                  : (_aiInventory as any[]).filter((p: any) => {
                      const pid = (p.productId || '').toLowerCase();
                      return pid.startsWith(_dcLower + '.') || pid.startsWith(_dcLower + '-');
                    });
                for (const _directProd of _directProds) {
                  const _dpa = _directProd as any;
                  let _dAgeStr = `${_dpa.ageMin ?? '?'}-${_dpa.ageMax ?? '?'}سنة`;
                  try { const r = _dpa.ageRanges ? JSON.parse(_dpa.ageRanges) : null; if (Array.isArray(r) && r.length) _dAgeStr = r.map((x: any) => `${x.min}-${x.max}سنة`).join(' | '); } catch {}
                  _smIdentified.push({
                    productId: _directProd.productId, nameAr: _dpa.nameAr || _directProd.category || '',
                    price: Number(_directProd.price) || 0, ageRanges: _dAgeStr,
                    gender: _directProd.gender || '', season: _dpa.season || '', colors: _dpa.colors || '',
                    available: !!_directProd.available, imageUrl: _directProd.publicImageUrl || undefined,
                    ageMin: Number(_dpa.ageMin || 0), ageMax: Number(_dpa.ageMax || 99),
                  });
                  console.log(`[SM_DIRECT_CODE] ${senderId} → matched ${_directProd.productId}`);
                }
              }

              // ── Step A1: vision (read codes first, then visual match) ────────────
              if (_smIdentified.length === 0) {
                let _pool = (_aiInventory as any[]).filter((p: any) => p.publicImageUrl);
                if (_pool.length > 20) _pool = _pool.slice(0, 20); // Show up to 20 reference products

                const _vc: any[] = [{
                  type: 'text',
                  text: `قواعد مهمة:
الأولوية الأولى: هل في كود أو رقم مكتوب بوضوح على الصورة؟ مثلاً S385، B001، SW230، إلخ. إذا وجدته → اكتبه فوراً [MATCH:الكود].
الأولوية الثانية: إذا ما في كود مكتوب → قارن بصرياً مع الصور المرجعية التالية وحدد الأقرب [MATCH:كود] أو [NO_MATCH].
ممنوع اختراع كود غير موجود في القائمة المرجعية.
قائمة المنتجات المرجعية (${_pool.length} منتج):`,
                }];
                for (const p of _pool) {
                  const pa = p as any;
                  _vc.push({ type: 'text', text: `▪ [${p.productId}] ${pa.nameAr || p.category} | ${p.price}د` });
                  _vc.push({ type: 'image_url', image_url: { url: pa.publicImageUrl!, detail: 'low' } });
                }
                const _imgUrlsToUse = _allImageUrls.length > 0 ? _allImageUrls : (imageUrl ? [imageUrl] : []);
                for (let _i = 0; _i < _imgUrlsToUse.length; _i++) {
                  const _ru = _imgUrlsToUse[_i];
                  // Use mirrored version for ALL images (permanent URL + base64)
                  const _mirrored = _mirroredImageMapCap.get(_ru);
                  let _src: string;
                  if (_mirrored?.base64) {
                    _src = `data:${_mirrored.contentType};base64,${_mirrored.base64}`;
                  } else if (_mirrored?.permanentUrl) {
                    _src = _mirrored.permanentUrl;
                  } else {
                    _src = _ru; // fallback to original URL
                  }
                  _vc.push({ type: 'image_url', image_url: { url: _src, detail: 'high' } });
                  _vc.push({ type: 'text', text: `↑ صورة الزبون ${_i + 1}${_imgUrlsToUse.length > 1 ? ` (من ${_imgUrlsToUse.length})` : ''}: اقرأ أي كود مكتوب أولاً، ثم طابق بصرياً. اكتب [MATCH:كود] أو [NO_MATCH]` });
                }

                const _vr = await openai.chat.completions.create({
                  model: (settings as any).aiModelImage ?? 'gpt-4o-mini',
                  messages: [{ role: 'user', content: _vc }],
                  max_completion_tokens: 250, temperature: 0.1,
                });
                _vrRaw = _vr.choices[0]?.message?.content || '';
                console.log(`[SM_VISION] ${senderId} → ${_vrRaw.slice(0, 120)}`);

                const _mr = /\[MATCH:([A-Za-z0-9_\-]+)\]/g;
                const _codes: string[] = [];
                let _mm;
                while ((_mm = _mr.exec(_vrRaw)) !== null) { if (!_codes.includes(_mm[1])) _codes.push(_mm[1]); }

                for (const _code of _codes) {
                  // Exact match first, then prefix match for color variants (S385 → S385.1, S385.2)
                  const _codeLower = _code.toLowerCase();
                  const _exactPr = (_aiInventory as any[]).find((p: any) =>
                    (p.productId || '').toLowerCase() === _codeLower
                  );
                  const _matchedProds = _exactPr
                    ? [_exactPr]
                    : (_aiInventory as any[]).filter((p: any) => {
                        const pid = (p.productId || '').toLowerCase();
                        return pid.startsWith(_codeLower + '.') || pid.startsWith(_codeLower + '-');
                      });
                  for (const _pr of _matchedProds) {
                    const _pa = _pr as any;
                    let _ageStr = `${_pa.ageMin ?? '?'}-${_pa.ageMax ?? '?'}سنة`;
                    try { const r = _pa.ageRanges ? JSON.parse(_pa.ageRanges) : null; if (Array.isArray(r) && r.length) _ageStr = r.map((x: any) => `${x.min}-${x.max}سنة`).join(' | '); } catch {}
                    _smIdentified.push({
                      productId: _pr.productId || '',
                      nameAr: _pa.nameAr || _pr.category || '',
                      price: Number(_pr.price) || 0,
                      ageRanges: _ageStr,
                      gender: _pr.gender || '',
                      season: _pa.season || '',
                      colors: _pa.colors || '',
                      available: !!_pr.available,
                      imageUrl: _pr.publicImageUrl || undefined,
                      ageMin: Number(_pa.ageMin || 0),
                      ageMax: Number(_pa.ageMax || 99),
                    });
                  }
                }
              } // end if (_smIdentified.length === 0) vision block
            } catch (_ve: any) {
              console.log(`[SM_VISION_ERR] ${_ve?.message?.slice(0, 80)}`);
            }

            if (_smIdentified.length > 0) {
              senderIdentifiedProductsMap.set(senderId, _smIdentified);
              // Show price then ask age — set age_ask_pending so next message is age check
              const _priceOnly = _smIdentified.length === 1
                ? `السعر: ${_smIdentified[0].price.toLocaleString('en-US')} دينار`
                : _smIdentified.map(p => `• ${p.price.toLocaleString('en-US')} دينار${p.colors ? ' — ' + p.colors : ''}`).join('\n');
              await sendMsg(_priceOnly);
              await new Promise(r => setTimeout(r, 400));
              await sendMsg('يا عمر تريدين؟ 😊');
              senderConvFlowMap.set(senderId, { step: 'age_ask_pending', products: _smIdentified });
              await db.insert(chatMessagesTable).values({ id: randomUUID(), conversationId: convId, role: 'assistant', content: _priceOnly }).catch(() => {});
            } else {
              // Distinguish: did vision find a code (product not in our DB) vs couldn't read image at all?
              const _vrFull = _vrRaw ?? '';
              const _recognizedCodes = (_vrFull.match(/\[MATCH:([A-Za-z0-9_\-]+)\]/g) || [])
                .map((m: string) => m.replace(/\[MATCH:(.+)\]/, '$1'));
              let _noMatch: string;
              if (_recognizedCodes.length > 0) {
                // Code recognized by vision but not in our inventory
                const _codeList = _recognizedCodes.join('، ');
                _noMatch = `الموديل ${_codeList} مو موجود بمخزوننا حالياً 😊\nتريدين تشوفين موديلات مشابهة؟`;
                senderConvFlowMap.set(senderId, { step: 'suggest_asked', products: [] });
              } else {
                // Truly couldn't read the image
                _noMatch = 'ما قدرت أتعرف على الموديل عيني 😊\nتقدرين ترسلين صورة أوضح أو بدون فلتر';
              }
              await sendMsg(_noMatch);
              await db.insert(chatMessagesTable).values({ id: randomUUID(), conversationId: convId, role: 'assistant', content: _noMatch }).catch(() => {});
            }
            await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
            return;
          }

          // ── B. TEXT — state machine branches ──────────────────────────────────
          const _ctxProds = _flowState?.products ?? senderIdentifiedProductsMap.get(senderId) ?? [];

          // B1. SUGGEST_ASKED → customer answering yes/no ────────────────────────
          if (_flowState?.step === 'suggest_asked') {
            const _yn = detectYesNo(txt);
            if (_yn === 'yes') {
              const _excl = _flowState.products.map(p => p.productId);
              const _gender = senderGenderMap.get(senderId) ?? '';
              // Always use the current real-world season (mandatory) — ignores per-user season preference
              const _currSeason = getCurrentSeason();
              const _ageYrs = _flowState.requestedAgeYears;
              const _suggs = (_aiInventory as any[])
                .filter((p: any) => !_excl.includes(p.productId) && p.publicImageUrl)
                .filter((p: any) => !_gender || p.gender === _gender || p.gender === 'both')
                // Season filter: current season + 'all' products + 'spring' during summer (warm transition)
                .filter((p: any) => {
                  const ps = (p.season ?? 'all').toLowerCase();
                  if (ps === 'all') return true;
                  if (ps === _currSeason) return true;
                  if (_currSeason === 'summer' && ps === 'spring') return true;
                  return false;
                })
                .filter((p: any) => !_ageYrs || (Number(p.ageMin || 0) <= _ageYrs && Number(p.ageMax || 99) >= _ageYrs));
              if (_suggs.length > 0) {
                const _sgProds: IdentifiedProduct[] = [];
                for (const _sg of _suggs) {
                  const _pa = _sg as any;
                  const _sgProd: IdentifiedProduct = {
                    productId: _sg.productId, nameAr: _pa.nameAr || _sg.category, price: Number(_sg.price),
                    ageRanges: '', gender: _sg.gender, season: _pa.season || '', colors: _pa.colors || '',
                    available: true, imageUrl: _sg.publicImageUrl, ageMin: Number(_pa.ageMin || 0), ageMax: Number(_pa.ageMax || 99),
                  };
                  _sgProds.push(_sgProd);
                  // Send image only — product code is printed on the image itself
                  await _sendImgOnly(_sgProd);
                }
                await sendMsg('عيني هذن المتوفرين 😊\nاختاري اللي تريدين حتى اكتبلج السعر');
                // Keep products in state so customer can ask price after selecting
                senderConvFlowMap.set(senderId, { step: 'suggestions_shown', products: _sgProds, requestedAgeYears: _flowState.requestedAgeYears });
              } else {
                await sendMsg('ما اكو اقتراحات متوفرة الحين عيني 😊');
                senderConvFlowMap.delete(senderId);
              }
            } else if (_yn === 'no') {
              // Customer said no to suggestions — return to original product if we have one
              const _origIdProd = senderIdentifiedProductsMap.get(senderId);
              if (_origIdProd && _origIdProd.length > 0) {
                const _bookMsg = `تمام عيني 😊 تريدين تحجزين الموديل؟`;
                await sendMsg(_bookMsg);
                senderConvFlowMap.set(senderId, { step: 'price_shown', products: _origIdProd });
              } else {
                await sendMsg('حياج عيني، راسليني لو محتاجة أي شي 😊');
                senderConvFlowMap.delete(senderId);
              }
            } else {
              await sendMsg('تريدين ادز اقتراحات؟ 😊');
            }
            await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
            return;
          }

          // B2. AGE_ASK_PENDING → customer giving their age ──────────────────────
          if (_flowState?.step === 'age_ask_pending') {
            const _ageYrs = extractAgeFromArabic(txt);
            if (_ageYrs !== null && _ageYrs > 0) {
              // Primary check: numeric ageMin/ageMax
              // Fallback: parse ageRanges text (e.g. "1-4 سنة | 5-7سنة") to catch split ranges
              const _avail = _flowState.products.filter(p => {
                if (isAvailableForAge(p, _ageYrs)) return true;
                // Fallback: check each sub-range in ageRanges string like "1-4 سنة | 5-7سنة"
                const _ranges = (p.ageRanges || '').split(/[|،,]/).map((s: string) => s.trim());
                for (const _r of _ranges) {
                  const _m = _r.match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/);
                  if (_m) {
                    const _rMin = parseFloat(_m[1]), _rMax = parseFloat(_m[2]);
                    // Values >12 are likely months; convert to years
                    const _rMinY = _rMin > 12 ? _rMin / 12 : _rMin;
                    const _rMaxY = _rMax > 12 ? _rMax / 12 : _rMax;
                    if (_ageYrs >= _rMinY && _ageYrs <= _rMaxY) return true;
                  }
                }
                return false;
              });
              if (_avail.length > 0) {
                senderConvFlowMap.set(senderId, { step: 'age_replied', products: _flowState.products, requestedAgeYears: _ageYrs, availableForAge: _avail });
                await sendMsg(`متوفر للعمر 😊`);
              } else {
                await sendMsg('عيني مو متوفرة للعمر اللي تريدين 😊\nأكو غير موديل، اذا تريدين رح ادزلج المتوفر');
                senderConvFlowMap.set(senderId, { step: 'suggest_asked', products: _flowState.products, requestedAgeYears: _ageYrs });
              }
            } else {
              // Age not parseable — silently skip if price question (duplicate event), else re-ask
              if (!isPriceQuestion(_normTxt)) {
                await sendMsg('عيني قوليلي يا عمر تريد؟ 😊');
              }
            }
            await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
            return;
          }

          // B3. AGE_REPLIED → customer asking price of available products ─────────
          if (_flowState?.step === 'age_replied' && isPriceQuestion(_normTxt)) {
            const _avail4 = _flowState.availableForAge ?? [];
            for (const _ap of _avail4.slice(0, 4)) {
              await _sendProductImg(_ap, _pLabel(_ap, true));
              await new Promise(r => setTimeout(r, 350));
            }
            await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
            return;
          }

          // B4. AGE QUESTION with context products ──────────────────────────────
          if (_ctxProds.length > 0 && isAgeQuestion(_normTxt)) {
            const _ageYrs = extractAgeFromArabic(txt);
            // Helper: check age against ageRanges text as fallback for split ranges
            const _checkAgeInRanges = (p: IdentifiedProduct, ageY: number): boolean => {
              if (isAvailableForAge(p, ageY)) return true;
              const _ranges = (p.ageRanges || '').split(/[|،,]/).map((s: string) => s.trim());
              for (const _r of _ranges) {
                const _m = _r.match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/);
                if (_m) {
                  const rMin = parseFloat(_m[1]), rMax = parseFloat(_m[2]);
                  const rMinY = rMin > 12 ? rMin / 12 : rMin;
                  const rMaxY = rMax > 12 ? rMax / 12 : rMax;
                  if (ageY >= rMinY && ageY <= rMaxY) return true;
                }
              }
              return false;
            };
            if (_ctxProds.length === 1) {
              if (_ageYrs !== null && _ageYrs > 0) {
                if (_checkAgeInRanges(_ctxProds[0], _ageYrs)) {
                  senderConvFlowMap.set(senderId, { step: 'age_replied', products: _ctxProds, requestedAgeYears: _ageYrs, availableForAge: _ctxProds });
                  await sendMsg(`متوفر للعمر 😊`);
                } else {
                  await sendMsg('عيني مو متوفرة للعمر اللي تريدين 😊\nأكو غير موديل، اذا تريدين رح ادزلج المتوفر');
                  senderConvFlowMap.set(senderId, { step: 'suggest_asked', products: _ctxProds, requestedAgeYears: _ageYrs });
                }
              } else {
                // Asked about age without specifying which → list the ranges and remember context
                await sendMsg(`الأعمار: ${_ctxProds[0].ageRanges}\nعيني قوليلي يا عمر تريد؟ 😊`);
                senderConvFlowMap.set(senderId, { step: 'age_ask_pending', products: _ctxProds });
              }
            } else {
              // Multiple products: ask which age they want
              await sendMsg('عيني قوليلي يا عمر تريد؟ 😊');
              senderConvFlowMap.set(senderId, { step: 'age_ask_pending', products: _ctxProds });
            }
            await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
            return;
          }

          // B5. PRICE QUESTION with context products ────────────────────────────
          if (_ctxProds.length > 0 && isPriceQuestion(_normTxt)) {
            for (const _p of _ctxProds.slice(0, 4)) {
              await _sendProductImg(_p, _pLabel(_p, true));
              if (_ctxProds.length > 1) await new Promise(r => setTimeout(r, 350));
            }
            // After price → always ask age so bot can verify availability
            await new Promise(r => setTimeout(r, 400));
            await sendMsg('يا عمر تريدين؟ 😊');
            senderConvFlowMap.set(senderId, { step: 'age_ask_pending', products: _ctxProds });
            await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
            return;
          }

          // B5.5: AGE QUESTION without context → search inventory by age (age_browse) ──
          if (isAgeQuestion(_normTxt) && _ctxProds.length === 0) {
            const _browseAge = extractAgeFromArabic(txt);
            if (_browseAge !== null && _browseAge > 0) {
              // Filter inventory by age AND current season (mandatory)
              const _browseSeason = getCurrentSeason();
              const _ageMatches = (_aiInventory as IdentifiedProduct[]).filter(p => {
                if (p.available === false) return false;
                if (!isAvailableForAge(p, _browseAge)) return false;
                const ps = ((p as any).season ?? 'all').toLowerCase();
                if (ps === 'all') return true;
                if (ps === _browseSeason) return true;
                if (_browseSeason === 'summer' && ps === 'spring') return true;
                return false;
              }).slice(0, 8);
              if (_ageMatches.length > 0) {
                await sendMsg(`لحظات عيني 😊 موديلاتنا للعمر ${_browseAge < 1 ? Math.round(_browseAge * 12) + ' شهر' : _browseAge + ' سنة'}:`);
                for (const _am of _ageMatches) {
                  await _sendProductImg(_am, _pLabel(_am));
                  await new Promise(r => setTimeout(r, 300));
                }
                senderConvFlowMap.set(senderId, {
                  step: 'age_browse',
                  products: _ageMatches,
                  requestedAgeYears: _browseAge,
                });
              } else {
                await sendMsg(`عيني ما عندنا موديلات متوفرة لهذا العمر الحين 😊 تريدين تشوفين غير عمر؟`);
              }
            } else {
              await sendMsg('أي عمر عيني؟ مثلاً: ٣ سنة، ٦ شهور 😊');
            }
            await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
            return;
          }

          // B5.5a: price_shown/age_replied + YES → treat as booking intent ─────────
          // Customer says "اي"/"نعم"/"اوكي" after being shown price or age → start booking
          if (_ctxProds.length > 0 &&
              (_flowState?.step === 'price_shown' || _flowState?.step === 'age_replied' || _flowState?.step === 'suggestions_shown') &&
              detectYesNo(txt) === 'yes') {
            const _bkFeeNow = _flowState.deliveryFee ?? 0;
            const _bkTotalItemNow = _ctxProds.reduce((s, p) => s + p.price, 0);
            const _bkGrandNow = _bkTotalItemNow + _bkFeeNow;
            let _totalMsg = '';
            for (const _bp of _ctxProds) {
              const _bpColor = _bp.colors ? ` — ${_bp.colors}` : '';
              _totalMsg += `• ${_bp.price.toLocaleString('en-US')} دينار${_bpColor}\n`;
            }
            _totalMsg += `──────────\n💰 المجموع: ${_bkGrandNow > 0 ? _bkGrandNow.toLocaleString('en-US') + ' دينار' : _bkTotalItemNow.toLocaleString('en-US') + ' دينار'}\n\n`;
            _totalMsg += '📱 عيني للحجز دزيلنا رقمك (07XXXXXXXXX) 😊';
            await sendMsg(_totalMsg);
            senderConvFlowMap.set(senderId, {
              ...(senderConvFlowMap.get(senderId) ?? { step: 'booking_collect_info', products: _ctxProds }),
              step: 'booking_collect_info',
              products: _ctxProds,
            });
            await db.insert(chatMessagesTable).values({ id: randomUUID(), conversationId: convId, role: 'assistant', content: _totalMsg }).catch(() => {});
            await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
            return;
          }

          // B5.5b: PRICE QUESTION without any context → ask for photo ──────────
          if (isPriceQuestion(_normTxt) && _ctxProds.length === 0) {
            await sendMsg('أرسلي صورة الموديل عيني وأحدثلج بالسعر والأعمار 😊');
            await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
            return;
          }

          // B6. BOOKING INTENT → show price breakdown + collect info ─────────────
          if (isBookingIntent(_normTxt) && _ctxProds.length > 0) {
            const _curFlow = senderConvFlowMap.get(senderId);
            const _bkFeeNow = _curFlow?.deliveryFee ?? 0;
            const _bkTotalItemNow = _ctxProds.reduce((s, p) => s + p.price, 0);
            const _bkGrandNow = _bkTotalItemNow + _bkFeeNow;
            // Build total breakdown message — NO product codes, just prices
            let _totalMsg = '';
            for (const _bp of _ctxProds) {
              const _bpColor = _bp.colors ? ` — ${_bp.colors}` : '';
              _totalMsg += `• ${_bp.price.toLocaleString('en-US')} دينار${_bpColor}\n`;
            }
            if (_bkFeeNow > 0) {
              _totalMsg += `• توصيل (${_curFlow?.governorate ?? 'التوصيل'}): ${(_bkFeeNow / 1000).toFixed(0)} الف\n`;
              _totalMsg += `──────────\n💰 المجموع: ${_bkGrandNow.toLocaleString('en-US')} دينار\n\n`;
            } else {
              _totalMsg += `──────────\n💰 سعر المنتج: ${_bkTotalItemNow.toLocaleString('en-US')} دينار\n\n`;
            }
            _totalMsg += '📱 عيني للحجز دزيلنا رقمك (07XXXXXXXXX) 😊';
            await sendMsg(_totalMsg);
            senderConvFlowMap.set(senderId, {
              ...(senderConvFlowMap.get(senderId) ?? { step: 'booking_collect_info', products: _ctxProds }),
              step: 'booking_collect_info',
              products: _ctxProds,
            });
            await db.insert(chatMessagesTable).values({ id: randomUUID(), conversationId: convId, role: 'assistant', content: _totalMsg }).catch(() => {});
            await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
            return;
          }

          // B6b. BOOKING INTENT but no product context → ask to send image ─────
          if (isBookingIntent(_normTxt)) {
            const _noImgMsg = 'عيني أرسلي صورة الموديل اللي تريديه 😊';
            await sendMsg(_noImgMsg);
            await db.insert(chatMessagesTable).values({ id: randomUUID(), conversationId: convId, role: 'assistant', content: _noImgMsg }).catch(() => {});
            await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
            return;
          }

          // B8. FALLBACK → AI for general conversation ─────────────────────────────
          {
            // B8a: saved replies inside B8 (redundant safety — B-Zero should catch first)
            const _b8Replies = repliesCache.get() ?? await (async () => {
              const d = await db.select().from(savedRepliesTable)
                .where(eq(savedRepliesTable.isActive, true))
                .orderBy(asc(savedRepliesTable.id));
              repliesCache.set(d);
              return d;
            })();
            const _b8Match = getSavedReplyMatch(txt, _b8Replies);
            if (_b8Match) {
              const isArLang = settings.language !== 'en';
              let _savedReplyText = isArLang ? _b8Match.replyAr : _b8Match.replyEn;
              if (_savedReplyText.includes('{أسعار_التوصيل}') || _savedReplyText.includes('{delivery_fees}')) {
                const _dlvMapB8: Record<string, number> = (() => { try { return settings.deliveryFees ? JSON.parse(settings.deliveryFees) : {}; } catch { return {}; } })();
                const _dlvListB8 = Object.entries(_dlvMapB8).map(([p, c]) => `${p}: ${c / 1000} الف`).join(' | ') || '—';
                _savedReplyText = _savedReplyText
                  .replace(/\{أسعار_التوصيل\}/g, _dlvListB8)
                  .replace(/\{delivery_fees\}/g, _dlvListB8);
              }
              console.log(`[B8_REPLY_MATCH] keyword="${_b8Match.matchedKeyword}" → saved reply used`);
              await sendMsg(_savedReplyText);
              await db.insert(chatMessagesTable).values({ id: randomUUID(), conversationId: convId, role: 'assistant', content: _savedReplyText }).catch(() => {});
              const _hist2b = senderConversationHistory.get(senderId) ?? [];
              _hist2b.push({ role: 'user', content: txt || '[رسالة]' });
              _hist2b.push({ role: 'assistant', content: _savedReplyText });
              if (_hist2b.length > MAX_CONV_HISTORY) _hist2b.splice(0, _hist2b.length - MAX_CONV_HISTORY);
              senderConversationHistory.set(senderId, _hist2b);
              await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
              return;
            }

            // B8b: No saved reply → use AI
            const _aiHist = senderConversationHistory.get(senderId) ?? [];
            const _dlvM2: Record<string, number> = (() => { try { return settings.deliveryFees ? JSON.parse(settings.deliveryFees) : {}; } catch { return {}; } })();
            const _dlvStr = Object.entries(_dlvM2).map(([p, c]) => `${p}: ${c / 1000}الف`).join(' | ') || 'تواصل معنا';
            // Context hint when product already identified
            const _ctxHint = _ctxProds.length > 0
              ? `\nملاحظة: الزبون عندها موديل محدد. أجيبي على سؤالها فقط، ولا تطلبين صورة ولا تذكرين الموديل مجدداً.`
              : '';
            // General Q&A knowledge base from settings
            const _qaSection = (settings as any).generalQaText?.trim()
              ? `\n\n=== قاعدة المعرفة (ردود مرجعية — اتبعيها عند الحاجة) ===\n${(settings as any).generalQaText.trim()}\n=== نهاية قاعدة المعرفة ===`
              : '';

            const _fbMsgs: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
              { role: 'system', content: `أنت مساعدة ودية لمتجر SONBOLA ملابس أطفال في العراق (sonbola.shop). تكلمي بالعربية العراقية الودية. ردود قصيرة ومباشرة ولطيفة.
قواعد صارمة:
- ممنوع تسألين عن العمر أو السعر أو الموديل ابداً
- لا تتكلمي عن موديلات محددة إلا إذا ذكرها الزبون
- لا تخترعي معلومات عن منتجات
- إذا الزبون سأل عن سعر أو عمر بدون سياق → قولي "أرسلي صورة الموديل عيني وأحدثلج 😊"
- للأسئلة العامة (ترحيب، استفسار عن المتجر، التوصيل، أوقات العمل، الخامات، الألوان) → رد بشكل طبيعي
- لا تستخدمي كلمات تقنية أبداً
- ممنوع منعاً باتاً أن تقولي أي جملة من نوع "رح ندزلج قياس" أو "ستندر" أو "ستاندر" أو "راهي ستندر" أو أي وعد بإرسال قياس محدد — هذا القرار للموظفين فقط وليس للبوت
- ممنوع تعطين أي وعد بإرسال مقاس أو حجم معين — إذا الزبون سأل عن مقاس بعمرين متقاربين قولي فقط "موظف المخزن رح يساعدج عيني 😊"
أسعار التوصيل: ${_dlvStr}${_ctxHint}${_qaSection}` },
              ..._aiHist.slice(-100).map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
              { role: 'user', content: txt || '[رسالة]' },
            ];

            let _fbReply = '';
            try {
              const _fc = await openai.chat.completions.create({ model: 'gpt-4o-mini', messages: _fbMsgs, max_completion_tokens: 250, temperature: 0.5 });
              _fbReply = _fc.choices[0]?.message?.content || '';
            } catch (_err: any) {
              console.log(`[SM_AI_ERR] ${_err?.message?.slice(0, 80)}`);
              _fbReply = 'عيني لحظة، في مشكلة تقنية، حاولي مرة ثانية 😊';
            }

            if (_fbReply) {
              await sendMsg(_fbReply);
              await db.insert(chatMessagesTable).values({ id: randomUUID(), conversationId: convId, role: 'assistant', content: _fbReply }).catch(() => {});
            }

            const _hist2 = senderConversationHistory.get(senderId) ?? [];
            _hist2.push({ role: 'user', content: txt || '[رسالة]' });
            if (_fbReply) _hist2.push({ role: 'assistant', content: _fbReply });
            if (_hist2.length > MAX_CONV_HISTORY) _hist2.splice(0, _hist2.length - MAX_CONV_HISTORY);
            senderConversationHistory.set(senderId, _hist2);
          }

          await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
          return;
        }
        // ── End Instagram Conversational AI ──────────────────────────────────────

        // ── Welcome Flow ──────────────────────────────────────────────────────────

          // ── Complaint keyword detection (uses module-level MENU_RETURN_KEYWORDS) ─
          const normMsg = normalizeArabic((messageText || "").toLowerCase());
          const isReturnComplaint = MENU_RETURN_KEYWORDS.some(kw =>
            normMsg.includes(normalizeArabic(kw))
          );

          // Reuse the complaint state already fetched above (no extra DB query needed)
          const isFollowUpComplaint = isConversationInComplaintMode;

          // ── Reset phrase (HIGHEST PRIORITY): "تم حل المشكلة" → fresh customer ─
          // Must be checked BEFORE complaint keywords because "مشكلة" is in keywords
          const RESET_PHRASES = ["تم حل المشكلة", "تم الحل", "حلت المشكلة", "انحلت المشكلة"];
          const isResolved = RESET_PHRASES.some(p =>
            normMsg.includes(normalizeArabic(p))
          );
          if (isResolved) {
            // Fall through to welcome steps — treat as brand-new customer
            console.log(`[RETURN_COMPLAINT] Reset phrase "${messageText.slice(0, 40)}" — skipping complaint checks`);
          } else {

          // ── Case 1: Complaint keyword → escalate + notify admin ───────────────
          if (isReturnComplaint) {
            console.log(`[RETURN_COMPLAINT] Detected from ${senderId}: "${messageText.slice(0, 60)}"`);
            const customerMsg = "رح انقل الرسالة للادارة عيني 💚\nرح نحل المشكلة ان شاء الله 🙏";
            if (settings.metaAccessToken && settings.facebookPageId) {
              await sendMetaMessage(senderId, settings.facebookPageId, settings.metaAccessToken,
                customerMsg, platform, settings.instagramAccountId, settings.instagramAccessToken, settings.metaAppSecret);
              await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
            }
            await db.insert(chatMessagesTable).values({
              id: randomUUID(), conversationId: convId, role: "assistant", content: customerMsg,
            }).catch(() => {});
            // Notify admin via Telegram
            if (settings.telegramBotToken && settings.telegramChatId) {
              await sendTelegramNotification(
                settings.telegramBotToken, settings.telegramChatId,
                `🔄 <b>مشكلة تبديل / ترجيع</b>\n👤 <code>${escHtml(senderId)}</code>\n📱 ${escHtml(platform)}\n💬 "${escHtml(messageText.slice(0, 300))}"`,
                [[{ text: "فتح المحادثة 📩", url: `https://business.facebook.com/latest/inbox/messenger?selected_item_id=${senderId}` }]],
              ).catch(() => {});
            }
            // Notify admin via WhatsApp (Twilio)
            const twSid = (settings as any).twilioAccountSid;
            const twToken = (settings as any).twilioAuthToken;
            const twFrom = (settings as any).twilioFromNumber;
            if (twSid && twToken && twFrom) {
              await sendTwilioAlert(twSid, twToken, twFrom,
                `+964${OWNER_WHATSAPP.replace(/^0/, "")}`,
                `مشكلة 🔄 ${platform} — ${senderId}\n${messageText.slice(0, 200)}`).catch(() => {});
            }
            return;
          }

          // ── Case 2: Follow-up after complaint → short holding message ─────────
          if (isFollowUpComplaint) {
            console.log(`[RETURN_COMPLAINT] Follow-up from ${senderId} — sending holding message`);
            const holdingMsg = "لحظات عيوني 💚\nرح نحل المشكلة ان شاء الله 🙏";
            if (settings.metaAccessToken && settings.facebookPageId) {
              await sendMetaMessage(senderId, settings.facebookPageId, settings.metaAccessToken,
                holdingMsg, platform, settings.instagramAccountId, settings.instagramAccessToken, settings.metaAppSecret);
              await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
            }
            await db.insert(chatMessagesTable).values({
              id: randomUUID(), conversationId: convId, role: "assistant", content: holdingMsg,
            }).catch(() => {});
            return;
          }

          } // end else (not resolved)

          // ── Case 3: Normal message → send mode selection, then language, then menu ──
          // Skip welcome flow entirely if booking already completed
          if (existingSession && existingSession.stage === 'complete') {
            await markMetaSeen(senderId, settings.facebookPageId!, settings.metaAccessToken!).catch(() => {});
            return;
          }

          if (settings.metaAccessToken && settings.facebookPageId) {
            // Always carousel mode — auto-set if not already set
            if (!senderModeMap.get(senderId)) {
              senderModeMap.set(senderId, 'carousel');
            }
            const resolvedMode = senderModeMap.get(senderId);

            if (resolvedMode === 'carousel' && !pendingAgeSelectSet.has(senderId)) {
              // Cooldown check — skip if greeting was sent recently (user typed multiple msgs fast)
              const lastGreet = recentGreetingMap.get(senderId);
              if (lastGreet && Date.now() - lastGreet < GREETING_COOLDOWN_MS) {
                console.log(`[WELCOME_DEDUP] Skipping duplicate greeting for ${senderId} (${Math.round((Date.now() - lastGreet) / 1000)}s ago)`);
                await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
                return;
              }
              recentGreetingMap.set(senderId, Date.now());

              // ── RETURNING USER: already welcomed — fall through to conversational AI ──
              if (welcomedSendersSet.has(senderId)) {
                console.log(`[WELCOME_FLOW] returning user ${senderId} — skipping re-welcome, AI handles`);
                // Don't return — let the message fall through to the conversational AI section
                return;
              }

              // ── FIRST TIME: send simple greeting — AI will handle questions ──
              console.log(`[WELCOME_FLOW] greeting only — ${senderId} (conversational AI handles the rest)`);
              welcomedSendersSet.add(senderId);
              const menuLang = senderLangMap.get(senderId) ?? 'ar';
              const greetMsg = menuLang === 'ku'
                ? 'بەخێربێن 🌸 سونبولة — جلوبەرگی منداڵان\nعیني، چی پێویستت هەیە؟ دەتوانی وێنەی بەرهەمەکان بنێرمەو نرخ و تەمەنەکانیان بزانی 😊'
                : 'أهلا وسهلا عيني 🌸\nتقدرين ترسلين صورة أي موديل وأحدثلج بالسعر والأعمار، أو تسأليني عن أي شي 😊';
              await sendMetaMessage(senderId, settings.facebookPageId, settings.metaAccessToken,
                greetMsg, platform, settings.instagramAccountId, settings.instagramAccessToken, settings.metaAppSecret);
            }
            await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
          }
          return; // welcome flow handled — no AI or saved replies

        // ── Saved replies (keyword matching — fires before any AI call) ──────────
        if (txt.length > 0) {
          const earlySavedReplies = repliesCache.get() ?? await (async () => {
            const d = await db.select().from(savedRepliesTable)
              .where(eq(savedRepliesTable.isActive, true))
              .orderBy(asc(savedRepliesTable.id));
            repliesCache.set(d);
            return d;
          })();

          const matchedReply = getSavedReplyMatch(txt, earlySavedReplies);
          if (matchedReply) {
            const isArLang = settings.language !== "en";
            let savedReplyText = isArLang ? matchedReply.replyAr : matchedReply.replyEn;

            if (savedReplyText.includes("{أسعار_التوصيل}") || savedReplyText.includes("{delivery_fees}")) {
              const dlvMap: Record<string, number> = (() => {
                try { return settings.deliveryFees ? JSON.parse(settings.deliveryFees) : {}; }
                catch { return {}; }
              })();
              const feesList = Object.entries(dlvMap)
                .map(([p, c]) => `${p}: ${c / 1000} الف`)
                .join(" | ");
              savedReplyText = savedReplyText
                .replace(/\{أسعار_التوصيل\}/g, feesList || "—")
                .replace(/\{delivery_fees\}/g, feesList || "—");
            }

            console.log(`[REPLY_MATCH] Found keyword "${matchedReply.matchedKeyword}" → "${matchedReply.titleAr}" — sending saved response`);
            if (settings.metaAccessToken && settings.facebookPageId) {
              await sendMetaMessage(senderId, settings.facebookPageId, settings.metaAccessToken,
                savedReplyText, platform, settings.instagramAccountId, settings.instagramAccessToken, settings.metaAppSecret);
              await markMetaSeen(senderId, settings.facebookPageId, settings.metaAccessToken).catch(() => {});
            }
            await db.insert(chatMessagesTable).values({
              id: randomUUID(), conversationId: convId, role: "assistant", content: savedReplyText,
            }).catch(() => {});
            return;
          }
          if (!imageUrl) {
            console.log(`[REPLY_MATCH] No keyword match for: "${txt.slice(0, 60)}" — going silent (no image)`);
            await markMetaSeen(senderId, settings.facebookPageId!, settings.metaAccessToken!).catch(() => {});
            return;
          }
          console.log(`[REPLY_MATCH] No keyword match but imageUrl present — proceeding to AI vision`);
        }

        // ── No text and no image → nothing to do ──────────────────────────────
        if (!imageUrl) {
          await markMetaSeen(senderId, settings.facebookPageId!, settings.metaAccessToken!).catch(() => {});
          return;
        }


        // ── AI Vision: identify product from customer's image ─────────────────
        // At this point imageUrl is guaranteed to be present (non-image messages were dropped above)
        const visionProducts = productsCache.get() ?? await (async () => {
          const d = await db.select().from(inventoryTable).where(eq(inventoryTable.available, true));
          productsCache.set(d);
          return d;
        })();

        let productsWithImages = visionProducts.filter((p: any) => p.publicImageUrl);
        if (productsWithImages.length === 0) {
          console.log(`[VISION] No products with images in inventory — cannot identify product`);
          await markMetaSeen(senderId, settings.facebookPageId!, settings.metaAccessToken!).catch(() => {});
          return;
        }

        // ── Cost optimisation: filter by sender's current season/gender, cap at 10 ──
        const visitorSeason = senderSeasonMap.get(senderId);
        const visitorGender = senderGenderMap.get(senderId);
        if (visitorSeason || visitorGender) {
          const filtered = productsWithImages.filter((p: any) => {
            const seasonOk = !visitorSeason || (p.season && p.season === visitorSeason);
            const genderOk = !visitorGender || (p.gender && (p.gender === visitorGender || p.gender === 'both'));
            return seasonOk && genderOk;
          });
          if (filtered.length > 0) productsWithImages = filtered;
        }
        // Cap at 10 products max to reduce token cost
        const MAX_VISION_PRODUCTS = 10;
        if (productsWithImages.length > MAX_VISION_PRODUCTS) {
          productsWithImages = productsWithImages.slice(0, MAX_VISION_PRODUCTS);
        }

        console.log(`[VISION] Comparing customer image from ${senderId} against ${productsWithImages.length} products (season=${visitorSeason || 'any'} gender=${visitorGender || 'any'})`);

        const formatPriceVision = (price: any): string => {
          const n = Number(price);
          if (isNaN(n) || n === 0) return "غير محدد";
          return n >= 1000 ? `${(n / 1000).toFixed(0)} الف` : `${n}`;
        };

        const visionContent: any[] = [
          {
            type: "text",
            text: `صور مرجعية من المخزون (${productsWithImages.length} منتج). قارن صورة الزبون مع هذه الصور وأجب بـ [SEND_PRODUCTS:كود] إذا وجدت تطابقاً جيداً. ممنوع اختراع كود غير موجود في القائمة.`,
          },
        ];

        for (const p of productsWithImages) {
          const pa = p as any;
          let ageLabel = `${pa.ageMin ?? "—"}-${pa.ageMax ?? "—"}`;
          try {
            const r = pa.ageRanges ? JSON.parse(pa.ageRanges) : null;
            if (Array.isArray(r) && r.length > 0) ageLabel = r.map((x: any) => `${x.min}-${x.max}`).join("،");
          } catch {}
          visionContent.push({
            type: "text",
            text: `▪ كود: ${p.productId} | ${pa.nameAr || p.category} | ${p.gender} | أعمار: ${ageLabel} | سعر: ${formatPriceVision(p.price)} | ألوان: ${pa.colors || "—"}`,
          });
          visionContent.push({ type: "image_url", image_url: { url: p.publicImageUrl!, detail: "low" } });
        }

        // Add customer's image
        const visionImageSrc = imageBase64
          ? `data:${imageContentType};base64,${imageBase64}`
          : imageUrl;
        visionContent.push({ type: "image_url", image_url: { url: visionImageSrc, detail: "high" } });
        visionContent.push({
          type: "text",
          text: "هذه صورة الزبون — حدد الكود الأقرب تطابقاً وأضف [SEND_PRODUCTS:كود] في ردك، ثم اذكر السعر والأعمار المناسبة بجملة واحدة. إذا لم يكن هناك تطابق واضح أجب: لم أتمكن من تحديد الموديل.",
        });

        const visionModel = (settings as any).aiModelImage ?? "gpt-4o-mini";
        const visionCompletion = await openai.chat.completions.create({
          model: visionModel,
          messages: [{ role: "user", content: visionContent }],
          max_completion_tokens: 200,
          temperature: 0.2,
        });

        const rawVisionReply = visionCompletion.choices[0]?.message?.content || "";
        const { cleanReply: visionReply, productIds: visionProductIds } = parseSendProductsTag(rawVisionReply);
        console.log(`[VISION] Reply: "${visionReply.slice(0, 100)}" products=${visionProductIds?.join(",") || "none"}`);

        const replyText = visionReply || "لم أتمكن من تحديد الموديل، يمكنك إرسال صورة أوضح.";

        // Save assistant message
        await db.insert(chatMessagesTable).values({
          id: randomUUID(), conversationId: convId, role: "assistant", content: replyText,
        }).catch(() => {});

        // Send text reply
        if (settings.metaAccessToken && settings.facebookPageId) {
          await sendMetaMessage(senderId, settings.facebookPageId, settings.metaAccessToken,
            replyText, platform, settings.instagramAccountId, settings.instagramAccessToken, settings.metaAppSecret);
        }

        // Send product image(s) identified by vision
        if (visionProductIds && visionProductIds.length > 0 && settings.metaAccessToken && settings.facebookPageId) {
          const missingImageCodes: string[] = [];
          for (const code of visionProductIds) {
            const matched = visionProducts.find((p: any) =>
              p.productId?.toLowerCase() === code.toLowerCase() ||
              (p as any).code?.toLowerCase() === code.toLowerCase()
            );
            const imgUrl = matched?.publicImageUrl ?? null;
            if (imgUrl) {
              try {
                await sendMetaImage(
                  senderId, settings.facebookPageId, settings.metaAccessToken,
                  imgUrl, platform, settings.instagramAccountId, settings.instagramAccessToken, settings.metaAppSecret,
                );
                console.log(`[VISION_IMG] ✓ Sent image for code=${code}`);
                await new Promise(r => setTimeout(r, 400));
              } catch (imgErr: any) {
                console.log(`[VISION_IMG_FAIL] code=${code}: ${imgErr?.message?.slice(0, 200)}`);
              }
            } else {
              missingImageCodes.push(code);
              console.log(`[VISION_IMG_SKIP] code=${code} — no publicImageUrl`);
            }
          }
          if (missingImageCodes.length > 0) {
            await sendMetaMessage(senderId, settings.facebookPageId, settings.metaAccessToken,
              "عيني لحظة أشيك على الصور بالمخزن", platform, settings.instagramAccountId, settings.instagramAccessToken).catch(() => {});
            if (settings.telegramBotToken && settings.telegramChatId) {
              await sendTelegramNotification(settings.telegramBotToken, settings.telegramChatId,
                `⚠️ منتجات بدون صورة في المخزن:\n${missingImageCodes.map(c => `• ${c}`).join("\n")}\nالزبون: ${senderId}\nيرجى رفع صور لهذه الموديلات في لوحة التحكم`,
                buildConvButtons(senderId),
              ).catch(() => {});
            }
          }
        }


        }); // end queueForSender — processing for this message is queued
      }
    }
  } catch (err: any) {
    console.log("[WH ERROR]", err?.message || String(err), err?.stack?.split('\n').slice(0,3).join(' | '));
  }
});

export default router;
