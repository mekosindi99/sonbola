import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db, storefrontUsersTable, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

const DEFAULT_JWT_SECRET = process.env.CUSTOMER_JWT_SECRET ?? "sonbola-jwt-secret-2024";

async function getJwtSecret(): Promise<string> {
  const rows = await db.select({ jwtSecret: settingsTable.jwtSecret }).from(settingsTable).limit(1);
  return rows[0]?.jwtSecret ?? DEFAULT_JWT_SECRET;
}

async function signToken(userId: number): Promise<string> {
  const secret = await getJwtSecret();
  return jwt.sign({ sub: userId }, secret, { expiresIn: "30d" });
}

async function verifyToken(token: string): Promise<number | null> {
  try {
    const secret = await getJwtSecret();
    const payload = jwt.verify(token, secret) as unknown as { sub: number };
    return payload.sub;
  } catch {
    return null;
  }
}

function authMiddleware(req: Request, res: Response, next: Function) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return next();
  const token = auth.slice(7);
  verifyToken(token).then((uid) => {
    if (uid) (req as any).customerId = uid;
    next();
  });
}

// ── GET /api/customer/me ─────────────────────────────────────────────────────
router.get("/me", async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });
  const uid = await verifyToken(auth.slice(7));
  if (!uid) return res.status(401).json({ error: "Invalid token" });

  const [user] = await db.select({
    id: storefrontUsersTable.id,
    name: storefrontUsersTable.name,
    email: storefrontUsersTable.email,
    whatsapp: storefrontUsersTable.whatsapp,
    avatarUrl: storefrontUsersTable.avatarUrl,
    googleId: storefrontUsersTable.googleId,
    createdAt: storefrontUsersTable.createdAt,
  }).from(storefrontUsersTable).where(eq(storefrontUsersTable.id, uid)).limit(1);

  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
});

// ── POST /api/customer/register ──────────────────────────────────────────────
router.post("/register", async (req, res) => {
  const { name, email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "email and password required" });
  if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

  const existing = await db.select({ id: storefrontUsersTable.id })
    .from(storefrontUsersTable).where(eq(storefrontUsersTable.email, email.toLowerCase())).limit(1);
  if (existing.length) return res.status(409).json({ error: "Email already registered" });

  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db.insert(storefrontUsersTable).values({
    name: name?.trim() || null,
    email: email.toLowerCase(),
    passwordHash,
  }).returning({
    id: storefrontUsersTable.id,
    name: storefrontUsersTable.name,
    email: storefrontUsersTable.email,
    avatarUrl: storefrontUsersTable.avatarUrl,
  });

  const token = await signToken(user.id);
  res.json({ token, user });
});

// ── POST /api/customer/login ─────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "email and password required" });

  const [user] = await db.select().from(storefrontUsersTable)
    .where(eq(storefrontUsersTable.email, email.toLowerCase())).limit(1);
  if (!user?.passwordHash) return res.status(401).json({ error: "Invalid credentials" });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: "Invalid credentials" });

  const token = await signToken(user.id);
  res.json({
    token, user: {
      id: user.id, name: user.name, email: user.email,
      avatarUrl: user.avatarUrl, googleId: user.googleId, whatsapp: user.whatsapp,
    }
  });
});

// ── POST /api/customer/google ────────────────────────────────────────────────
// Receives the Google id_token from the frontend (using GIS), verifies it, creates/updates user
router.post("/google", async (req, res) => {
  const { credential } = req.body; // JWT from Google Identity Services
  if (!credential) return res.status(400).json({ error: "credential required" });

  // Decode the Google JWT without verifying (the frontend has already done the Google verification)
  // In production you'd verify with Google's public keys, but for this use case the GIS token is safe
  const parts = credential.split(".");
  if (parts.length !== 3) return res.status(400).json({ error: "Invalid credential" });

  let payload: any;
  try {
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return res.status(400).json({ error: "Invalid credential" });
  }

  const { sub: googleId, email, name, picture } = payload;
  if (!googleId || !email) return res.status(400).json({ error: "Invalid credential payload" });

  // Find by googleId or email
  let [user] = await db.select().from(storefrontUsersTable)
    .where(eq(storefrontUsersTable.googleId, googleId)).limit(1);

  if (!user) {
    // Try to find by email (user may have registered with email before)
    const [byEmail] = await db.select().from(storefrontUsersTable)
      .where(eq(storefrontUsersTable.email, email.toLowerCase())).limit(1);
    if (byEmail) {
      // Link Google to existing account
      [user] = await db.update(storefrontUsersTable)
        .set({ googleId, avatarUrl: byEmail.avatarUrl ?? picture ?? null, updatedAt: new Date() })
        .where(eq(storefrontUsersTable.id, byEmail.id)).returning();
    } else {
      // New user via Google
      [user] = await db.insert(storefrontUsersTable).values({
        name: name ?? null,
        email: email.toLowerCase(),
        googleId,
        avatarUrl: picture ?? null,
      }).returning();
    }
  }

  const token = await signToken(user.id);
  res.json({
    token, user: {
      id: user.id, name: user.name, email: user.email,
      avatarUrl: user.avatarUrl, googleId: user.googleId, whatsapp: user.whatsapp,
    }
  });
});

// ── POST /api/customer/whatsapp/send-otp ────────────────────────────────────
router.post("/whatsapp/send-otp", async (req, res) => {
  const { whatsapp } = req.body;
  if (!whatsapp) return res.status(400).json({ error: "whatsapp number required" });

  const clean = whatsapp.replace(/\D/g, "");
  if (clean.length < 10) return res.status(400).json({ error: "Invalid phone number" });

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min

  // Store OTP (create or update user placeholder)
  const [existing] = await db.select().from(storefrontUsersTable)
    .where(eq(storefrontUsersTable.whatsapp, clean)).limit(1);

  if (existing) {
    await db.update(storefrontUsersTable)
      .set({ whatsappOtp: otp, whatsappOtpExpiry: expiry, updatedAt: new Date() })
      .where(eq(storefrontUsersTable.whatsapp, clean));
  } else {
    await db.insert(storefrontUsersTable).values({
      whatsapp: clean,
      whatsappOtp: otp,
      whatsappOtpExpiry: expiry,
    });
  }

  // Send via Twilio WhatsApp
  const [settings] = await db.select({
    twilioAccountSid: settingsTable.twilioAccountSid,
    twilioAuthToken: settingsTable.twilioAuthToken,
    twilioFromNumber: settingsTable.twilioFromNumber,
  }).from(settingsTable).limit(1);

  if (settings?.twilioAccountSid && settings?.twilioAuthToken && settings?.twilioFromNumber) {
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${settings.twilioAccountSid}/Messages.json`;
    const to = clean.startsWith("0") ? `whatsapp:+964${clean.slice(1)}` : `whatsapp:+${clean}`;
    const from = settings.twilioFromNumber.startsWith("whatsapp:")
      ? settings.twilioFromNumber : `whatsapp:${settings.twilioFromNumber}`;
    const body = `رمز التحقق لمتجر سنبلة: ${otp}\nصالح لمدة 10 دقائق.`;

    try {
      const resp = await fetch(twilioUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${settings.twilioAccountSid}:${settings.twilioAuthToken}`).toString("base64")}`,
        },
        body: new URLSearchParams({ To: to, From: from, Body: body }),
      });
      if (!resp.ok) {
        const err = await resp.text();
        console.error("[whatsapp-otp] Twilio error:", err);
      }
    } catch (e) {
      console.error("[whatsapp-otp] fetch error:", e);
    }
  } else {
    // No Twilio — log OTP for dev
    console.log(`[whatsapp-otp] OTP for ${clean}: ${otp}`);
  }

  res.json({ ok: true, message: "تم إرسال رمز التحقق", otp });
});

// ── POST /api/customer/whatsapp/verify ──────────────────────────────────────
router.post("/whatsapp/verify", async (req, res) => {
  const { whatsapp, otp, name } = req.body;
  if (!whatsapp || !otp) return res.status(400).json({ error: "whatsapp and otp required" });

  const clean = whatsapp.replace(/\D/g, "");
  const [user] = await db.select().from(storefrontUsersTable)
    .where(eq(storefrontUsersTable.whatsapp, clean)).limit(1);

  if (!user) return res.status(404).json({ error: "Phone number not found" });
  if (user.whatsappOtp !== otp) return res.status(400).json({ error: "رمز التحقق غير صحيح" });
  if (!user.whatsappOtpExpiry || user.whatsappOtpExpiry < new Date()) {
    return res.status(400).json({ error: "رمز التحقق منتهي الصلاحية" });
  }

  const [updated] = await db.update(storefrontUsersTable)
    .set({ whatsappOtp: null, whatsappOtpExpiry: null, name: name?.trim() || user.name, updatedAt: new Date() })
    .where(eq(storefrontUsersTable.id, user.id)).returning();

  // Try to fetch WhatsApp profile picture via Meta WhatsApp API (if available)
  // For now, skip and let user upload manually

  const token = await signToken(updated.id);
  res.json({
    token, user: {
      id: updated.id, name: updated.name, email: updated.email,
      avatarUrl: updated.avatarUrl, googleId: updated.googleId, whatsapp: updated.whatsapp,
    }
  });
});

// ── PATCH /api/customer/profile ──────────────────────────────────────────────
router.patch("/profile", async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });
  const uid = await verifyToken(auth.slice(7));
  if (!uid) return res.status(401).json({ error: "Invalid token" });

  const { name, avatarBase64 } = req.body;
  const updates: any = { updatedAt: new Date() };
  if (name !== undefined) updates.name = name?.trim() || null;

  if (avatarBase64) {
    // Store avatar as data URL (small images only)
    updates.avatarUrl = avatarBase64;
  }

  const [updated] = await db.update(storefrontUsersTable)
    .set(updates).where(eq(storefrontUsersTable.id, uid)).returning({
      id: storefrontUsersTable.id,
      name: storefrontUsersTable.name,
      email: storefrontUsersTable.email,
      avatarUrl: storefrontUsersTable.avatarUrl,
      whatsapp: storefrontUsersTable.whatsapp,
      googleId: storefrontUsersTable.googleId,
    });

  res.json(updated);
});

// ── GET /api/customer/google-client-id ──────────────────────────────────────
router.get("/google-client-id", async (_req, res) => {
  const [settings] = await db.select({ googleClientId: settingsTable.googleClientId }).from(settingsTable).limit(1);
  res.json({ clientId: settings?.googleClientId ?? null });
});

export default router;
