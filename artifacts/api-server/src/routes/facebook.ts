import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const META_API_VERSION = "v21.0";
const router: IRouter = Router();

function getDomain() {
  const raw = process.env.LOCAL_DOMAIN || "localhost:3000";
  return raw.split(",").map((d) => d.trim()).filter(Boolean)[0] || "";
}
function getCallbackUrl() {
  // OAUTH_CALLBACK_DOMAIN can be set explicitly to override auto-detection
  const override = process.env.OAUTH_CALLBACK_DOMAIN;
  if (override) return `https://${override}/api/facebook/oauth/callback`;
  return `https://${getDomain()}/api/facebook/oauth/callback`;
}

/* ─────────────────────────────────────────────
   STEP 1: Save App ID + Secret and return the
   Facebook OAuth URL (mobile-friendly redirect)
───────────────────────────────────────────── */
router.post("/facebook/oauth/start", async (req, res) => {
  try {
    const { appId, appSecret } = req.body;
    if (!appId?.trim() || !appSecret?.trim()) {
      return void res.status(400).json({ error: "Missing appId or appSecret" });
    }

    // Save credentials to settings so callback can use them
    const rows = await db.select().from(settingsTable).limit(1);
    if (rows[0]) {
      await db.update(settingsTable).set({
        metaAppId: appId.trim(),
        metaAppSecret: appSecret.trim(),
        updatedAt: new Date(),
      }).where(eq(settingsTable.id, rows[0].id));
    } else {
      await db.insert(settingsTable).values({
        metaAppId: appId.trim(),
        metaAppSecret: appSecret.trim(),
        botEnabled: false,
        schedulerEnabled: false,
        scheduleStart: "00:00",
        scheduleEnd: "23:59",
        ageFilterMin: 1,
        ageFilterMax: 12,
        language: "ar",
        updatedAt: new Date(),
      } as any);
    }

    const callbackUrl = getCallbackUrl();
    const scopes = [
      "pages_show_list",
      "pages_read_engagement",
      "pages_messaging",
      "pages_manage_metadata",
      "instagram_basic",
      "instagram_manage_messages",
      "business_management",
    ].join(",");

    const oauthUrl =
      `https://www.facebook.com/dialog/oauth` +
      `?client_id=${appId.trim()}` +
      `&redirect_uri=${encodeURIComponent(callbackUrl)}` +
      `&scope=${encodeURIComponent(scopes)}` +
      `&response_type=code` +
      `&state=fbconnect`;

    res.json({ oauthUrl, callbackUrl });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ─────────────────────────────────────────────
   QUICK-START: Start OAuth using stored credentials (no form needed)
───────────────────────────────────────────── */
router.get("/facebook/oauth/quick-start", async (req, res) => {
  try {
    const rows = await db.select().from(settingsTable).limit(1);
    const settings = rows[0];
    if (!settings?.metaAppId || !settings?.metaAppSecret) {
      return void res.status(400).json({ error: "no_credentials" });
    }
    const callbackUrl = getCallbackUrl();
    const scopes = [
      "pages_show_list",
      "pages_read_engagement",
      "pages_messaging",
      "pages_manage_metadata",
      "instagram_basic",
      "instagram_manage_messages",
      "business_management",
    ].join(",");
    const oauthUrl =
      `https://www.facebook.com/dialog/oauth` +
      `?client_id=${settings.metaAppId}` +
      `&redirect_uri=${encodeURIComponent(callbackUrl)}` +
      `&scope=${encodeURIComponent(scopes)}` +
      `&response_type=code` +
      `&state=fbconnect`;
    res.redirect(oauthUrl);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ─────────────────────────────────────────────
   STEP 2: Facebook redirects here after login.
   Exchange code → token, fetch pages, auto-configure.
───────────────────────────────────────────── */
router.get("/facebook/oauth/callback", async (req, res) => {
  // Use the actual host the request arrived on so the redirect goes back to the right domain
  const host = req.headers["x-forwarded-host"] as string || req.hostname;
  const redirectBase = `https://${host}/beqolky/facebook-connect`;

  try {
    const { code, error: fbError } = req.query as Record<string, string>;

    if (fbError) {
      return void res.redirect(`${redirectBase}?error=${encodeURIComponent(fbError)}`);
    }
    if (!code) {
      return void res.redirect(`${redirectBase}?error=no_code`);
    }

    // Load stored credentials
    const rows = await db.select().from(settingsTable).limit(1);
    const settings = rows[0];
    if (!settings?.metaAppId || !settings?.metaAppSecret) {
      return void res.redirect(`${redirectBase}?error=no_credentials`);
    }

    const { metaAppId: appId, metaAppSecret: appSecret } = settings;
    const callbackUrl = getCallbackUrl();

    // Exchange code for user access token
    const tokenRes = await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/oauth/access_token` +
      `?client_id=${appId}` +
      `&redirect_uri=${encodeURIComponent(callbackUrl)}` +
      `&client_secret=${appSecret}` +
      `&code=${code}`
    );
    const tokenData = await tokenRes.json() as any;
    if (tokenData.error) throw new Error(tokenData.error.message);

    const userToken = tokenData.access_token;

    // Fetch all pages the user admins (personal admin)
    const pagesRes = await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/me/accounts` +
      `?fields=id,name,access_token,category` +
      `&access_token=${userToken}`
    );
    const pagesData = await pagesRes.json() as any;
    if (pagesData.error) throw new Error(pagesData.error.message);

    let pages: Array<{ id: string; name: string; access_token: string; category?: string }> = pagesData.data || [];

    // Fallback: if no pages from /me/accounts, try Business Manager pages
    if (!pages.length) {
      try {
        const bizRes = await fetch(
          `https://graph.facebook.com/${META_API_VERSION}/me/businesses` +
          `?fields=id,name` +
          `&access_token=${userToken}`
        );
        const bizData = await bizRes.json() as any;
        const businesses: Array<{ id: string; name: string }> = bizData.data || [];

        for (const biz of businesses) {
          // Try owned_pages and client_pages from each business
          for (const endpoint of ["owned_pages", "client_pages"]) {
            const bizPagesRes = await fetch(
              `https://graph.facebook.com/${META_API_VERSION}/${biz.id}/${endpoint}` +
              `?fields=id,name,access_token,category` +
              `&access_token=${userToken}`
            );
            const bizPagesData = await bizPagesRes.json() as any;
            if (!bizPagesData.error && bizPagesData.data?.length) {
              pages = [...pages, ...bizPagesData.data];
            }
          }
          if (pages.length) break;
        }
      } catch (_) { /* ignore business API errors, fall through */ }
    }

    // Fallback 2: if stored page ID exists, try fetching its token directly
    if (!pages.length && settings?.facebookPageId) {
      try {
        const directRes = await fetch(
          `https://graph.facebook.com/${META_API_VERSION}/${settings.facebookPageId}` +
          `?fields=id,name,access_token,category` +
          `&access_token=${userToken}`
        );
        const directData = await directRes.json() as any;
        if (!directData.error && directData.access_token) {
          pages = [directData];
        }
      } catch (_) { /* ignore */ }
    }

    if (!pages.length) {
      return void res.redirect(`${redirectBase}?error=no_pages`);
    }

    // If multiple pages, redirect with page list so user can choose
    if (pages.length > 1) {
      const pagesParam = encodeURIComponent(JSON.stringify(pages.map(p => ({
        id: p.id,
        name: p.name,
        token: p.access_token,
        category: p.category || "",
      }))));
      return void res.redirect(`${redirectBase}?step=choose&pages=${pagesParam}`);
    }

    // Single page — auto-configure everything
    const page = pages[0];
    await autoConfigurePage({ appId, appSecret, page, settings });

    res.redirect(`${redirectBase}?success=1&page=${encodeURIComponent(page.name)}`);
  } catch (err: any) {
    console.error("OAuth callback error:", err);
    res.redirect(`${redirectBase}?error=${encodeURIComponent(err.message)}`);
  }
});

/* ─────────────────────────────────────────────
   STEP 3 (optional): User picks a page from list
───────────────────────────────────────────── */
router.post("/facebook/oauth/select-page", async (req, res) => {
  try {
    const { pageId, pageAccessToken, pageName } = req.body;
    if (!pageId || !pageAccessToken) {
      return void res.status(400).json({ error: "Missing pageId or pageAccessToken" });
    }

    const rows = await db.select().from(settingsTable).limit(1);
    const settings = rows[0];

    await autoConfigurePage({
      appId: settings?.metaAppId || "",
      appSecret: settings?.metaAppSecret || "",
      page: { id: pageId, name: pageName || "Page", access_token: pageAccessToken },
      settings,
    });

    res.json({ success: true, pageName });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ─────────────────────────────────────────────
   Helper: configure webhook + subscribe + save
───────────────────────────────────────────── */
async function autoConfigurePage({
  appId, appSecret, page, settings,
}: {
  appId: string;
  appSecret: string;
  page: { id: string; name: string; access_token: string };
  settings: any;
}) {
  const domain = getDomain();
  const webhookUrl = `https://${domain}/api/webhook/meta`;

  // Generate verify token if not already saved
  const verifyToken = settings?.webhookVerifyToken || genToken(32);

  // Subscribe page to receive messages
  try {
    await fetch(`https://graph.facebook.com/${META_API_VERSION}/${page.id}/subscribed_apps`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        subscribed_fields: "messages,messaging_postbacks,messaging_optins",
        access_token: page.access_token,
      }).toString(),
    });
  } catch (_) {}

  // Configure webhook on Meta App (if we have app credentials)
  if (appId && appSecret) {
    try {
      await fetch(`https://graph.facebook.com/${META_API_VERSION}/${appId}/subscriptions`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          object: "page",
          callback_url: webhookUrl,
          verify_token: verifyToken,
          fields: "messages,messaging_postbacks,messaging_optins",
          access_token: `${appId}|${appSecret}`,
        }).toString(),
      });
    } catch (_) {}
  }

  // Auto-detect Instagram account linked to this page
  let igAccountId: string | null = null;
  try {
    const igRes = await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/${page.id}` +
      `?fields=instagram_business_account,connected_instagram_account` +
      `&access_token=${page.access_token}`
    );
    const igData = await igRes.json() as any;
    igAccountId = igData.instagram_business_account?.id || igData.connected_instagram_account?.id || null;
    console.log("[AUTO CONFIG] Instagram account ID:", igAccountId);
  } catch (_) {}

  // Subscribe Instagram webhook if we found an Instagram account
  if (igAccountId && appId && appSecret) {
    try {
      // App-level Instagram subscription
      await fetch(`https://graph.facebook.com/${META_API_VERSION}/${appId}/subscriptions`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          object: "instagram",
          callback_url: webhookUrl,
          verify_token: verifyToken,
          fields: "messages,messaging_postbacks,messaging_optins",
          access_token: `${appId}|${appSecret}`,
        }).toString(),
      });
    } catch (_) {}

    try {
      // Page-level Instagram subscription
      await fetch(`https://graph.facebook.com/${META_API_VERSION}/${page.id}/subscribed_apps`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          subscribed_fields: "messages,messaging_postbacks,messaging_optins,instagram_manage_messages",
          access_token: page.access_token,
        }).toString(),
      });
    } catch (_) {}
  }

  // Save to DB
  const settingsData: Record<string, any> = {
    metaAppId: appId || settings?.metaAppId || "",
    metaAppSecret: appSecret || settings?.metaAppSecret || "",
    facebookPageId: page.id,
    metaAccessToken: page.access_token,
    webhookVerifyToken: verifyToken,
    botEnabled: true,
    updatedAt: new Date(),
  };

  if (igAccountId) {
    settingsData.instagramAccountId = igAccountId;
    settingsData.instagramWebhookActive = true;
  }

  if (settings) {
    await db.update(settingsTable).set(settingsData).where(eq(settingsTable.id, settings.id));
  } else {
    await db.insert(settingsTable).values({
      ...settingsData,
      scheduleStart: "00:00",
      scheduleEnd: "23:59",
      ageFilterMin: 1,
      ageFilterMax: 12,
      language: "ar",
    } as any);
  }
}

function genToken(n = 32) {
  const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: n }, () => c[Math.floor(Math.random() * c.length)]).join("");
}

/* ─────────────────────────────────────────────
   Original endpoints (kept for compatibility)
───────────────────────────────────────────── */
router.post("/facebook/configure-all", async (req, res) => {
  try {
    const { appId, appSecret, pageId, pageAccessToken, pageName, verifyToken, webhookUrl, instagramId } = req.body;
    if (!pageId || !pageAccessToken) {
      return void res.status(400).json({ success: false, error: "Missing required fields" });
    }

    const rows = await db.select().from(settingsTable).limit(1);
    const existing = rows[0];

    const settingsData: any = {
      facebookPageId: pageId,
      metaAccessToken: pageAccessToken,
      webhookVerifyToken: verifyToken,
      botEnabled: true,
      updatedAt: new Date(),
    };
    if (appId) settingsData.metaAppId = appId;
    if (instagramId) settingsData.instagramAccountId = instagramId;
    if (req.body.tokenExpiresAt) settingsData.tokenExpiresAt = Number(req.body.tokenExpiresAt);

    if (existing) {
      await db.update(settingsTable).set(settingsData).where(eq(settingsTable.id, existing.id));
    } else {
      await db.insert(settingsTable).values({
        ...settingsData,
        scheduleStart: "00:00",
        scheduleEnd: "23:59",
        ageFilterMin: 1,
        ageFilterMax: 12,
        language: "ar",
      });
    }

    let webhookConfigured = false;
    let pageSubscribed = false;

    if (appId && appSecret && webhookUrl && verifyToken) {
      try {
        const wh = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${appId}/subscriptions`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ object: "page", callback_url: webhookUrl, verify_token: verifyToken, fields: "messages,messaging_postbacks,messaging_optins", access_token: `${appId}|${appSecret}` }).toString(),
        });
        const whd = await wh.json() as any;
        webhookConfigured = !!whd.success;
      } catch (_) {}
    }

    try {
      const sub = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${pageId}/subscribed_apps`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ subscribed_fields: "messages,messaging_postbacks,messaging_optins", access_token: pageAccessToken }).toString(),
      });
      const subd = await sub.json() as any;
      pageSubscribed = !!subd.success;
    } catch (_) {}

    res.json({
      success: true,
      webhookConfigured,
      pageSubscribed,
      pageName,
      message: pageSubscribed ? "تم الربط بنجاح! البوت جاهز." : "تم الحفظ. أضف الـ Webhook يدوياً.",
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/facebook/get-pages", async (req, res) => {
  try {
    const { userToken } = req.body;
    if (!userToken) return void res.status(400).json({ error: "Missing userToken" });
    const r = await fetch(`https://graph.facebook.com/${META_API_VERSION}/me/accounts?fields=id,name,access_token,category&access_token=${userToken}`);
    const data = await r.json() as any;
    if (data.error) return void res.status(400).json({ error: data.error.message });
    res.json({ pages: data.data || [] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/facebook/subscribe-webhook", async (req, res) => {
  try {
    const { pageId, pageAccessToken } = req.body;
    if (!pageId || !pageAccessToken) return void res.status(400).json({ success: false });
    const sub = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${pageId}/subscribed_apps`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ subscribed_fields: "messages,messaging_postbacks,messaging_optins", access_token: pageAccessToken }).toString(),
    });
    const data = await sub.json() as any;
    res.json({ success: !!data.success, error: data.error?.message });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/* ─────────────────────────────────────────────
   INSTAGRAM: Detect account and subscribe webhook
   POST /instagram/connect
   — uses the already-saved page token + app creds
───────────────────────────────────────────── */
router.post("/instagram/connect", async (req, res) => {
  try {
    const rows = await db.select().from(settingsTable).limit(1);
    const settings = rows[0];

    if (!settings?.metaAccessToken || !settings?.facebookPageId) {
      return void res.status(400).json({ success: false, error: "Connect Facebook page first" });
    }

    const { metaAccessToken: pageToken, facebookPageId: pageId, metaAppId: appId, metaAppSecret: appSecret, webhookVerifyToken: verifyToken } = settings;
    const domain = getDomain();
    const webhookUrl = `https://${domain}/api/webhook/meta`;

    // Allow manual Instagram account ID override from request body
    let igAccountId: string | null = req.body?.instagramAccountId?.trim() || null;

    if (!igAccountId) {
      // Auto-detect: Get Instagram business account linked to the page
      const igRes = await fetch(
        `https://graph.facebook.com/${META_API_VERSION}/${pageId}?fields=instagram_business_account,connected_instagram_account&access_token=${pageToken}`
      );
      const igData = await igRes.json() as any;
      console.log("[IG CONNECT] Page IG data:", JSON.stringify(igData));

      if (igData.error) {
        // Token might be missing instagram_basic permission — return helpful error
        if (igData.error.code === 200 || igData.error.code === 10 || igData.error.message?.includes("permission")) {
          return void res.json({
            success: false,
            error: "missing_permission",
            errorAr: "التوكن الحالي لا يملك صلاحية instagram_basic. سجّل دخولك مرة أخرى بالضغط على 'تسجيل الدخول بـ Facebook' أعلاه، أو أدخل رقم حساب إنستغرام يدوياً.",
            needsReauth: true,
          });
        }
        return void res.json({ success: false, error: igData.error.message });
      }

      igAccountId = igData.instagram_business_account?.id || igData.connected_instagram_account?.id || null;
      if (!igAccountId) {
        return void res.json({
          success: false,
          error: "no_instagram",
          errorAr: "لم يُعثر على حساب إنستغرام مرتبط بهذه الصفحة. تأكد أن الحساب مرتبط من إعدادات صفحة فيسبوك، أو أدخل رقم حساب إنستغرام يدوياً.",
          needsManual: true,
        });
      }
    }

    // 2. Fetch Instagram account details (username)
    const igInfoRes = await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/${igAccountId}?fields=id,username,name,profile_picture_url&access_token=${pageToken}`
    );
    const igInfo = await igInfoRes.json() as any;
    console.log("[IG CONNECT] IG account info:", JSON.stringify(igInfo));

    // 3. Subscribe app-level webhook for Instagram object (if we have app creds)
    let appSubOk = false;
    if (appId && appSecret && verifyToken) {
      try {
        const appSubRes = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${appId}/subscriptions`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            object: "instagram",
            callback_url: webhookUrl,
            verify_token: verifyToken,
            fields: "messages,messaging_postbacks,messaging_optins",
            access_token: `${appId}|${appSecret}`,
          }).toString(),
        });
        const appSubData = await appSubRes.json() as any;
        console.log("[IG CONNECT] App subscription result:", JSON.stringify(appSubData));
        appSubOk = !!appSubData.success;
      } catch (e) {
        console.error("[IG CONNECT] App subscription error:", e);
      }
    }

    // 4. Subscribe the page to messaging (instagram_manage_messages is app-level only, not valid here)
    let pageSubOk = false;
    try {
      const pageSubRes = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${pageId}/subscribed_apps`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          subscribed_fields: "messages,messaging_postbacks,messaging_optins",
          access_token: pageToken,
        }).toString(),
      });
      const pageSubData = await pageSubRes.json() as any;
      console.log("[IG CONNECT] Page subscription result:", JSON.stringify(pageSubData));
      pageSubOk = !!pageSubData.success;
    } catch (e) {
      console.error("[IG CONNECT] Page subscription error:", e);
    }

    // 5. Save Instagram account ID to DB
    await db.update(settingsTable).set({
      instagramAccountId: igAccountId,
      updatedAt: new Date(),
    }).where(eq(settingsTable.id, settings.id));

    res.json({
      success: true,
      instagramAccountId: igAccountId,
      username: igInfo.username || igInfo.name || "",
      profilePicture: igInfo.profile_picture_url || null,
      appSubscribed: appSubOk,
      pageSubscribed: pageSubOk,
    });
  } catch (err: any) {
    console.error("[IG CONNECT] Error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ─────────────────────────────────────────────
   INSTAGRAM: Subscribe webhook directly using stored app credentials
   POST /instagram/subscribe-webhook
   — No re-auth needed, uses stored appId|appSecret
───────────────────────────────────────────── */
router.post("/instagram/subscribe-webhook", async (req, res) => {
  try {
    const rows = await db.select().from(settingsTable).limit(1);
    const settings = rows[0];
    if (!settings) return void res.status(400).json({ success: false, error: "No settings found" });

    const { metaAppId: appId, metaAppSecret: appSecret, webhookVerifyToken: verifyToken, metaAccessToken: pageToken, facebookPageId: pageId } = settings;
    const domain = getDomain();
    const webhookUrl = `https://${domain}/api/webhook/meta`;

    console.log("[IG SUB] appId:", appId, "hasSecret:", !!appSecret, "verifyToken:", verifyToken?.slice(0, 8));

    const results: Record<string, any> = {};

    // 1. Subscribe app to Instagram object via App Token
    if (appId && appSecret) {
      const appToken = `${appId}|${appSecret}`;
      const appSubRes = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${appId}/subscriptions`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          object: "instagram",
          callback_url: webhookUrl,
          verify_token: verifyToken || "sonbola_verify_secure_2026",
          fields: "messages,messaging_postbacks,messaging_optins",
          access_token: appToken,
        }).toString(),
      });
      const appSubData = await appSubRes.json();
      console.log("[IG SUB] App subscription result:", JSON.stringify(appSubData));
      results.appSubscription = appSubData;
    } else {
      results.appSubscription = { error: "No app credentials stored" };
    }

    // 2. Subscribe page to Instagram messages (using page token)
    if (pageToken && pageId) {
      const pageSubRes = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${pageId}/subscribed_apps`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          subscribed_fields: "messages,messaging_postbacks,messaging_optins",
          access_token: pageToken,
        }).toString(),
      });
      const pageSubData = await pageSubRes.json();
      console.log("[IG SUB] Page subscription result:", JSON.stringify(pageSubData));
      results.pageSubscription = pageSubData;
    }

    // 3. Check existing app subscriptions
    if (appId && appSecret) {
      const checkRes = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${appId}/subscriptions?access_token=${appId}|${appSecret}`);
      const checkData = await checkRes.json();
      console.log("[IG SUB] Existing subscriptions:", JSON.stringify(checkData));
      results.existingSubscriptions = checkData;
    }

    const appOk = results.appSubscription?.success === true;
    const pageOk = results.pageSubscription?.success === true;

    // If at least page subscription is active, mark as connected in DB
    if (appOk || pageOk) {
      await db.update(settingsTable).set({ instagramWebhookActive: true });
    }

    res.json({ success: true, appOk, pageOk, results });
  } catch (err: any) {
    console.error("[IG SUB] Error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ─────────────────────────────────────────────
   INSTAGRAM: Disconnect (clear saved account ID)
   POST /instagram/disconnect
───────────────────────────────────────────── */
router.post("/instagram/disconnect", async (req, res) => {
  try {
    const rows = await db.select().from(settingsTable).limit(1);
    if (!rows[0]) return void res.json({ success: true });
    await db.update(settingsTable).set({ instagramAccountId: null, instagramWebhookActive: false, updatedAt: new Date() }).where(eq(settingsTable.id, rows[0].id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
