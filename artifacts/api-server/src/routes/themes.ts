import { Router } from "express";
import { db } from "@workspace/db";
import { storefrontThemesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

// ─── Seed helpers ───────────────────────────────────────────────────────────

export const BUILTIN_THEMES = [
  {
    slug: "sonbola-classic",
    name: "كلاسيك سنبلة 🌿",
    isBuiltin: true,
    config: JSON.stringify({
      pageBg: "#f7f8fa",
      headerBg: "#ffffff",
      headerBorder: "#e5e7eb",
      heroBg: "linear-gradient(135deg,#ff6b9d 0%,#ff9a6c 100%)",
      heroText: "#ffffff",
      primaryColor: "#25d366",
      primaryText: "#ffffff",
      accentColor: "#ff6b9d",
      accentText: "#ffffff",
      cardBg: "#ffffff",
      cardBorder: "#f0f0f0",
      cardRadius: 16,
      fontFamily: "'Segoe UI', Tahoma, sans-serif",
      badgeSaleBg: "#ef4444",
      badgeSaleText: "#ffffff",
    }),
  },
  {
    slug: "soft-pink",
    name: "وردي ناعم 🌸",
    isBuiltin: true,
    config: JSON.stringify({
      pageBg: "#fff5f7",
      headerBg: "#fff0f3",
      headerBorder: "#fce7f3",
      heroBg: "linear-gradient(135deg,#f9a8d4 0%,#f472b6 50%,#ec4899 100%)",
      heroText: "#ffffff",
      primaryColor: "#ec4899",
      primaryText: "#ffffff",
      accentColor: "#f9a8d4",
      accentText: "#9d174d",
      cardBg: "#ffffff",
      cardBorder: "#fce7f3",
      cardRadius: 20,
      fontFamily: "'Segoe UI', Tahoma, sans-serif",
      badgeSaleBg: "#be185d",
      badgeSaleText: "#ffffff",
    }),
  },
  {
    slug: "royal-purple",
    name: "بنفسجي ملكي 👑",
    isBuiltin: true,
    config: JSON.stringify({
      pageBg: "#faf5ff",
      headerBg: "#f5f3ff",
      headerBorder: "#ede9fe",
      heroBg: "linear-gradient(135deg,#7c3aed 0%,#a855f7 50%,#c084fc 100%)",
      heroText: "#ffffff",
      primaryColor: "#7c3aed",
      primaryText: "#ffffff",
      accentColor: "#a855f7",
      accentText: "#ffffff",
      cardBg: "#ffffff",
      cardBorder: "#ede9fe",
      cardRadius: 16,
      fontFamily: "'Segoe UI', Tahoma, sans-serif",
      badgeSaleBg: "#6d28d9",
      badgeSaleText: "#ffffff",
    }),
  },
  {
    slug: "ocean-blue",
    name: "محيط أزرق 🌊",
    isBuiltin: true,
    config: JSON.stringify({
      pageBg: "#f0f9ff",
      headerBg: "#f0f9ff",
      headerBorder: "#bae6fd",
      heroBg: "linear-gradient(135deg,#0ea5e9 0%,#38bdf8 50%,#7dd3fc 100%)",
      heroText: "#ffffff",
      primaryColor: "#0ea5e9",
      primaryText: "#ffffff",
      accentColor: "#38bdf8",
      accentText: "#0c4a6e",
      cardBg: "#ffffff",
      cardBorder: "#e0f2fe",
      cardRadius: 14,
      fontFamily: "'Segoe UI', Tahoma, sans-serif",
      badgeSaleBg: "#0284c7",
      badgeSaleText: "#ffffff",
    }),
  },
  {
    slug: "golden-luxury",
    name: "ذهبي فاخر ✨",
    isBuiltin: true,
    config: JSON.stringify({
      pageBg: "#fffbeb",
      headerBg: "#fefce8",
      headerBorder: "#fde68a",
      heroBg: "linear-gradient(135deg,#d97706 0%,#f59e0b 40%,#fbbf24 100%)",
      heroText: "#ffffff",
      primaryColor: "#d97706",
      primaryText: "#ffffff",
      accentColor: "#f59e0b",
      accentText: "#ffffff",
      cardBg: "#ffffff",
      cardBorder: "#fde68a",
      cardRadius: 12,
      fontFamily: "'Segoe UI', Tahoma, sans-serif",
      badgeSaleBg: "#b45309",
      badgeSaleText: "#ffffff",
    }),
  },
  {
    slug: "cherry-blossom",
    name: "وردة اليابان 🌺",
    isBuiltin: true,
    config: JSON.stringify({
      pageBg: "#fff8f8",
      headerBg: "#fff0f0",
      headerBorder: "#ffd6d6",
      heroBg: "linear-gradient(135deg,#ff8fab 0%,#ffb3c6 50%,#ffd6e0 100%)",
      heroText: "#7d1635",
      primaryColor: "#e91e63",
      primaryText: "#ffffff",
      accentColor: "#ff8fab",
      accentText: "#7d1635",
      cardBg: "#ffffff",
      cardBorder: "#ffd6d6",
      cardRadius: 22,
      fontFamily: "'Segoe UI', Tahoma, sans-serif",
      badgeSaleBg: "#c2185b",
      badgeSaleText: "#ffffff",
    }),
  },
  {
    slug: "dark-neon",
    name: "نيون داكن 🌙",
    isBuiltin: true,
    config: JSON.stringify({
      pageBg: "#0d0d1a",
      headerBg: "#111127",
      headerBorder: "#1e1e3f",
      heroBg: "linear-gradient(135deg,#1a0533 0%,#2d1b69 50%,#0d0d1a 100%)",
      heroText: "#e879f9",
      primaryColor: "#a855f7",
      primaryText: "#ffffff",
      accentColor: "#e879f9",
      accentText: "#ffffff",
      cardBg: "#1a1a2e",
      cardBorder: "#2d2d5e",
      cardRadius: 16,
      fontFamily: "'Segoe UI', Tahoma, sans-serif",
      badgeSaleBg: "#7c3aed",
      badgeSaleText: "#ffffff",
    }),
  },
  {
    slug: "fresh-mint",
    name: "نعناع منعش 🍃",
    isBuiltin: true,
    config: JSON.stringify({
      pageBg: "#f0fdf4",
      headerBg: "#f0fdf4",
      headerBorder: "#bbf7d0",
      heroBg: "linear-gradient(135deg,#10b981 0%,#34d399 50%,#6ee7b7 100%)",
      heroText: "#ffffff",
      primaryColor: "#10b981",
      primaryText: "#ffffff",
      accentColor: "#34d399",
      accentText: "#064e3b",
      cardBg: "#ffffff",
      cardBorder: "#d1fae5",
      cardRadius: 16,
      fontFamily: "'Segoe UI', Tahoma, sans-serif",
      badgeSaleBg: "#059669",
      badgeSaleText: "#ffffff",
    }),
  },
  {
    slug: "sunset-glow",
    name: "غروب الشمس 🌅",
    isBuiltin: true,
    config: JSON.stringify({
      pageBg: "#fff7ed",
      headerBg: "#fff7ed",
      headerBorder: "#fed7aa",
      heroBg: "linear-gradient(135deg,#ea580c 0%,#f97316 35%,#fb923c 65%,#fbbf24 100%)",
      heroText: "#ffffff",
      primaryColor: "#ea580c",
      primaryText: "#ffffff",
      accentColor: "#f97316",
      accentText: "#ffffff",
      cardBg: "#ffffff",
      cardBorder: "#fed7aa",
      cardRadius: 14,
      fontFamily: "'Segoe UI', Tahoma, sans-serif",
      badgeSaleBg: "#c2410c",
      badgeSaleText: "#ffffff",
    }),
  },
  {
    slug: "pure-white",
    name: "أبيض ناصع 🤍",
    isBuiltin: true,
    config: JSON.stringify({
      pageBg: "#f9fafb",
      headerBg: "#ffffff",
      headerBorder: "#e5e7eb",
      heroBg: "linear-gradient(135deg,#1f2937 0%,#374151 100%)",
      heroText: "#ffffff",
      primaryColor: "#111827",
      primaryText: "#ffffff",
      accentColor: "#6b7280",
      accentText: "#ffffff",
      cardBg: "#ffffff",
      cardBorder: "#e5e7eb",
      cardRadius: 12,
      fontFamily: "'Segoe UI', Tahoma, sans-serif",
      badgeSaleBg: "#374151",
      badgeSaleText: "#ffffff",
    }),
  },
  {
    slug: "lavender-dream",
    name: "لافندر حالم 💜",
    isBuiltin: true,
    config: JSON.stringify({
      pageBg: "#f5f3ff",
      headerBg: "#faf5ff",
      headerBorder: "#e9d5ff",
      heroBg: "linear-gradient(135deg,#8b5cf6 0%,#a78bfa 50%,#c4b5fd 100%)",
      heroText: "#ffffff",
      primaryColor: "#8b5cf6",
      primaryText: "#ffffff",
      accentColor: "#a78bfa",
      accentText: "#ffffff",
      cardBg: "#ffffff",
      cardBorder: "#ede9fe",
      cardRadius: 18,
      fontFamily: "'Segoe UI', Tahoma, sans-serif",
      badgeSaleBg: "#7c3aed",
      badgeSaleText: "#ffffff",
    }),
  },
  {
    slug: "turquoise-bay",
    name: "فيروزي خليجي 🌴",
    isBuiltin: true,
    config: JSON.stringify({
      pageBg: "#f0fdfa",
      headerBg: "#f0fdfa",
      headerBorder: "#99f6e4",
      heroBg: "linear-gradient(135deg,#0d9488 0%,#14b8a6 50%,#5eead4 100%)",
      heroText: "#ffffff",
      primaryColor: "#0d9488",
      primaryText: "#ffffff",
      accentColor: "#14b8a6",
      accentText: "#ffffff",
      cardBg: "#ffffff",
      cardBorder: "#ccfbf1",
      cardRadius: 16,
      fontFamily: "'Segoe UI', Tahoma, sans-serif",
      badgeSaleBg: "#0f766e",
      badgeSaleText: "#ffffff",
    }),
  },
  {
    slug: "rose-passion",
    name: "حمراء رومانسية ❤️",
    isBuiltin: true,
    config: JSON.stringify({
      pageBg: "#fff1f2",
      headerBg: "#fff1f2",
      headerBorder: "#fecdd3",
      heroBg: "linear-gradient(135deg,#e11d48 0%,#f43f5e 50%,#fb7185 100%)",
      heroText: "#ffffff",
      primaryColor: "#e11d48",
      primaryText: "#ffffff",
      accentColor: "#f43f5e",
      accentText: "#ffffff",
      cardBg: "#ffffff",
      cardBorder: "#ffe4e6",
      cardRadius: 16,
      fontFamily: "'Segoe UI', Tahoma, sans-serif",
      badgeSaleBg: "#be123c",
      badgeSaleText: "#ffffff",
    }),
  },
  {
    slug: "warm-sand",
    name: "بيج رملي دافئ 🏜️",
    isBuiltin: true,
    config: JSON.stringify({
      pageBg: "#faf5eb",
      headerBg: "#faf5eb",
      headerBorder: "#e5d5b0",
      heroBg: "linear-gradient(135deg,#92400e 0%,#b45309 40%,#d97706 100%)",
      heroText: "#ffffff",
      primaryColor: "#92400e",
      primaryText: "#ffffff",
      accentColor: "#b45309",
      accentText: "#ffffff",
      cardBg: "#fffbf0",
      cardBorder: "#e5d5b0",
      cardRadius: 12,
      fontFamily: "'Segoe UI', Tahoma, sans-serif",
      badgeSaleBg: "#78350f",
      badgeSaleText: "#ffffff",
    }),
  },
  {
    slug: "iraqi-turquoise",
    name: "فيروزي عراقي 🕌",
    isBuiltin: true,
    config: JSON.stringify({
      pageBg: "#f0fafb",
      headerBg: "#e0f5f7",
      headerBorder: "#a5d8dd",
      heroBg: "linear-gradient(135deg,#006d77 0%,#83c5be 50%,#edf6f9 100%)",
      heroText: "#003d44",
      primaryColor: "#006d77",
      primaryText: "#ffffff",
      accentColor: "#83c5be",
      accentText: "#003d44",
      cardBg: "#ffffff",
      cardBorder: "#b8dfe3",
      cardRadius: 16,
      fontFamily: "'Segoe UI', Tahoma, sans-serif",
      badgeSaleBg: "#005f68",
      badgeSaleText: "#ffffff",
    }),
  },
];

// ─── Public: get active theme ────────────────────────────────────────────────

router.get("/storefront/active-theme", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(storefrontThemesTable)
      .where(eq(storefrontThemesTable.isActive, true))
      .limit(1);
    if (!rows[0]) return res.json(null);
    return res.json({ ...rows[0], config: JSON.parse(rows[0].config) });
  } catch {
    return res.json(null);
  }
});

// ─── Admin: list all themes ──────────────────────────────────────────────────

router.get("/beqolky/themes", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(storefrontThemesTable)
      .orderBy(storefrontThemesTable.id);
    return res.json(rows.map(r => ({ ...r, config: JSON.parse(r.config) })));
  } catch (err) {
    return res.status(500).json({ error: "Failed to load themes" });
  }
});

// ─── Admin: create theme ─────────────────────────────────────────────────────

router.post("/beqolky/themes", async (req, res) => {
  try {
    const { name, slug, config } = req.body as { name?: string; slug?: string; config?: object };
    if (!name || !slug || !config) return res.status(400).json({ error: "name, slug, config required" });
    const [row] = await db
      .insert(storefrontThemesTable)
      .values({ name, slug, config: JSON.stringify(config), isBuiltin: false })
      .returning();
    return res.json({ ...row, config: JSON.parse(row.config) });
  } catch (err: any) {
    if (err?.code === "23505") return res.status(400).json({ error: "اسم الثيم مكرر" });
    return res.status(500).json({ error: "Failed to create theme" });
  }
});

// ─── Admin: update theme ─────────────────────────────────────────────────────

router.put("/beqolky/themes/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, slug, config } = req.body as { name?: string; slug?: string; config?: object };
    const updates: Record<string, unknown> = {};
    if (name) updates.name = name;
    if (slug) updates.slug = slug;
    if (config) updates.config = JSON.stringify(config);
    const [row] = await db
      .update(storefrontThemesTable)
      .set(updates)
      .where(eq(storefrontThemesTable.id, id))
      .returning();
    if (!row) return res.status(404).json({ error: "Theme not found" });
    return res.json({ ...row, config: JSON.parse(row.config) });
  } catch {
    return res.status(500).json({ error: "Failed to update theme" });
  }
});

// ─── Admin: activate theme ───────────────────────────────────────────────────

router.post("/beqolky/themes/:id/activate", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.update(storefrontThemesTable).set({ isActive: false });
    const [row] = await db
      .update(storefrontThemesTable)
      .set({ isActive: true })
      .where(eq(storefrontThemesTable.id, id))
      .returning();
    if (!row) return res.status(404).json({ error: "Theme not found" });
    return res.json({ ...row, config: JSON.parse(row.config) });
  } catch {
    return res.status(500).json({ error: "Failed to activate theme" });
  }
});

// ─── Admin: deactivate all (use default) ────────────────────────────────────

router.post("/beqolky/themes/deactivate", async (_req, res) => {
  try {
    await db.update(storefrontThemesTable).set({ isActive: false });
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
});

// ─── Admin: delete theme ─────────────────────────────────────────────────────

router.delete("/beqolky/themes/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(storefrontThemesTable).where(eq(storefrontThemesTable.id, id));
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: "Failed to delete theme" });
  }
});

// ─── Admin: seed built-in themes ────────────────────────────────────────────

router.post("/beqolky/themes/seed", async (_req, res) => {
  try {
    for (const t of BUILTIN_THEMES) {
      const existing = await db
        .select()
        .from(storefrontThemesTable)
        .where(eq(storefrontThemesTable.slug, t.slug))
        .limit(1);
      if (existing.length === 0) {
        await db.insert(storefrontThemesTable).values(t);
      }
    }
    const rows = await db.select().from(storefrontThemesTable).orderBy(storefrontThemesTable.id);
    return res.json(rows.map(r => ({ ...r, config: JSON.parse(r.config) })));
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

export default router;
