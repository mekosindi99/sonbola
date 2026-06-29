import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db/schema";

const router: IRouter = Router();

async function getSettings() {
  const rows = await db.select().from(settingsTable).limit(1);
  return rows[0] ?? null;
}

// GET /api/beqolky/interactive-menu
router.get("/beqolky/interactive-menu", async (_req, res) => {
  try {
    const s = await getSettings();
    const items = s?.interactiveMenuItems ? JSON.parse(s.interactiveMenuItems) : [];
    res.json({ enabled: s?.interactiveMenuEnabled ?? false, items });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/beqolky/interactive-menu — save settings (no FB apply)
router.post("/beqolky/interactive-menu", async (req, res) => {
  try {
    const { enabled, items } = req.body as { enabled: boolean; items: unknown[] };
    await db.update(settingsTable).set({
      interactiveMenuEnabled: enabled,
      interactiveMenuItems: JSON.stringify(items ?? []),
    });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/beqolky/interactive-menu/apply — push to Facebook Persistent Menu
router.post("/beqolky/interactive-menu/apply", async (_req, res) => {
  try {
    const s = await getSettings();
    if (!s?.metaAccessToken || !s?.facebookPageId) {
      return res.status(400).json({ error: "رابط فيسبوك غير مكتمل — تحقق من إعدادات فيسبوك" });
    }
    if (!s.interactiveMenuEnabled) {
      return res.status(400).json({ error: "القائمة التفاعلية غير مفعّلة" });
    }
    const items: Array<{ id: string; title: string; type: string; payload?: string; url?: string }> =
      s.interactiveMenuItems ? JSON.parse(s.interactiveMenuItems) : [];

    const callToActions = items.slice(0, 3).map(item => {
      if (item.type === "url") {
        return { type: "web_url", title: item.title.slice(0, 30), url: item.url ?? "https://sonbola.shop" };
      }
      return { type: "postback", title: item.title.slice(0, 30), payload: item.payload ?? "MENU_ITEM" };
    });

    const body = {
      persistent_menu: [
        { locale: "default", composer_input_disabled: false, call_to_actions: callToActions },
      ],
    };

    const fbRes = await fetch(
      `https://graph.facebook.com/v18.0/me/messenger_profile?access_token=${s.metaAccessToken}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    );
    const fbJson = await fbRes.json() as any;
    if (!fbRes.ok) {
      return res.status(400).json({ error: fbJson?.error?.message ?? "خطأ من فيسبوك", detail: fbJson });
    }
    res.json({ ok: true, result: fbJson });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/beqolky/interactive-menu/apply — remove from Facebook
router.delete("/beqolky/interactive-menu/apply", async (_req, res) => {
  try {
    const s = await getSettings();
    if (!s?.metaAccessToken) {
      return res.status(400).json({ error: "رابط فيسبوك غير مكتمل" });
    }
    const body = { fields: ["persistent_menu"] };
    const fbRes = await fetch(
      `https://graph.facebook.com/v18.0/me/messenger_profile?access_token=${s.metaAccessToken}`,
      { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    );
    const fbJson = await fbRes.json() as any;
    if (!fbRes.ok) {
      return res.status(400).json({ error: fbJson?.error?.message ?? "خطأ من فيسبوك" });
    }
    // Also disable locally
    await db.update(settingsTable).set({ interactiveMenuEnabled: false });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
