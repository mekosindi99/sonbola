import app from "./app";
import { logger } from "./lib/logger";
import { db } from "@workspace/db";
import { settingsTable, inventoryTable } from "@workspace/db/schema";
import { runLeadScoring } from "./lib/lead-scoring";
import { runScheduledResets } from "./routes/reset";
import { startInboxWorker } from "./lib/inbox-worker";
import { sql } from "drizzle-orm";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const META_API_VERSION = "v21.0";

/** Ensure instagram_access_token column exists in settings table */
async function runMigrations() {
  try {
    await db.execute(sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS instagram_access_token TEXT`);
    await db.execute(sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS storefront_grid_layout TEXT NOT NULL DEFAULT '2'`);
    await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS product_image_url TEXT`);
    await db.execute(sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS viber_api_key TEXT`);
    await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS receipt_image_url TEXT`);
    await db.execute(sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS telegram_bot_token TEXT`);
    await db.execute(sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT`);
    await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS sender_profile_pic_url TEXT`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS bot_suggestions (
        id SERIAL PRIMARY KEY,
        image_url TEXT NOT NULL,
        label TEXT,
        age_min_months INTEGER NOT NULL DEFAULT 0,
        age_max_months INTEGER NOT NULL DEFAULT 144,
        price NUMERIC(10,2) NOT NULL DEFAULT 0,
        is_available BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS bot_flows (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL DEFAULT 'فلو جديد',
        nodes TEXT NOT NULL DEFAULT '[]',
        edges TEXT NOT NULL DEFAULT '[]',
        is_active BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS disable_saved_replies BOOLEAN NOT NULL DEFAULT FALSE`);
    await db.execute(sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS welcome_flow_enabled BOOLEAN NOT NULL DEFAULT FALSE`);
    await db.execute(sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS welcome_messages TEXT`);
    await db.execute(sql`ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS welcome_flow_sent BOOLEAN NOT NULL DEFAULT FALSE`);
    await db.execute(sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS menu_items TEXT`);
    await db.execute(sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS menu_lang_prompt TEXT`);
    await db.execute(sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS storefront_notes TEXT`);
    await db.execute(sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS footer_settings TEXT`);
    await db.execute(sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS pwa_arrow_settings TEXT`);
    await db.execute(sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS bot_mode TEXT NOT NULL DEFAULT 'both'`);
    await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS receipt_token TEXT`);
    await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS delivery_cost NUMERIC(10,2)`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS site_bans (
        id SERIAL PRIMARY KEY,
        type TEXT NOT NULL,
        value TEXT NOT NULL UNIQUE,
        reason TEXT NOT NULL DEFAULT '',
        banned_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS bot_training_logs (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        images_analyzed INTEGER NOT NULL DEFAULT 1,
        notes_extracted INTEGER NOT NULL DEFAULT 0,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        cost_usd NUMERIC(10,6) NOT NULL DEFAULT 0
      )
    `);
  } catch (err: any) {
    console.log(`[STARTUP] Migration error: ${err?.message}`);
  }
}

/** Fix suggestion image_url values that used /uploads/ instead of /api/uploads/ */
async function fixSuggestionImageUrls() {
  try {
    const result = await db.execute(
      sql`UPDATE bot_suggestions
          SET image_url = REPLACE(image_url, '/uploads/suggestions/', '/api/uploads/suggestions/')
          WHERE image_url LIKE '%/uploads/suggestions/%'
            AND image_url NOT LIKE '%/api/uploads/suggestions/%'`
    );
    const updated = (result as any)?.rowCount ?? 0;
    if (updated > 0) {
      console.log(`[STARTUP] Fixed ${updated} suggestion image URLs (/uploads/ → /api/uploads/)`);
    }
  } catch (err: any) {
    console.log(`[STARTUP] fixSuggestionImageUrls error: ${err?.message}`);
  }
}

/** Fix malformed publicImageUrl values from old Replit deployment */
async function fixMalformedImageUrls() {
  try {
    const result = await db.execute(
      sql`UPDATE inventory
          SET public_image_url = REPLACE(public_image_url, 'business-suite-automation.replit.app,sonbola.shop', 'sonbola.shop')
          WHERE public_image_url LIKE 'https://business-suite-automation.replit.app,%'`
    );
    const updated = (result as any)?.rowCount ?? 0;
    if (updated > 0) {
      console.log(`[STARTUP] Fixed ${updated} malformed publicImageUrl entries`);
    }
  } catch (err: any) {
    console.log(`[STARTUP] fixMalformedImageUrls error: ${err?.message}`);
  }
}

async function autoReconnectWebhooks() {
  try {
    const rows = await db.select().from(settingsTable).limit(1);
    const settings = rows[0];
    if (!settings) return;

    const { metaAccessToken: pageToken, facebookPageId: pageId, metaAppId: appId, metaAppSecret: appSecret, webhookVerifyToken: verifyToken } = settings;
    const rawDomain = process.env.LOCAL_DOMAIN || "localhost:3000";
    const domains = rawDomain.split(",").map(d => d.trim()).filter(Boolean);
    const prodDomain = domains[0] || "";
    const isLocalhost = prodDomain.startsWith("localhost");
    const webhookUrl = prodDomain && !isLocalhost ? `https://${prodDomain}/api/webhook/meta` : null;

    // 1. Re-subscribe Facebook page to receive messages
    if (pageToken && pageId) {
      const r = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${pageId}/subscribed_apps`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          subscribed_fields: "messages,messaging_postbacks,messaging_optins,message_reads",
          access_token: pageToken,
        }).toString(),
      });
      const d = await r.json() as any;
      console.log(`[STARTUP] Facebook page subscription: ${d.success ? "✓ OK" : "✗ FAILED - " + d.error?.message}`);
    }

    // 2. Re-subscribe app webhook (page object) with App Token
    if (appId && appSecret && webhookUrl && verifyToken) {
      const appToken = `${appId}|${appSecret}`;
      const r = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${appId}/subscriptions`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          object: "page",
          callback_url: webhookUrl,
          verify_token: verifyToken,
          fields: "messages,messaging_postbacks,messaging_optins,message_reads",
          access_token: appToken,
        }).toString(),
      });
      const d = await r.json() as any;
      console.log(`[STARTUP] App webhook (page): ${d.success ? "✓ OK" : "✗ FAILED - " + d.error?.message}`);
    }

    // 3. Re-subscribe app webhook (instagram object) with App Token
    if (appId && appSecret && webhookUrl && verifyToken) {
      const appToken = `${appId}|${appSecret}`;
      const r = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${appId}/subscriptions`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          object: "instagram",
          callback_url: webhookUrl,
          verify_token: verifyToken,
          fields: "messages,messaging_postbacks,messaging_optins",
          access_token: appToken,
        }).toString(),
      });
      const d = await r.json() as any;
      console.log(`[STARTUP] App webhook (instagram): ${d.success ? "✓ OK" : "✗ FAILED - " + d.error?.message}`);
    }
  } catch (err: any) {
    console.log(`[STARTUP] Auto-reconnect error: ${err.message}`);
  }
}

/* ── Token Expiry + Telegram Alert ── */
async function checkTokenExpiry() {
  try {
    const rows = await db.select().from(settingsTable).limit(1);
    const s = rows[0];
    if (!s?.tokenExpiresAt) return;
    const now = Math.floor(Date.now() / 1000);
    const daysLeft = Math.floor((s.tokenExpiresAt - now) / 86400);
    if (daysLeft <= 7 && daysLeft >= 0) {
      console.log(`[TOKEN_EXPIRY] Token expires in ${daysLeft} days`);
      if (s.telegramBotToken && s.telegramChatId) {
        const msg = `⚠️ <b>تحذير — SONBOLA</b>\n\nتوكن Facebook/Instagram سينتهي خلال <b>${daysLeft} يوم</b>.\nيرجى تجديده من صفحة الإعدادات لتجنب توقف الخدمة.`;
        await fetch(`https://api.telegram.org/bot${s.telegramBotToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: s.telegramChatId, text: msg, parse_mode: "HTML" }),
          signal: AbortSignal.timeout(10_000),
        });
        console.log(`[TOKEN_EXPIRY] Telegram alert sent`);
      }
    }
  } catch (err: any) {
    console.log(`[TOKEN_EXPIRY] Check failed: ${err?.message}`);
  }
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Run DB migrations first
  runMigrations().catch(() => {});

  // Fix any malformed publicImageUrl entries immediately
  fixMalformedImageUrls().catch(() => {});

  // Fix suggestion image URLs: /uploads/ → /api/uploads/
  fixSuggestionImageUrls().catch(() => {});

  // Auto-reconnect webhooks 3 seconds after startup
  setTimeout(autoReconnectWebhooks, 3000);

  // Check token expiry on startup and every 24 hours
  setTimeout(checkTokenExpiry, 10_000);
  setInterval(checkTokenExpiry, 24 * 60 * 60 * 1000);

  // Lead scoring background job (item 10) — runs every 30 minutes
  setTimeout(() => {
    runLeadScoring().catch(() => {});
    setInterval(() => runLeadScoring().catch(() => {}), 30 * 60 * 1000);
  }, 60_000);

  // Scheduled resets (bee coins + fortune spins) — check every 60 seconds
  runScheduledResets().catch(() => {});
  setInterval(() => runScheduledResets().catch(() => {}), 60_000);

  // Automated Inbox Worker — scans Meta inbox every 3 min for missed messages
  startInboxWorker();
});
