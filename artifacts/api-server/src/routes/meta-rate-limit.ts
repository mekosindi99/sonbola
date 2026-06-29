import { Router } from "express";
import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db/schema";

const router = Router();

interface AppUsage {
  call_count: number;
  total_time: number;
  total_cputime: number;
}

interface RateLimitResponse {
  appUsage: AppUsage | null;
  businessUsage: Record<string, any> | null;
  checkedAt: string;
  error?: string;
  pageId?: string;
}

router.get("/meta-rate-limit", async (_req, res) => {
  try {
    const rows = await db.select().from(settingsTable).limit(1);
    const s = rows[0];

    if (!s?.metaAccessToken || !s?.facebookPageId) {
      return res.json({
        appUsage: null,
        businessUsage: null,
        checkedAt: new Date().toISOString(),
        error: "no_token",
      } satisfies RateLimitResponse);
    }

    const apiRes = await fetch(
      `https://graph.facebook.com/v22.0/${s.facebookPageId}?fields=id&access_token=${s.metaAccessToken}`,
      { method: "GET" }
    );

    const appUsageHeader = apiRes.headers.get("x-app-usage");
    const businessHeader = apiRes.headers.get("x-business-use-case-usage");

    let appUsage: AppUsage | null = null;
    let businessUsage: Record<string, any> | null = null;

    if (appUsageHeader) {
      try { appUsage = JSON.parse(appUsageHeader); } catch {}
    }
    if (businessHeader) {
      try { businessUsage = JSON.parse(businessHeader); } catch {}
    }

    if (!apiRes.ok) {
      const body = await apiRes.json().catch(() => ({}));
      return res.json({
        appUsage,
        businessUsage,
        checkedAt: new Date().toISOString(),
        error: (body as any)?.error?.message || `HTTP ${apiRes.status}`,
        pageId: s.facebookPageId,
      } satisfies RateLimitResponse);
    }

    return res.json({
      appUsage,
      businessUsage,
      checkedAt: new Date().toISOString(),
      pageId: s.facebookPageId,
    } satisfies RateLimitResponse);
  } catch (err: any) {
    return res.json({
      appUsage: null,
      businessUsage: null,
      checkedAt: new Date().toISOString(),
      error: err?.message || "unknown error",
    } satisfies RateLimitResponse);
  }
});

export default router;
