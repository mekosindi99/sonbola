import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { settingsTable, inventoryTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import nodemailer from "nodemailer";
import { ObjectStorageService } from "../lib/objectStorage";

const objectStorageService = new ObjectStorageService();

async function uploadBannerImage(base64: string): Promise<string | null> {
  try {
    const base64Data = base64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const uploadResponse = await fetch(uploadURL, {
      method: "PUT", body: buffer, headers: { "Content-Type": "image/png" },
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

// Recovery WhatsApp number (owner)
const RECOVERY_WHATSAPP = "+9647503981573";
// Default recovery email (owner)
const DEFAULT_RECOVERY_EMAIL = "mathelove1@gmail.com";

async function ensureDefaultSettings() {
  const existing = await db.select().from(settingsTable).limit(1);
  if (existing.length === 0) {
    await db.insert(settingsTable).values({
      botEnabled: false,
      schedulerEnabled: false,
      scheduleStart: "12:00",
      scheduleEnd: "17:00",
      ageFilterMin: 1,
      ageFilterMax: 4,
      language: "both",
    });
  }
  return db.select().from(settingsTable).limit(1);
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function sendWhatsappOtp(accountSid: string, authToken: string, fromNumber: string, otp: string) {
  const from = fromNumber.startsWith("whatsapp:") ? fromNumber : `whatsapp:${fromNumber}`;
  const to = RECOVERY_WHATSAPP.startsWith("whatsapp:") ? RECOVERY_WHATSAPP : `whatsapp:${RECOVERY_WHATSAPP}`;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const body = `🔑 رمز استعادة كلمة المرور — Sonbola Admin\n\nالرمز: *${otp}*\n\nصالح لمدة 10 دقائق. لا تشاركه مع أحد.`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ From: from, To: to, Body: body }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Twilio error: ${txt}`);
  }
}

async function sendEmailOtp(smtpUser: string, smtpPass: string, toEmail: string, otp: string) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: smtpUser, pass: smtpPass },
  });
  await transporter.sendMail({
    from: `"Sonbola Admin" <${smtpUser}>`,
    to: toEmail,
    subject: "رمز استعادة كلمة المرور — Sonbola",
    html: `
      <div dir="rtl" style="font-family:sans-serif;max-width:400px;margin:auto;padding:24px;border-radius:12px;background:#f9f9f9">
        <h2 style="color:#6c3fc5">🔑 رمز استعادة كلمة المرور</h2>
        <p>استخدم الرمز التالي لإعادة تعيين كلمة مرور لوحة إدارة Sonbola:</p>
        <div style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#6c3fc5;background:#ede9fe;padding:16px;border-radius:8px;text-align:center">${otp}</div>
        <p style="color:#666;font-size:13px;margin-top:16px">الرمز صالح لمدة 10 دقائق. لا تشاركه مع أحد.</p>
      </div>
    `,
  });
}

// ─── Admin Login ────────────────────────────────────────────────────────────
router.post("/beqolky/login", async (req, res) => {
  const { password } = req.body as { password?: string };
  const rows = await db.select().from(settingsTable).limit(1);
  const dbPassword = rows[0]?.adminPassword;
  const adminPassword = dbPassword || process.env.ADMIN_PASSWORD || "sonbola2026";
  if (!password || password !== adminPassword) {
    return res.status(401).json({ error: "كلمة المرور غير صحيحة" });
  }
  return res.json({ success: true });
});

// ─── Change Admin Password ───────────────────────────────────────────────────
router.post("/beqolky/change-password", async (req, res) => {
  const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: "يجب أن تكون كلمة المرور الجديدة 6 أحرف على الأقل" });
  }
  const rows = await db.select().from(settingsTable).limit(1);
  const dbPassword = rows[0]?.adminPassword;
  const adminPassword = dbPassword || process.env.ADMIN_PASSWORD || "sonbola2026";
  if (!currentPassword || currentPassword !== adminPassword) {
    return res.status(401).json({ error: "كلمة المرور الحالية غير صحيحة" });
  }
  if (rows.length === 0) {
    await db.insert(settingsTable).values({ adminPassword: newPassword, botEnabled: false, language: "both" });
  } else {
    await db.update(settingsTable).set({ adminPassword: newPassword }).where(eq(settingsTable.id, rows[0].id));
  }
  return res.json({ success: true });
});

// ─── Forgot Password — Send OTP ─────────────────────────────────────────────
router.post("/beqolky/forgot-password", async (req, res) => {
  const { method } = req.body as { method?: "whatsapp" | "email" };
  const rows = await db.select().from(settingsTable).limit(1);
  const settings = rows[0];

  const otp = generateOtp();
  const expiry = Date.now() + 10 * 60 * 1000; // 10 minutes

  if (method === "whatsapp") {
    if (!settings?.twilioAccountSid || !settings?.twilioAuthToken || !settings?.twilioFromNumber) {
      return res.status(400).json({ error: "إعدادات Twilio غير مكتملة. أكملها من الإعدادات." });
    }
    try {
      await sendWhatsappOtp(settings.twilioAccountSid, settings.twilioAuthToken, settings.twilioFromNumber, otp);
    } catch (e: any) {
      return res.status(500).json({ error: "فشل إرسال الرسالة عبر واتساب: " + (e.message || "") });
    }
  } else if (method === "email") {
    const toEmail = settings?.recoveryEmail || DEFAULT_RECOVERY_EMAIL;
    if (!settings?.smtpUser || !settings?.smtpPass) {
      return res.status(400).json({ error: "يجب ضبط Gmail وكلمة مرور التطبيق في صفحة الإعدادات." });
    }
    try {
      await sendEmailOtp(settings.smtpUser, settings.smtpPass, toEmail, otp);
    } catch (e: any) {
      return res.status(500).json({ error: "فشل إرسال البريد الإلكتروني: " + (e.message || "") });
    }
  } else {
    return res.status(400).json({ error: "طريقة غير صالحة" });
  }

  // Save OTP
  if (settings) {
    await db.update(settingsTable).set({ resetOtp: otp, resetOtpExpiry: expiry }).where(eq(settingsTable.id, settings.id));
  } else {
    await db.insert(settingsTable).values({ resetOtp: otp, resetOtpExpiry: expiry, botEnabled: false, language: "both" });
  }

  return res.json({ success: true, sent: method });
});

// ─── Forgot Password — Recovery Key ─────────────────────────────────────────
router.post("/beqolky/verify-recovery-key", async (req, res) => {
  const { recoveryKey, newPassword } = req.body as { recoveryKey?: string; newPassword?: string };
  if (!recoveryKey || !newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: "بيانات غير صحيحة" });
  }
  const rows = await db.select().from(settingsTable).limit(1);
  const settings = rows[0];
  const storedKey = settings?.recoveryKey;
  if (!storedKey) {
    return res.status(400).json({ error: "رمز الاسترداد غير مُفعّل — تواصل مع الدعم" });
  }
  if (recoveryKey.toUpperCase() !== storedKey) {
    return res.status(400).json({ error: "رمز الاسترداد غير صحيح" });
  }
  // Generate a new recovery key after use (one-time use)
  const newKey = Array.from({ length: 3 }, () => Math.random().toString(36).substring(2, 6).toUpperCase()).join('-');
  await db.update(settingsTable).set({ adminPassword: newPassword, recoveryKey: newKey }).where(eq(settingsTable.id, settings.id));
  return res.json({ success: true });
});

router.post("/beqolky/regenerate-recovery-key", async (req, res) => {
  const rows = await db.select().from(settingsTable).limit(1);
  if (rows.length === 0) return res.status(404).json({ error: "لا توجد إعدادات" });
  const newKey = Array.from({ length: 3 }, () => Math.random().toString(36).substring(2, 6).toUpperCase()).join('-');
  await db.update(settingsTable).set({ recoveryKey: newKey }).where(eq(settingsTable.id, rows[0].id));
  return res.json({ success: true, recoveryKey: newKey });
});

router.get("/beqolky/recovery-key", async (req, res) => {
  const rows = await db.select().from(settingsTable).limit(1);
  const key = rows[0]?.recoveryKey || null;
  return res.json({ recoveryKey: key });
});

// ─── Forgot Password — Verify OTP + Reset ────────────────────────────────────
router.post("/beqolky/verify-otp", async (req, res) => {
  const { otp, newPassword } = req.body as { otp?: string; newPassword?: string };
  if (!otp || !newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: "بيانات غير صحيحة" });
  }
  const rows = await db.select().from(settingsTable).limit(1);
  const settings = rows[0];
  if (!settings?.resetOtp || !settings?.resetOtpExpiry) {
    return res.status(400).json({ error: "لا يوجد رمز نشط. أعد إرسال الرمز." });
  }
  if (Date.now() > settings.resetOtpExpiry) {
    return res.status(400).json({ error: "انتهت صلاحية الرمز. أعد إرسال الرمز." });
  }
  if (otp !== settings.resetOtp) {
    return res.status(400).json({ error: "الرمز غير صحيح" });
  }
  await db.update(settingsTable).set({ adminPassword: newPassword, resetOtp: null, resetOtpExpiry: null }).where(eq(settingsTable.id, settings.id));
  return res.json({ success: true });
});

router.post("/beqolky/upload-banner-image", async (req, res) => {
  try {
    const { image } = req.body as { image: string };
    if (!image) return res.status(400).json({ error: "No image" });
    const url = await uploadBannerImage(image);
    if (!url) return res.status(500).json({ error: "Upload failed" });
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: "Upload failed" });
  }
});

router.get("/settings", async (req, res) => {
  try {
    const rows = await ensureDefaultSettings();
    res.json(rows[0]);
  } catch (err) {
    req.log.error({ err }, "Failed to get settings");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/settings", async (req, res) => {
  try {
    const rows = await ensureDefaultSettings();
    const id = rows[0].id;
    const body = req.body;

    const updated = await db
      .update(settingsTable)
      .set({
        botEnabled: body.botEnabled ?? rows[0].botEnabled,
        facebookBotEnabled: body.facebookBotEnabled ?? rows[0].facebookBotEnabled,
        instagramBotEnabled: body.instagramBotEnabled ?? rows[0].instagramBotEnabled,
        shadowLearningEnabled: body.shadowLearningEnabled ?? rows[0].shadowLearningEnabled,
        schedulerEnabled: body.schedulerEnabled ?? rows[0].schedulerEnabled,
        scheduleStart: body.scheduleStart ?? rows[0].scheduleStart,
        scheduleEnd: body.scheduleEnd ?? rows[0].scheduleEnd,
        ageFilterMin: body.ageFilterMin ?? rows[0].ageFilterMin,
        ageFilterMax: body.ageFilterMax ?? rows[0].ageFilterMax,
        customAgeFilter: body.customAgeFilter !== undefined ? body.customAgeFilter : rows[0].customAgeFilter,
        facebookPageId: body.facebookPageId !== undefined ? body.facebookPageId : rows[0].facebookPageId,
        instagramAccountId: body.instagramAccountId !== undefined ? body.instagramAccountId : rows[0].instagramAccountId,
        metaAccessToken: body.metaAccessToken !== undefined ? body.metaAccessToken : rows[0].metaAccessToken,
        instagramAccessToken: body.instagramAccessToken !== undefined ? body.instagramAccessToken : rows[0].instagramAccessToken,
        whatsappAdminNumber: body.whatsappAdminNumber !== undefined ? body.whatsappAdminNumber : rows[0].whatsappAdminNumber,
        webhookVerifyToken: body.webhookVerifyToken !== undefined ? body.webhookVerifyToken : rows[0].webhookVerifyToken,
        tokenExpiresAt: body.tokenExpiresAt !== undefined ? Number(body.tokenExpiresAt) : rows[0].tokenExpiresAt,
        twilioAccountSid: body.twilioAccountSid !== undefined ? body.twilioAccountSid : rows[0].twilioAccountSid,
        twilioAuthToken: body.twilioAuthToken !== undefined ? body.twilioAuthToken : rows[0].twilioAuthToken,
        twilioFromNumber: body.twilioFromNumber !== undefined ? body.twilioFromNumber : rows[0].twilioFromNumber,
        viberApiKey: body.viberApiKey !== undefined ? body.viberApiKey : rows[0].viberApiKey,
        telegramBotToken: body.telegramBotToken !== undefined ? body.telegramBotToken : rows[0].telegramBotToken,
        telegramChatId: body.telegramChatId !== undefined ? body.telegramChatId : rows[0].telegramChatId,
        language: body.language ?? rows[0].language,
        deliveryFees: body.deliveryFees !== undefined ? body.deliveryFees : rows[0].deliveryFees,
        storefrontSuggestions: body.storefrontSuggestions !== undefined ? body.storefrontSuggestions : rows[0].storefrontSuggestions,
        installBannerEnabled: body.installBannerEnabled !== undefined ? body.installBannerEnabled : rows[0].installBannerEnabled,
        installBannerMessage: body.installBannerMessage !== undefined ? body.installBannerMessage : rows[0].installBannerMessage,
        tickerMessages: body.tickerMessages !== undefined ? body.tickerMessages : rows[0].tickerMessages,
        tickerColors: body.tickerColors !== undefined ? body.tickerColors : (rows[0] as any).tickerColors ?? null,
        notesColors: body.notesColors !== undefined ? body.notesColors : (rows[0] as any).notesColors ?? null,
        btnAnimationType: body.btnAnimationType !== undefined ? body.btnAnimationType : rows[0].btnAnimationType,
        btnAnimations: body.btnAnimations !== undefined ? body.btnAnimations : rows[0].btnAnimations,
        recoveryEmail: body.recoveryEmail !== undefined ? body.recoveryEmail : rows[0].recoveryEmail,
        smtpUser: body.smtpUser !== undefined ? body.smtpUser : rows[0].smtpUser,
        smtpPass: body.smtpPass !== undefined ? body.smtpPass : rows[0].smtpPass,
        aiModelText:  body.aiModelText  !== undefined ? body.aiModelText  : rows[0].aiModelText,
        aiModelImage: body.aiModelImage !== undefined ? body.aiModelImage : rows[0].aiModelImage,
        cartLayout: body.cartLayout !== undefined ? body.cartLayout : rows[0].cartLayout,
        cartColors: body.cartColors !== undefined ? body.cartColors : rows[0].cartColors,
        storefrontGridLayout: body.storefrontGridLayout !== undefined ? body.storefrontGridLayout : (rows[0] as any).storefrontGridLayout ?? '2',
        storefrontNotes: body.storefrontNotes !== undefined ? body.storefrontNotes : (rows[0] as any).storefrontNotes ?? null,
        googleClientId: body.googleClientId !== undefined ? body.googleClientId : rows[0].googleClientId,
        jwtSecret: body.jwtSecret !== undefined ? body.jwtSecret : rows[0].jwtSecret,
        pwaArrowSettings: body.pwaArrowSettings !== undefined ? body.pwaArrowSettings : (rows[0] as any).pwaArrowSettings ?? null,
        footerSettings: body.footerSettings !== undefined ? body.footerSettings : (rows[0] as any).footerSettings ?? null,
        systemPromptOverride: body.systemPromptOverride !== undefined ? body.systemPromptOverride : rows[0].systemPromptOverride,
        historyWindowSize: body.historyWindowSize !== undefined ? Number(body.historyWindowSize) : rows[0].historyWindowSize,
        blacklistKeywords: body.blacklistKeywords !== undefined ? body.blacklistKeywords : rows[0].blacklistKeywords,
        slangMapper: body.slangMapper !== undefined ? body.slangMapper : rows[0].slangMapper,
        maintenanceMode: body.maintenanceMode !== undefined ? body.maintenanceMode : rows[0].maintenanceMode,
        disableSavedReplies: body.disableSavedReplies !== undefined ? body.disableSavedReplies : rows[0].disableSavedReplies,
        welcomeFlowEnabled: body.welcomeFlowEnabled !== undefined ? body.welcomeFlowEnabled : rows[0].welcomeFlowEnabled,
        welcomeMessages: body.welcomeMessages !== undefined ? body.welcomeMessages : rows[0].welcomeMessages,
        menuItems: body.menuItems !== undefined ? body.menuItems : (rows[0] as any).menuItems,
        menuLangPrompt: body.menuLangPrompt !== undefined ? body.menuLangPrompt : (rows[0] as any).menuLangPrompt,
        menuArPrompt: body.menuArPrompt !== undefined ? body.menuArPrompt : (rows[0] as any).menuArPrompt,
        menuKuPrompt: body.menuKuPrompt !== undefined ? body.menuKuPrompt : (rows[0] as any).menuKuPrompt,
        botMode: body.botMode !== undefined ? body.botMode : ((rows[0] as any).botMode ?? 'both'),
        tutorialVideoEnabled: body.tutorialVideoEnabled !== undefined ? body.tutorialVideoEnabled : (rows[0] as any).tutorialVideoEnabled ?? false,
        tutorialVideoUrl: body.tutorialVideoUrl !== undefined ? body.tutorialVideoUrl : (rows[0] as any).tutorialVideoUrl ?? null,
        tutorialImages: body.tutorialImages !== undefined ? body.tutorialImages : (rows[0] as any).tutorialImages ?? null,
        tutorialImagesEnabled: body.tutorialImagesEnabled !== undefined ? body.tutorialImagesEnabled : (rows[0] as any).tutorialImagesEnabled ?? false,
        generalQaText: body.generalQaText !== undefined ? body.generalQaText : (rows[0] as any).generalQaText ?? null,
        updatedAt: new Date(),
      })
      .where(eq(settingsTable.id, id))
      .returning();

    res.json(updated[0]);
  } catch (err) {
    req.log.error({ err }, "Failed to update settings");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Featured Slots helpers ──────────────────────────────────────────────────

/** Extract the stored codes array from raw JSON (supports old full-object format & new code-only format) */
function parseStoredCodes(raw: string | null | undefined): (string | null)[] {
  const codes: (string | null)[] = [null, null, null];
  if (!raw) return codes;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      parsed.slice(0, 3).forEach((item: any, i: number) => {
        if (item === null || item === undefined) codes[i] = null;
        else if (typeof item === "string") codes[i] = item || null;
        else if (typeof item === "object" && item.code) codes[i] = item.code; // backward-compat
      });
    }
  } catch {}
  return codes;
}

/** Build age string from inventory row — supports multiple age ranges */
function buildAgeString(p: { ageMin?: number | null; ageMax?: number | null; ageRanges?: string | null }): string {
  try {
    const r = p.ageRanges ? JSON.parse(p.ageRanges) : null;
    if (Array.isArray(r) && r.length > 0) return r.map((x: any) => `${x.min}-${x.max} سنة`).join("، ");
  } catch {}
  return `${p.ageMin ?? 0}-${p.ageMax ?? 0} سنة`;
}

/** Enrich a product code with live inventory data. Logs sync results. */
async function enrichSlotCode(code: string | null, slotNum: number): Promise<any> {
  if (!code) return null;
  const rows = await db.select().from(inventoryTable).where(eq(inventoryTable.productId, code)).limit(1);
  const p = rows[0];
  if (!p) {
    console.log(`[SYNC_WARNING] Slot ${slotNum}: Product ${code} not found in inventory, skipped.`);
    return null;
  }
  const imageUrl = p.publicImageUrl || null;
  if (!imageUrl) {
    console.log(`[SYNC_WARNING] Product ${code} is missing image, skipped.`);
  } else {
    console.log(`[SYNC_SUCCESS] Product ${code} data (price, image, age) is now linked directly to suggestions.`);
  }
  const salePrice = p.isOnSale && p.discountPrice ? String(p.discountPrice) : null;
  return {
    code: p.productId,
    imageUrl,
    age: buildAgeString(p),
    price: String(p.price || 0),
    salePrice,
    isOnSale: p.isOnSale ?? false,
    available: p.available ?? true,
    hasImage: !!imageUrl,
  };
}

// ── Featured Slots (3 product highlights for suggestions page) ──────────────

router.get("/featured-slots", async (req, res) => {
  try {
    const rows = await ensureDefaultSettings();
    const codes = parseStoredCodes(rows[0].storefrontSuggestions);
    const enriched = await Promise.all(codes.map((c, i) => enrichSlotCode(c, i + 1)));
    res.json(enriched);
  } catch (err) {
    req.log.error({ err }, "Failed to get featured slots");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/featured-slots", async (req, res) => {
  try {
    const rows = await ensureDefaultSettings();
    // Accept either array of codes ["S1", null, "S2"] or array of slot objects with .code
    const input = Array.isArray(req.body) ? req.body.slice(0, 3) : [null, null, null];
    const codes: (string | null)[] = input.map((item: any) => {
      if (!item) return null;
      if (typeof item === "string") return item || null;
      if (typeof item === "object" && item.code) return item.code as string;
      return null;
    });
    while (codes.length < 3) codes.push(null);
    await db.update(settingsTable)
      .set({ storefrontSuggestions: JSON.stringify(codes.slice(0, 3)), updatedAt: new Date() })
      .where(eq(settingsTable.id, rows[0].id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to save featured slots");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/featured-slots/from-product", async (req, res) => {
  try {
    const { productId, slotIndex } = req.body as { productId: string; slotIndex: number };
    const products = await db.select().from(inventoryTable).where(eq(inventoryTable.productId, productId)).limit(1);
    const p = products[0];
    if (!p) return res.status(404).json({ error: "Product not found" });

    // Save only the product code — live data fetched on demand
    const rows = await ensureDefaultSettings();
    const codes = parseStoredCodes(rows[0].storefrontSuggestions);
    const idx = typeof slotIndex === "number" ? Math.min(2, Math.max(0, slotIndex)) : 0;
    codes[idx] = p.productId;

    await db.update(settingsTable)
      .set({ storefrontSuggestions: JSON.stringify(codes.slice(0, 3)), updatedAt: new Date() })
      .where(eq(settingsTable.id, rows[0].id));

    const live = await enrichSlotCode(p.productId, idx + 1);
    res.json({ ok: true, slot: live });
  } catch (err) {
    req.log.error({ err }, "Failed to send product to featured slot");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Upload image for welcome flow steps ─────────────────────────────────────
router.post("/settings/upload-image", async (req, res) => {
  try {
    const { base64 } = req.body;
    if (!base64 || typeof base64 !== "string") {
      return res.status(400).json({ error: "base64 field required" });
    }
    const url = await uploadBannerImage(base64);
    if (!url) return res.status(500).json({ error: "Upload failed" });
    return res.json({ url });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Upload failed" });
  }
});

/** Exported helper: get 3 enriched featured slots (for bot use) */
export async function getFeaturedSlotsLive(): Promise<any[]> {
  try {
    const rows = await db.select().from(settingsTable).limit(1);
    if (!rows[0]) return [null, null, null];
    const codes = parseStoredCodes(rows[0].storefrontSuggestions);
    return await Promise.all(codes.map((c, i) => enrichSlotCode(c, i + 1)));
  } catch { return [null, null, null]; }
}

export default router;
