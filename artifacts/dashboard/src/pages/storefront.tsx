import { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import html2canvas from 'html2canvas';
import {
  ShoppingCart, MessageCircle, X, Send, Loader2,
  Package, Trash2, Plus, Minus, Search, ArrowRight,
  Camera, Image as ImageIcon2, Mic, Smile, ThumbsUp,
  LogOut, Phone, Smartphone, Share2, Gift,
  User, Eye, EyeOff, Mail, Check, ChevronLeft,
} from 'lucide-react';


// ─── Per-button animation type ───────────────────────────────────────────────
type BtnAnim = 'static' | 'neon-trace' | 'glass-shimmer' | 'pulse';
interface BtnAnimations { cart: BtnAnim; chat: BtnAnim; whatsapp: BtnAnim; fab: BtnAnim; cartColor?: string; chatColor?: string; }
const DEFAULT_BTN_ANIMS: BtnAnimations = { cart: 'static', chat: 'static', whatsapp: 'neon-trace', fab: 'neon-trace', cartColor: '#22c55e', chatColor: '#1877f2' };

// ─── Neon Snake Border ────────────────────────────────────────────────────────
// Draws an SVG rect that traces the exact button perimeter with a travelling
// "snake of light" using stroke-dashoffset animation — NO background gradients.
function NeonSnakeBorder({
  children,
  color,
  borderRadius = 11,
  strokeWidth = 2.5,
  snakeFraction = 0.28,
  duration = 2.5,
  className = '',
  style,
}: {
  children: React.ReactNode;
  color: string;
  borderRadius?: number;
  strokeWidth?: number;
  snakeFraction?: number;
  duration?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  // Stable unique ID per instance so multiple buttons don't share @keyframes
  const animId = useRef(`snk${Math.random().toString(36).slice(2, 7)}`).current;

  useLayoutEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const measure = () => setSize({ w: el.offsetWidth, h: el.offsetHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Perimeter of the rounded rect (straight segments + quarter-circle corners)
  const r = Math.min(borderRadius, size ? Math.min(size.w, size.h) / 2 : borderRadius);
  const perimeter = size
    ? 2 * (size.w - 2 * r + size.h - 2 * r) + 2 * Math.PI * r
    : 0;
  const snakeLen = perimeter * snakeFraction;
  const pad = strokeWidth / 2;

  return (
    <div ref={ref} style={{ position: 'relative', ...style }} className={className}>
      {size && perimeter > 0 && (
        <svg
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            width: size.w,
            height: size.h,
            pointerEvents: 'none',
            overflow: 'visible',
            zIndex: 2,
          }}
          viewBox={`0 0 ${size.w} ${size.h}`}
        >
          <style>{`
            @keyframes ${animId} {
              from { stroke-dashoffset: 0; }
              to   { stroke-dashoffset: ${(-perimeter).toFixed(2)}; }
            }
          `}</style>
          <rect
            x={pad}
            y={pad}
            width={size.w - strokeWidth}
            height={size.h - strokeWidth}
            rx={r}
            ry={r}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${snakeLen.toFixed(2)} ${(perimeter - snakeLen).toFixed(2)}`}
            strokeDashoffset={0}
            style={{
              filter: `drop-shadow(0 0 3px ${color}) drop-shadow(0 0 6px ${color})`,
              animation: `${animId} ${duration}s linear infinite`,
            }}
          />
        </svg>
      )}
      {children}
    </div>
  );
}

// ─── WhatsApp SVG icon ────────────────────────────────────────────────────────
function WhatsAppIcon({ size = 24, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}

function FacebookIcon({ size = 24, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  );
}

function InstagramIcon({ size = 24, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
    </svg>
  );
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface Product {
  id: number;
  productId: string;
  nameAr: string;
  nameEn: string;
  category: string;
  gender: string;
  ageMin: number;
  ageMax: number;
  ageRanges: string | null;
  price: number;
  discountPrice: number | null;
  isOnSale: boolean;
  colors: string | null;
  descriptionAr: string | null;
  publicImageUrl: string | null;
  imageUrl: string | null;
}

interface CartItem { product: Product; qty: number }

function getEffectivePrice(product: Product): number {
  return (product.isOnSale && product.discountPrice != null && product.discountPrice > 0)
    ? product.discountPrice
    : product.price;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  imageUrl?: string;
}

interface StorefrontUser {
  name: string;
  phone: string;
  joinedAt: string;
}

const STOREFRONT_USER_KEY = 'storefront_user';
const VISITOR_ID_KEY = 'storefront_visitor_id';

/** Return a persistent anonymous visitor ID (UUID stored in localStorage) */
function getOrCreateVisitorId(): string {
  try {
    const existing = localStorage.getItem(VISITOR_ID_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(VISITOR_ID_KEY, id);
    return id;
  } catch { return Math.random().toString(36).slice(2); }
}

/** Auto-create an anonymous StorefrontUser from localStorage so all
 *  existing features (cart, bee, fortune) keep working per-device. */
function getOrCreateAnonymousUser(): StorefrontUser {
  try {
    const raw = localStorage.getItem(STOREFRONT_USER_KEY);
    if (raw) return JSON.parse(raw) as StorefrontUser;
  } catch { /* ignore */ }
  const visitorId = getOrCreateVisitorId();
  const user: StorefrontUser = {
    name: '',
    phone: `anon_${visitorId}`,
    joinedAt: new Date().toISOString(),
  };
  localStorage.setItem(STOREFRONT_USER_KEY, JSON.stringify(user));
  return user;
}

// REMOVED: WhatsAppGate — visitors now enter directly, location tracked by IP.
function WhatsAppGate({ onLogin }: { onLogin: (u: StorefrontUser) => void }) {
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [fullPhone, setFullPhone] = useState('');   // +964XXXXXXXXX
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [devOtp, setDevOtp] = useState('');         // shown in dev mode
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);   // seconds until resend allowed
  const otpRefs = [
    useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null),
  ];

  // Countdown timer for resend
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  // ── Step 1: send OTP ────────────────────────────────────────────────────────
  const handleSendOtp = async () => {
    const cleaned = phone.replace(/\D/g, '').replace(/^0/, '');
    if (cleaned.length < 9) { setError('أدخل رقم واتساب صحيح (9+ أرقام)'); return; }
    setError('');
    setLoading(true);
    const fp = `+964${cleaned}`;
    setFullPhone(fp);
    try {
      const res = await fetch('/api/storefront/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: fp, name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'حدث خطأ. حاول مرة أخرى.'); return; }
      if (data.devOtp) setDevOtp(data.devOtp);
      setCountdown(60);
      setStep('otp');
      setTimeout(() => otpRefs[0].current?.focus(), 100);
    } catch {
      setError('تعذّر الاتصال بالخادم. تحقق من الإنترنت.');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: verify OTP ──────────────────────────────────────────────────────
  const handleVerify = async (digits = otpDigits) => {
    const otp = digits.join('');
    if (otp.length < 6) { setError('أدخل الرمز المكون من 6 أرقام'); return; }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/storefront/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: fullPhone, otp }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'رمز خاطئ'); return; }
      const user: StorefrontUser = {
        name: data.name || name.trim() || 'زائر',
        phone: fullPhone,
        joinedAt: new Date().toISOString(),
      };
      localStorage.setItem(STOREFRONT_USER_KEY, JSON.stringify(user));
      onLogin(user);
    } catch {
      setError('تعذّر الاتصال بالخادم.');
    } finally {
      setLoading(false);
    }
  };

  // ── OTP digit input handling ────────────────────────────────────────────────
  const handleOtpChange = (idx: number, val: string) => {
    const digit = val.replace(/\D/g, '').slice(-1);
    const next = [...otpDigits];
    next[idx] = digit;
    setOtpDigits(next);
    setError('');
    if (digit && idx < 5) otpRefs[idx + 1].current?.focus();
    if (next.every(d => d !== '')) handleVerify(next);
  };

  const handleOtpKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[idx] && idx > 0) otpRefs[idx - 1].current?.focus();
    if (e.key === 'Enter' && otpDigits.every(d => d !== '')) handleVerify();
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (text.length === 6) {
      const next = text.split('');
      setOtpDigits(next);
      otpRefs[5].current?.focus();
      setTimeout(() => handleVerify(next), 50);
    }
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    setOtpDigits(['', '', '', '', '', '']);
    setDevOtp('');
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/storefront/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: fullPhone, name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'حدث خطأ'); return; }
      if (data.devOtp) setDevOtp(data.devOtp);
      setCountdown(60);
      setTimeout(() => otpRefs[0].current?.focus(), 100);
    } catch {
      setError('تعذّر إعادة الإرسال.');
    } finally {
      setLoading(false);
    }
  };

  // ── Shared green header ─────────────────────────────────────────────────────
  const GreenHeader = () => (
    <div style={{ width: '100%', background: 'linear-gradient(160deg,#25d366 0%,#128c7e 100%)', padding: '40px 24px 64px', textAlign: 'center' }}>
      <div style={{ display: 'inline-block', background: '#fff', borderRadius: 24, padding: '10px 16px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
        <img
          src={`${import.meta.env.BASE_URL}logo.png`}
          alt="SONBOLA"
          style={{ width: 140, height: 100, objectFit: 'contain', display: 'block' }}
        />
      </div>
    </div>
  );

  const cardStyle: React.CSSProperties = {
    width: '100%', maxWidth: 400, background: '#fff', borderRadius: 24,
    padding: '28px 24px 24px', margin: '-40px 16px 32px',
    boxShadow: '0 8px 40px rgba(0,0,0,0.12)', boxSizing: 'border-box',
  };

  const inputStyle = (hasError = false): React.CSSProperties => ({
    width: '100%', height: 44, borderRadius: 12, outline: 'none',
    border: `1.5px solid ${hasError ? '#ef4444' : '#e5e7eb'}`,
    padding: '0 14px', fontSize: 14, color: '#111', background: '#fafafa',
    boxSizing: 'border-box', transition: 'border-color 0.15s',
  });

  const btnStyle = (disabled = false): React.CSSProperties => ({
    width: '100%', height: 50, borderRadius: 14, border: 'none',
    background: disabled ? '#86efac' : 'linear-gradient(135deg,#25d366,#128c7e)',
    color: '#fff', fontSize: 15, fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
    boxShadow: '0 4px 16px rgba(37,211,102,0.35)', transition: 'all 0.2s',
  });

  return (
    <div dir="rtl" style={{ minHeight: '100vh', background: '#f0fdf4', fontFamily: "'Segoe UI',Tahoma,sans-serif", display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <GreenHeader />

      {/* ── STEP 1: Phone entry ──────────────────────────────────────── */}
      {step === 'phone' && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#25d366', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <WhatsAppIcon size={22} color="#fff" />
            </div>
            <div>
              <p style={{ fontSize: 16, fontWeight: 800, color: '#111', margin: 0 }}>الدخول عبر الواتساب</p>
              <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>سنرسل رمز تحقق على واتساب</p>
            </div>
          </div>
          <hr style={{ border: 'none', borderTop: '1px solid #f0f0f0', margin: '16px 0' }} />

          {/* Name */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              الاسم <span style={{ color: '#9ca3af', fontWeight: 400 }}>(اختياري)</span>
            </label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="أدخل اسمك" maxLength={40}
              style={inputStyle()} onFocus={e => (e.target.style.borderColor = '#25d366')} onBlur={e => (e.target.style.borderColor = '#e5e7eb')}
              onKeyDown={e => e.key === 'Enter' && handleSendOtp()} />
          </div>

          {/* Phone */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              رقم الواتساب <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <div style={{ display: 'flex' }}>
              <div style={{ height: 44, padding: '0 12px', background: '#f0fdf4', border: '1.5px solid #e5e7eb', borderLeft: 'none', borderRadius: '12px 0 0 12px', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, fontSize: 14, color: '#374151', fontWeight: 600 }}>
                🇮🇶 <span style={{ color: '#6b7280' }}>+964</span>
              </div>
              <input value={phone} onChange={e => { setPhone(e.target.value.replace(/\D/g, '')); setError(''); }}
                placeholder="07XXXXXXXXX" maxLength={12} inputMode="numeric"
                style={{ ...inputStyle(!!error), flex: 1, borderRadius: '0 12px 12px 0', minWidth: 0 }}
                onFocus={e => { if (!error) e.target.style.borderColor = '#25d366'; }} onBlur={e => { if (!error) e.target.style.borderColor = '#e5e7eb'; }}
                onKeyDown={e => e.key === 'Enter' && handleSendOtp()} />
            </div>
          </div>

          {error && <p style={{ fontSize: 12, color: '#ef4444', margin: '-10px 0 14px', display: 'flex', alignItems: 'center', gap: 4 }}>⚠️ {error}</p>}

          <button onClick={handleSendOtp} disabled={loading} style={btnStyle(loading)}>
            {loading ? <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> جارٍ الإرسال...</> : <><WhatsAppIcon size={20} color="#fff" /> إرسال رمز التحقق</>}
          </button>
          <p style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', marginTop: 14, lineHeight: 1.6 }}>
            🔒 رقمك محفوظ لدينا ويستخدم فقط للتواصل بشأن طلباتك
          </p>
        </div>
      )}

      {/* ── STEP 2: OTP entry ────────────────────────────────────────── */}
      {step === 'otp' && (
        <div style={cardStyle}>
          {/* Back */}
          <button onClick={() => { setStep('phone'); setError(''); setOtpDigits(['','','','','','']); }}
            style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 13, cursor: 'pointer', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 4, padding: 0 }}>
            ← تغيير الرقم
          </button>

          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#25d366', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <WhatsAppIcon size={30} color="#fff" />
            </div>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#111', margin: '0 0 6px' }}>أدخل رمز التحقق</p>
            <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>
              تم إرسال رمز مكون من 6 أرقام إلى
            </p>
            <p style={{ fontSize: 14, fontWeight: 700, color: '#25d366', margin: '2px 0 0', direction: 'ltr' }}>{fullPhone}</p>
          </div>

          {/* OTP display */}
          {devOtp && (
            <div style={{ background: '#f0fdf4', border: '2px solid #25d366', borderRadius: 14, padding: '14px 16px', marginBottom: 16, textAlign: 'center' }}>
              <p style={{ fontSize: 12, color: '#16a34a', margin: '0 0 6px', fontWeight: 600 }}>رمز التحقق الخاص بك</p>
              <strong style={{ letterSpacing: 8, fontSize: 28, color: '#111', fontFamily: 'monospace' }}>{devOtp}</strong>
            </div>
          )}

          {/* 6 digit boxes */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 16, direction: 'ltr' }}>
            {otpDigits.map((d, i) => (
              <input
                key={i}
                ref={otpRefs[i]}
                value={d}
                onChange={e => handleOtpChange(i, e.target.value)}
                onKeyDown={e => handleOtpKeyDown(i, e)}
                onPaste={i === 0 ? handleOtpPaste : undefined}
                maxLength={1}
                inputMode="numeric"
                style={{
                  width: 44, height: 52, textAlign: 'center', fontSize: 22, fontWeight: 700,
                  borderRadius: 12, border: `2px solid ${error ? '#ef4444' : d ? '#25d366' : '#e5e7eb'}`,
                  outline: 'none', background: d ? '#f0fdf4' : '#fafafa', color: '#111',
                  transition: 'border-color 0.15s',
                }}
              />
            ))}
          </div>

          {error && <p style={{ fontSize: 12, color: '#ef4444', textAlign: 'center', margin: '0 0 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>⚠️ {error}</p>}

          <button onClick={() => handleVerify()} disabled={loading || otpDigits.some(d => !d)} style={btnStyle(loading || otpDigits.some(d => !d))}>
            {loading ? <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> جارٍ التحقق...</> : <>✓ تحقق من الرمز</>}
          </button>

          {/* Resend */}
          <div style={{ textAlign: 'center', marginTop: 14 }}>
            {countdown > 0 ? (
              <p style={{ fontSize: 12, color: '#9ca3af' }}>يمكنك إعادة الإرسال بعد {countdown} ثانية</p>
            ) : (
              <button onClick={handleResend} style={{ background: 'none', border: 'none', color: '#25d366', fontSize: 13, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}>
                إعادة إرسال الرمز
              </button>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes wheel-idle {
          0%   { transform: rotate(0deg); }
          20%  { transform: rotate(12deg); }
          40%  { transform: rotate(-8deg); }
          60%  { transform: rotate(10deg); }
          80%  { transform: rotate(-5deg); }
          100% { transform: rotate(0deg); }
        }
        @keyframes wheel-glow {
          0%, 100% { filter: drop-shadow(0 0 6px rgba(236,72,153,0.8)); }
          50%       { filter: drop-shadow(0 0 14px rgba(236,72,153,1)); }
        }
        @keyframes led-blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SEASON_AR: Record<string, string> = { Summer: 'صيفي', Winter: 'شتوي', Spring: 'بهاري' };
const GENDER_AR: Record<string, string> = { Girls: 'بناتي', Boys: 'ولادي', both: 'اثنيناتهم' };

/** Returns an array of age range strings (each includes unit like "سنة" or "شهر") */
function getAgeRanges(p: Product): string[] {
  const hasUnit = (s: string) => /[^\d.\s]/.test(s.trim());
  try {
    const r = p.ageRanges ? JSON.parse(p.ageRanges) : null;
    if (Array.isArray(r) && r.length > 0) {
      return r.map((x: any) => {
        const min = String(x.min ?? '').trim();
        const max = String(x.max ?? '').trim();
        const minStr = hasUnit(min) ? min : (min ? `${min} سنة` : '');
        const maxStr = hasUnit(max) ? max : (max ? `${max} سنة` : '');
        return `${minStr} الى ${maxStr}`.trim();
      }).filter(Boolean);
    }
  } catch {}
  const min = p.ageMin ?? 0;
  const max = p.ageMax ?? 0;
  if (min > 0 && min < 1) return [`${Math.round(min * 12)} شهر الى ${Math.round(max * 12)} شهر`];
  return [`${min} سنة الى ${max} سنة`];
}

/** Single-line label joined with Arabic comma */
function parseAgeLabel(p: Product): string {
  return getAgeRanges(p).join('، ');
}

/** JSX: each range on its own line */
function AgeRangeLines({ product, className = '', style }: { product: Product; className?: string; style?: React.CSSProperties }) {
  const ranges = getAgeRanges(product);
  return (
    <span className={className} style={style}>
      {ranges.map((r, i) => (
        <span key={i} style={{ display: 'block', lineHeight: '1.6' }}>🧒 {r}</span>
      ))}
    </span>
  );
}

/** JSX: each range as a separate badge pill */
function AgeRangeBadges({ product, badgeClass }: { product: Product; badgeClass: string }) {
  const ranges = getAgeRanges(product);
  return (
    <>
      {ranges.map((r, i) => (
        <span key={i} className={badgeClass}>🧒 {r}</span>
      ))}
    </>
  );
}

function formatPrice(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return Number.isInteger(k) ? `${k} الف` : `${k.toFixed(1)} الف`;
  }
  return `${n}`;
}

// Quick emojis panel items
const QUICK_EMOJIS = ['😊', '👍', '❤️', '😂', '🙏', '👌', '🌸', '✅'];

// ─── Product Card shown at top of chat ───────────────────────────────────────

function ProductChatCard({ product }: { product: Product }) {
  const imgSrc = product.publicImageUrl || product.imageUrl;
  return (
    <div style={{
      margin: '0 0 10px',
      borderRadius: 12,
      overflow: 'hidden',
      border: '1px solid #e4e6eb',
      background: '#fff',
      boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
    }}>
      {/* Image with overlaid badges */}
      <div style={{ position: 'relative', aspectRatio: '1/1', background: '#f0f2f5' }}>
        {imgSrc ? (
          <img src={imgSrc} alt={product.productId} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Package size={40} color="#ccc" />
          </div>
        )}
        {/* Price — bottom right */}
        <span style={{
          position: 'absolute', bottom: 8, right: 8,
          background: '#f59e0b', color: '#fff',
          padding: '2px 9px', borderRadius: 6,
          fontSize: 12, fontWeight: 700,
        }}>
          {formatPrice(product.price)}
        </span>
      </div>
      {/* Meta row */}
      <div style={{ padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ fontSize: 11, color: '#65676b' }}>
            {SEASON_AR[product.category] ?? product.category} · {GENDER_AR[product.gender] ?? product.gender}
          </span>
          <br />
          <AgeRangeLines product={product} style={{ fontSize: 11, color: '#8a8d91' } as React.CSSProperties} />
        </div>
        <span style={{ fontSize: 11, color: '#1877f2', fontWeight: 600 }}>استفسار عن هذا المنتج</span>
      </div>
    </div>
  );
}

// ─── Chat Widget (Messenger-style) ───────────────────────────────────────────

interface ChatWidgetProps {
  initialProduct?: Product;
  onClose: () => void;
  user?: StorefrontUser;
}

interface Suggestion { text: string; reply: string; }
const DEFAULT_CHAT_SUGGESTIONS: Suggestion[] = [
  { text: 'شنو عندكم؟', reply: '' },
  { text: 'ما هي الأسعار؟', reply: '' },
  { text: 'كيف أطلب؟', reply: '' },
  { text: 'طريقة التوصيل', reply: '' },
];

function ChatWidget({ initialProduct, onClose, user }: ChatWidgetProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showEmojis, setShowEmojis] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sentInitial = useRef(false);
  const productCtxRef = useRef<Product | undefined>(initialProduct);
  // Unique session ID — ensures each chat session gets its own DB row
  const sessionId = useRef<string>(crypto.randomUUID());

  // Load suggestions from settings (handles old string[] and new {text,reply}[] formats)
  useEffect(() => {
    if (initialProduct) {
      setSuggestions([
        { text: 'كم السعر؟', reply: '' },
        { text: 'هل متوفر؟', reply: '' },
        { text: 'ما الأحجام؟', reply: '' },
        { text: 'أريد الحجز', reply: '' },
      ]);
      return;
    }
    fetch('/api/settings')
      .then(r => r.ok ? r.json() : {})
      .then((data: any) => {
        try {
          // chatSuggestions takes priority; fall back to storefrontSuggestions for legacy
          const raw = data.chatSuggestions ?? data.storefrontSuggestions;
          const parsed = raw ? JSON.parse(raw) : null;
          if (Array.isArray(parsed)) {
            const normalized: Suggestion[] = parsed
              .map((s: any) =>
                typeof s === 'string'
                  ? { text: s.trim(), reply: '' }
                  : { text: (s?.text ?? '').trim(), reply: (s?.reply ?? '') }
              )
              // Filter out empty texts AND items that look like product codes (no Arabic chars)
              .filter(s => s.text && /[\u0600-\u06FF]/.test(s.text));
            setSuggestions(normalized.length > 0 ? normalized : DEFAULT_CHAT_SUGGESTIONS);
          } else {
            setSuggestions(DEFAULT_CHAT_SUGGESTIONS);
          }
        } catch {
          setSuggestions(DEFAULT_CHAT_SUGGESTIONS);
        }
      })
      .catch(() => setSuggestions(DEFAULT_CHAT_SUGGESTIONS));
  }, []);

  // Init messages — load history if user is logged in
  useEffect(() => {
    const initChat = async () => {
      let previousMsgs: ChatMessage[] = [];

      // Load previous conversation history for logged-in users
      if (user?.phone && !initialProduct) {
        try {
          const res = await fetch(`/api/storefront/user-history?phone=${encodeURIComponent(user.phone)}`);
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data.messages) && data.messages.length > 0) {
              previousMsgs = data.messages;
            }
          }
        } catch {}
      }

      if (initialProduct && !sentInitial.current) {
        sentInitial.current = true;
        setMessages([{ role: 'assistant', content: `أهلاً! كيف أقدر أساعدك بخصوص كود ${initialProduct.productId}؟` }]);
        setTimeout(() => {
          // Send product image to AI (publicImageUrl = HTTPS, imageUrl only if not base64)
          const productImg = initialProduct.publicImageUrl ||
            (initialProduct.imageUrl && !initialProduct.imageUrl.startsWith('data:') ? initialProduct.imageUrl : undefined);
          doSend(`أريد معرفة تفاصيل كود ${initialProduct.productId}`, initialProduct, productImg);
        }, 600);
      } else if (previousMsgs.length > 0) {
        // Show history + separator + fresh greeting
        const separator: ChatMessage = {
          role: 'assistant',
          content: '— محادثاتك السابقة —',
        };
        const greeting: ChatMessage = {
          role: 'assistant',
          content: `أهلاً مجدداً ${user?.name ? user.name : ''}! كيف أقدر أساعدك اليوم؟`,
        };
        setMessages([separator, ...previousMsgs, greeting]);
        setTimeout(() => inputRef.current?.focus(), 100);
      } else {
        setMessages([{ role: 'assistant', content: 'أهلاً وسهلاً! كيف أقدر أساعدك اليوم؟' }]);
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    };

    initChat();
  }, []);

  // Only auto-scroll when user sends a new message, not when history loads
  const shouldScrollRef = useRef(false);

  useEffect(() => {
    if (shouldScrollRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading]);

  // ── Core send function ──────────────────────────────────────────────────────
  async function doSend(text: string, productCtx?: Product, imageDataUrl?: string) {
    if (!text.trim() && !imageDataUrl) return;

    const userMsg: ChatMessage = {
      role: 'user',
      content: text,
      ...(imageDataUrl && { imageUrl: imageDataUrl }),
    };

    shouldScrollRef.current = true;
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setShowEmojis(false);
    setLoading(true);

    const ctx = productCtx ?? productCtxRef.current;
    // Filter out UI-only separator messages and build clean history for the bot
    const history = [...messages, userMsg]
      .filter(m => m.content !== '— محادثاتك السابقة —')
      .map(m => ({ role: m.role, content: m.content || (m.imageUrl ? '[صورة]' : '') }))
      .filter(m => m.content)
      .slice(-200); // Keep last 200 messages

    try {
      const ctxStr = ctx
        ? `كود: ${ctx.productId} | سعر: ${formatPrice(ctx.price)} | أعمار: ${parseAgeLabel(ctx)} | فئة: ${SEASON_AR[ctx.category] ?? ctx.category} | جنس: ${GENDER_AR[ctx.gender] ?? ctx.gender}${ctx.colors ? ` | ألوان: ${ctx.colors}` : ''}${ctx.descriptionAr ? ` | ملاحظة: ${ctx.descriptionAr}` : ''}`
        : undefined;

      const resp = await fetch('/api/storefront/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text || '',
          sessionHistory: history,
          productContext: ctxStr,
          ...(imageDataUrl ? { imageDataUrl } : {}),
        }),
      });
      const data = await resp.json();
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: data.reply ?? 'عذراً، حدث خطأ. حاول مرة أخرى.',
      };
      const updatedMessages = [...history, assistantMsg];
      setMessages(updatedMessages);

      if (user?.phone) {
        fetch('/api/storefront/chats/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: user.phone,
            name: user.name,
            sessionId: sessionId.current,
            messages: updatedMessages.map(m => ({
              role: m.role,
              content: m.content,
              ...((m as ChatMessage).imageUrl ? { imageUrl: (m as ChatMessage).imageUrl } : {}),
            })),
          }),
        }).catch(() => {});
      }
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'عذراً، حدث خطأ في الاتصال. حاول مرة أخرى.',
      }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleSend = () => { if (input.trim() && !loading) doSend(input.trim()); };
  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };
  const handleThumbsUp = () => doSend('👍');
  const handleEmojiPick = (em: string) => {
    setInput(prev => prev + em);
    setShowEmojis(false);
    inputRef.current?.focus();
  };
  const handleSuggestion = (s: Suggestion) => {
    if (s.reply && s.reply.trim()) {
      // Show admin's pre-written reply directly — no AI call
      shouldScrollRef.current = true;
      const userMsg: ChatMessage = { role: 'user', content: s.text };
      const assistantMsg: ChatMessage = { role: 'assistant', content: s.reply.trim() };
      const updated = [...messages, userMsg, assistantMsg];
      setMessages(updated);
      // Save to DB
      if (user?.phone) {
        const toSave = updated
          .filter(m => m.content !== '— محادثاتك السابقة —')
          .map(m => ({ role: m.role, content: m.content, ...(m.imageUrl ? { imageUrl: m.imageUrl } : {}) }));
        fetch('/api/storefront/chats/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: user.phone, name: user.name, messages: toSave }),
        }).catch(() => {});
      }
    } else {
      // No pre-written reply — let AI handle it
      doSend(s.text);
    }
  };

  // File input → show image in chat + send to bot
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string;
      doSend(input.trim() || '', undefined, dataUrl);
      setInput('');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 49, background: 'rgba(0,0,0,0.35)' }}
        onClick={onClose}
      />
      <div
        dir="rtl"
        style={{
          position: 'fixed',
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 50,
          width: 'min(420px, calc(100vw - 20px))',
          display: 'flex', flexDirection: 'column',
          borderRadius: 18, overflow: 'hidden',
          boxShadow: '0 12px 48px rgba(0,0,0,0.35)',
          fontFamily: "'Segoe UI', Tahoma, Arial, sans-serif",
          background: '#fff',
          height: 'min(580px, calc(100dvh - 60px))',
        }}
      >
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, #1877f2 0%, #0d65d9 100%)',
        padding: '11px 14px',
        display: 'flex', alignItems: 'center', gap: 10,
        flexShrink: 0,
      }}>
        {/* Avatar — SONBOLA logo */}
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          background: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          border: '2px solid rgba(255,255,255,0.5)',
          overflow: 'hidden',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        }}>
          <img
            src={`${import.meta.env.BASE_URL}logo.png`}
            alt="SONBOLA"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>
        {/* Name + status */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ color: '#fff', fontWeight: 700, fontSize: 15, margin: 0, lineHeight: 1.3, letterSpacing: 0.5 }}>
            SONBOLA
          </p>
          <p style={{ color: 'rgba(255,255,255,0.78)', fontSize: 11, margin: 0 }}>
            {initialProduct ? `استفسار عن كود ${initialProduct.productId}` : 'نرد على رسائلك بسرعة'}
          </p>
        </div>
        {/* Close */}
        <button
          onClick={onClose}
          style={{ color: 'rgba(255,255,255,0.85)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 8, display: 'flex', lineHeight: 1 }}
        >
          <X size={19} />
        </button>
      </div>

      {/* ── Messages area ──────────────────────────────────────────── */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '12px 12px 6px',
        background: '#f0f2f5',
        display: 'flex', flexDirection: 'column', gap: 6,
        minHeight: 0,
      }}>
        {/* Product card at top */}
        {initialProduct && <ProductChatCard product={initialProduct} />}

        {/* Messages */}
        {messages.map((m, i) => {
          // Separator — styled as a date divider
          if (m.content === '— محادثاتك السابقة —') {
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0' }}>
                <div style={{ flex: 1, height: 1, background: '#d1d5db' }} />
                <span style={{ fontSize: 11, color: '#6b7280', whiteSpace: 'nowrap', fontWeight: 500 }}>
                  محادثاتك السابقة
                </span>
                <div style={{ flex: 1, height: 1, background: '#d1d5db' }} />
              </div>
            );
          }
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-start' : 'flex-end' }}>
              {m.imageUrl && (
                <div style={{
                  maxWidth: '80%', marginBottom: 4,
                  borderRadius: m.role === 'user' ? '16px 16px 16px 4px' : '16px 16px 4px 16px',
                  overflow: 'hidden', border: '1px solid #e4e6eb',
                }}>
                  <img src={m.imageUrl} alt="صورة" style={{ width: '100%', maxWidth: 200, display: 'block' }} />
                </div>
              )}
              {m.content && (
                <div style={{
                  maxWidth: '82%',
                  padding: '9px 13px',
                  borderRadius: m.role === 'user'
                    ? '18px 18px 18px 4px'
                    : '18px 18px 4px 18px',
                  background: m.role === 'user' ? '#fff' : '#1877f2',
                  color: m.role === 'user' ? '#1c1e21' : '#fff',
                  fontSize: 13.5, lineHeight: 1.55,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {m.content}
                </div>
              )}
            </div>
          );
        })}

        {/* Typing indicator */}
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{
              background: '#1877f2', padding: '10px 15px',
              borderRadius: '18px 18px 4px 18px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
              display: 'flex', gap: 5, alignItems: 'center',
            }}>
              {[0, 150, 300].map(d => (
                <span key={d} style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: 'rgba(255,255,255,0.85)',
                  display: 'inline-block',
                  animation: 'msgBounce 1.1s infinite ease-in-out',
                  animationDelay: `${d}ms`,
                }} />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Suggested replies ──────────────────────────────────────── */}
      {suggestions.length > 0 && (
        <div style={{
          padding: '7px 10px 5px',
          background: '#fff',
          borderTop: '1px solid #e4e6eb',
          flexShrink: 0,
        }}>
          <p style={{ fontSize: 10, color: '#8a8d91', margin: '0 0 5px', fontWeight: 500 }}>
            ردود سريعة · اضغط للإرسال
          </p>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2, scrollbarWidth: 'none' }}>
            {suggestions.map(s => (
              <button
                key={s.text}
                onClick={() => handleSuggestion(s)}
                style={{
                  flexShrink: 0, padding: '5px 13px',
                  borderRadius: 16,
                  border: '1.5px solid #1877f2',
                  color: '#1877f2', fontSize: 12, fontWeight: 500,
                  background: '#fff', cursor: 'pointer',
                  transition: 'all 0.15s',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#e7f0ff'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff'; }}
              >
                {s.text}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Emoji mini-panel ────────────────────────────────────────── */}
      {showEmojis && (
        <div style={{
          padding: '8px 12px',
          background: '#fff',
          borderTop: '1px solid #e4e6eb',
          display: 'flex', gap: 8, flexWrap: 'wrap',
          flexShrink: 0,
        }}>
          {QUICK_EMOJIS.map(em => (
            <button
              key={em}
              onClick={() => handleEmojiPick(em)}
              style={{ fontSize: 22, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', borderRadius: 6, lineHeight: 1 }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f0f2f5')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              {em}
            </button>
          ))}
        </div>
      )}

      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <div style={{
        padding: '8px 10px',
        background: '#fff',
        borderTop: '1px solid #e4e6eb',
        display: 'flex', alignItems: 'center', gap: 6,
        flexShrink: 0,
      }}>
        {/* + button */}
        <ToolbarBtn
          title="إجراءات"
          onClick={() => fileInputRef.current?.click()}
          active={false}
        >
          <Plus size={20} />
        </ToolbarBtn>

        {/* Camera */}
        <ToolbarBtn title="كاميرا" onClick={() => { if (fileInputRef.current) { fileInputRef.current.accept = 'image/*;capture=camera'; fileInputRef.current.click(); } }}>
          <Camera size={20} />
        </ToolbarBtn>

        {/* Gallery */}
        <ToolbarBtn title="معرض الصور" onClick={() => { if (fileInputRef.current) { fileInputRef.current.accept = 'image/*'; fileInputRef.current.click(); } }}>
          <ImageIcon2 size={20} />
        </ToolbarBtn>

        {/* Mic — decorative (voice messages not supported) */}
        <ToolbarBtn title="رسالة صوتية" onClick={() => doSend('🎤 رسالة صوتية')}>
          <Mic size={20} />
        </ToolbarBtn>

        {/* Text input */}
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Aa"
          disabled={loading}
          style={{
            flex: 1, height: 36,
            borderRadius: 20, border: 'none',
            background: '#f0f2f5',
            padding: '0 14px',
            fontSize: 13, color: '#1c1e21',
            outline: 'none', minWidth: 0,
          }}
        />

        {/* Emoji */}
        <ToolbarBtn title="إيموجي" onClick={() => setShowEmojis(v => !v)} active={showEmojis}>
          <Smile size={20} />
        </ToolbarBtn>

        {/* Send / Thumbs-up */}
        {input.trim() ? (
          <ToolbarBtn title="إرسال" onClick={handleSend} active color="#1877f2">
            <Send size={18} style={{ transform: 'scaleX(-1)' }} />
          </ToolbarBtn>
        ) : (
          <ToolbarBtn title="إعجاب" onClick={handleThumbsUp}>
            <ThumbsUp size={20} />
          </ToolbarBtn>
        )}
      </div>

      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />

      <style>{`
        @keyframes msgBounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.7; }
          30% { transform: translateY(-5px); opacity: 1; }
        }
      `}</style>
    </div>
    </>
  );
}

// ─── Toolbar button helper ────────────────────────────────────────────────────

function ToolbarBtn({
  children, onClick, title, active = false, color = '#1877f2',
}: {
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
  active?: boolean;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 34, height: 34, borderRadius: '50%',
        border: 'none', cursor: 'pointer', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: active ? '#fff' : color,
        background: active ? color : 'transparent',
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = '#f0f2f5'; }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >
      {children}
    </button>
  );
}

// ─── Iraqi provinces constant ─────────────────────────────────────────────────
const IRAQI_PROVINCES = [
  'بغداد','البصرة','نينوى','أربيل','السليمانية','كركوك','الأنبار',
  'بابل','ذي قار','واسط','النجف','كربلاء','صلاح الدين','ميسان',
  'المثنى','القادسية','ديالى','دهوك','حلبجة','زاخو',
];

function getDeliveryDays(fee: number): string {
  return fee <= 3000 ? '1-2 يوم' : '2-3 يوم';
}

// ─── Cart Drawer ──────────────────────────────────────────────────────────────

interface CartDrawerProps {
  items: CartItem[];
  onRemove: (id: string) => void;
  onQtyChange: (id: string, qty: number) => void;
  onClearCart: () => void;
  onClose: () => void;
  user: StorefrontUser;
  btnAnimType?: string;
}

function CartDrawer({ items, onRemove, onQtyChange, onClearCart, onClose, user, btnAnimType = 'neon-trace' }: CartDrawerProps) {
  const total = items.reduce((s, i) => s + getEffectivePrice(i.product) * i.qty, 0);
  const [screen, setScreen] = useState<'cart' | 'checkout' | 'preview'>('cart');
  const [isSending, setIsSending] = useState(false);
  // Persist "sent" state in sessionStorage so page reload/remount doesn't reset it
  const sentKey = `wa_sent_${user?.phone || 'x'}`;
  const [hasSent, setHasSent] = useState(() => !!sessionStorage.getItem(sentKey));
  const sendLockRef = useRef(!!sessionStorage.getItem(sentKey));
  const [pendingOrderId, setPendingOrderId] = useState<number | null>(null);
  const invoiceRef = useRef<HTMLDivElement>(null);
  const [deliveryFees, setDeliveryFees] = useState<Record<string, number>>({});
  const [phone1, setPhone1] = useState('');
  const [phone2, setPhone2] = useState('');
  const [province, setProvince] = useState('');
  const [address, setAddress] = useState('');
  const [ageNote, setAgeNote] = useState('');
  const [formError, setFormError] = useState('');

  // ── Layout customisation (fetched from server, editable by admin only) ──────
  type CartLayout = { gap: number; inputPy: number; labelSize: number; cardPad: number; btnH: number };
  type CartColors = { checkoutBtn: string; formBg: string; fieldBorder: string; labelColor: string; summaryBg: string; drawerBg: string };
  const LAYOUT_DEFAULTS: CartLayout = { gap: 14, inputPy: 10, labelSize: 12, cardPad: 12, btnH: 60 };
  const COLOR_DEFAULTS: CartColors = { checkoutBtn: '#1a73e8', formBg: '#ffffff', fieldBorder: '#4ade80', labelColor: '#374151', summaryBg: '#f9fafb', drawerBg: '#ffffff' };
  const [layout, setLayout] = useState<CartLayout>(LAYOUT_DEFAULTS);
  const [colors, setColors] = useState<CartColors>(COLOR_DEFAULTS);
  useEffect(() => {
    fetch('/api/settings').then(r => r.ok ? r.json() : {}).then((d: any) => {
      if (d.cartLayout) try { setLayout(prev => ({ ...prev, ...JSON.parse(d.cartLayout) })); } catch {}
      if (d.cartColors) try { setColors(prev => ({ ...prev, ...JSON.parse(d.cartColors) })); } catch {}
    }).catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/storefront/delivery-fees')
      .then(r => r.json())
      .then(d => setDeliveryFees(d || {}))
      .catch(() => {});
  }, []);

  const DEFAULT_DELIVERY = 6000;
  const deliveryFee = province ? (deliveryFees[province] ?? DEFAULT_DELIVERY) : 0;
  const grandTotal = total + deliveryFee;

  const handleValidate = () => {
    setFormError('');
    const p1 = phone1.replace(/\D/g, '');
    if (!p1) { setFormError('رقم الهاتف الأساسي مطلوب'); return; }
    if (p1.length !== 11) { setFormError(`رقم الهاتف الأساسي يجب أن يكون 11 رقماً (أدخلت ${p1.length})`); return; }
    const p2 = phone2.replace(/\D/g, '');
    if (p2 && p2.length !== 11) { setFormError(`رقم الهاتف الاحتياطي يجب أن يكون 11 رقماً إذا أدخلته (أدخلت ${p2.length})`); return; }
    if (!province) { setFormError('يرجى اختيار المحافظة'); return; }
    if (!address.trim()) { setFormError('يرجى كتابة العنوان الكامل'); return; }
    if (!ageNote.trim()) { setFormError('يرجى كتابة ملاحظة العمر'); return; }
    setScreen('preview');
  };

  const handleSendWhatsApp = async () => {
    if (sendLockRef.current || hasSent) return;
    sendLockRef.current = true;
    setIsSending(true);
    let orderId: number | null = null;
    let receiptImageUrl: string | null = null;

    // Step 1: Save order first → get orderId (skip if already saved)
    if (pendingOrderId !== null && pendingOrderId !== undefined) {
      orderId = pendingOrderId;
    }

    // Helper to call the order API (used for retry)
    const createOrder = async (): Promise<number | null> => {
      const resp = await fetch('/api/storefront/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderName: user.name || phone1,
          phone1, phone2, province, address, ageNote,
          items: items.map(i => ({
            productId: i.product.productId,
            nameAr: i.product.nameAr || i.product.productId,
            nameEn: i.product.nameEn || i.product.productId,
            price: getEffectivePrice(i.product),
            qty: i.qty,
            image: i.product.publicImageUrl || i.product.imageUrl || null,
          })),
          total, deliveryFee, grandTotal,
        }),
      });
      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        console.error('[ORDER] API error', resp.status, errText);
        return null;
      }
      const data = await resp.json();
      return typeof data.orderId === 'number' ? data.orderId : null;
    };

    if (orderId === null) {
      try { orderId = await createOrder(); } catch (e) { console.error('[ORDER] attempt 1 failed', e); }
    }
    // Retry once if first attempt failed
    if (orderId === null) {
      await new Promise(r => setTimeout(r, 1200));
      try { orderId = await createOrder(); } catch (e) { console.error('[ORDER] attempt 2 failed', e); }
    }

    // If still no orderId after retry → show error, unlock and abort
    if (orderId === null) {
      sendLockRef.current = false;
      setIsSending(false);
      setFormError('تعذّر حفظ الطلب. تحقق من الاتصال وحاول مجدداً.');
      setScreen('checkout');
      return;
    }

    // Step 2: Show order code on invoice, then capture screenshot
    if (orderId !== null) setPendingOrderId(orderId);
    // Wait for React to re-render the invoice with the order code
    await new Promise(r => setTimeout(r, 120));

    if (invoiceRef.current) {
      try {
        const canvas = await html2canvas(invoiceRef.current, {
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#ffffff',
          scale: 2,
          logging: false,
        });
        const receiptImage = canvas.toDataURL('image/png');
        // Step 3: Upload receipt image and attach to booking
        if (orderId && receiptImage) {
          const imgResp = await fetch(`/api/storefront/order/${orderId}/receipt-image`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ receiptImage }),
          });
          const imgData = await imgResp.json();
          receiptImageUrl = imgData.receiptImageUrl ?? null;
        }
      } catch { /* capture failed, continue */ }
    }

    const ORDER_OFFSET = 873;
    const displayId = orderId !== null ? orderId + ORDER_OFFSET : null;
    const orderTag = displayId !== null ? `#${displayId}` : '#—';

    const productLines = items.map(item => {
      const name = item.product.nameAr || item.product.nameEn || item.product.productId;
      const effPrice = getEffectivePrice(item.product);
      const lineTotal = formatPrice(effPrice * item.qty);
      return [
        `• *${name}* (${item.product.productId})`,
        `  ${formatPrice(effPrice)} × ${item.qty} = *${lineTotal}*`,
      ].join('\n');
    }).join('\n');

    const customerName = user.name || phone1;
    const lines = [
      '👍👍👍👍👍👍👍👍👍👍👍👍',
      `✨ *Sonbola.baby* ✨`,
      `🛍️ *طلب ${orderTag}*`,
      '━━━━━━━━━━━━━',
      `👤 *${customerName}*`,
      `📞 ${phone1}${phone2.trim() ? ' | ' + phone2 : ''}`,
      `📍 ${province} — ${address}`,
      '━━━━━━━━━━━━━',
      '📦 *المنتجات:*',
      productLines,
      '━━━━━━━━━━━━━',
      `🚚 التوصيل (${province}): ${formatPrice(deliveryFee)} — ${getDeliveryDays(deliveryFee)}`,
      `💵 *الإجمالي: ${formatPrice(grandTotal)}*`,
      ...(ageNote.trim() ? ['━━━━━━━━━━━━━', `⚠️ *ملاحظة العمر (مهمة جداً):*`, ageNote] : []),
    ].join('\n');

    const encoded = encodeURIComponent(lines);
    // Persist sent state BEFORE opening WA so page reload/remount can't reset it
    sessionStorage.setItem(sentKey, '1');
    setHasSent(true);
    setIsSending(false);
    // Use window.open on ALL devices — avoids page-reload side effects from location.href
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const waUrl = isMobile
      ? `whatsapp://send?phone=9647503981573&text=${encoded}`
      : `https://wa.me/9647503981573?text=${encoded}`;
    window.open(waUrl, '_blank');
  };

  const inputCls = 'w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-green-400 transition-colors';

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed top-0 left-0 h-full z-50 shadow-2xl flex flex-col" dir="rtl" style={{ width: 340, fontFamily: 'sans-serif', background: colors.drawerBg }}>

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          {screen === 'preview' ? (
            <button onClick={() => setScreen('checkout')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
              ← تعديل الطلب
            </button>
          ) : screen === 'checkout' ? (
            <button onClick={() => { setScreen('cart'); setFormError(''); }} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
              ← العودة للسلة
            </button>
          ) : (
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-red-500" />
              سلة الطلبات
              {items.length > 0 && <span className="text-sm font-normal text-gray-400">({items.length})</span>}
            </h2>
          )}
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── CART VIEW ── */}
        {screen === 'cart' && (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-3">
                  <ShoppingCart className="w-12 h-12 text-red-400 opacity-30" />
                  <p className="text-sm">السلة فارغة</p>
                  <button onClick={onClose} className="text-sm text-blue-600 underline">تصفح المنتجات</button>
                </div>
              ) : items.map(item => (
                <div key={item.product.productId} className="flex gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50">
                  <div className="w-16 h-16 rounded-xl overflow-hidden bg-gray-200 flex-shrink-0">
                    {item.product.publicImageUrl || item.product.imageUrl ? (
                      <img src={item.product.publicImageUrl || item.product.imageUrl!} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400"><Package className="w-6 h-6" /></div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-800 truncate">{item.product.nameAr || item.product.nameEn}</p>
                    <p className="text-sm font-semibold text-gray-700 mt-0.5">{formatPrice(getEffectivePrice(item.product))}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <button onClick={() => item.qty > 1 ? onQtyChange(item.product.productId, item.qty - 1) : onRemove(item.product.productId)} className="w-7 h-7 rounded-full bg-red-100 hover:bg-red-200 text-red-500 flex items-center justify-center transition-colors">
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-sm font-bold w-5 text-center text-gray-700">{item.qty}</span>
                      <button onClick={() => onQtyChange(item.product.productId, item.qty + 1)} className="w-7 h-7 rounded-full bg-blue-100 hover:bg-blue-200 text-blue-600 flex items-center justify-center transition-colors">
                        <Plus className="w-3 h-3" />
                      </button>
                      <button onClick={() => onRemove(item.product.productId)} className="mr-auto p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {items.length > 0 && (
              <div className="p-4 border-t border-gray-100 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">المجموع:</span>
                  <span className="font-bold text-gray-900 text-base">{formatPrice(total)}</span>
                </div>
                <button
                  onClick={() => setScreen('checkout')}
                  className="w-full h-12 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 transition-all"
                  style={{ background: 'linear-gradient(135deg,#25d366,#128c7e)', boxShadow: '0 4px 16px rgba(37,211,102,0.35)' }}
                >
                  <WhatsAppIcon size={20} color="#fff" />
                  تكملة الحجز
                </button>
              </div>
            )}
          </>
        )}

        {/* ── CHECKOUT FORM VIEW ── */}
        {screen === 'checkout' && (
          <div className="flex-1 overflow-y-auto p-4 flex flex-col" style={{ gap: layout.gap, background: colors.formBg }}>

            {/* Order summary mini */}
            <div className="rounded-xl border border-gray-100 space-y-2" style={{ padding: layout.cardPad, background: colors.summaryBg }}>
              {items.map(item => {
                const img = item.product.publicImageUrl || item.product.imageUrl;
                return (
                  <div key={item.product.productId} className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-200 flex-shrink-0">
                      {img ? <img src={img} alt="" className="w-full h-full object-cover" /> : <Package className="w-4 h-4 text-gray-400 m-auto" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-gray-800 truncate">{item.product.nameAr || item.product.nameEn}</p>
                    </div>
                    <span className="text-xs font-semibold text-gray-700 shrink-0">{formatPrice(getEffectivePrice(item.product))} × {item.qty}</span>
                  </div>
                );
              })}
            </div>

            {/* Phone 1 */}
            <div className="space-y-1.5">
              <label className="font-semibold" style={{ fontSize: layout.labelSize, color: colors.labelColor }}>رقم الهاتف الأساسي *</label>
              <input
                value={phone1}
                onChange={e => setPhone1(e.target.value.replace(/\D/g, '').slice(0, 11))}
                className={inputCls}
                style={{ paddingTop: layout.inputPy, paddingBottom: layout.inputPy, borderColor: phone1.length > 0 && phone1.length !== 11 ? '#f87171' : colors.fieldBorder }}
                dir="ltr"
                placeholder="07XXXXXXXXX"
                inputMode="numeric"
                maxLength={11}
              />
              <p className="text-xs text-left" style={{ color: phone1.length === 11 ? '#22c55e' : phone1.length > 0 ? '#f87171' : '#9ca3af' }}>
                {phone1.length}/11 {phone1.length === 11 ? '✓' : ''}
              </p>
            </div>

            {/* Phone 2 */}
            <div className="space-y-1.5">
              <label className="font-semibold" style={{ fontSize: layout.labelSize, color: colors.labelColor }}>رقم هاتف احتياطي <span className="font-normal opacity-60">(اختياري)</span></label>
              <input
                value={phone2}
                onChange={e => setPhone2(e.target.value.replace(/\D/g, '').slice(0, 11))}
                className={inputCls}
                style={{ paddingTop: layout.inputPy, paddingBottom: layout.inputPy, borderColor: phone2.length > 0 && phone2.length !== 11 ? '#f87171' : colors.fieldBorder }}
                dir="ltr"
                placeholder="07XXXXXXXXX"
                inputMode="numeric"
                maxLength={11}
              />
              {phone2.length > 0 && (
                <p className="text-xs text-left" style={{ color: phone2.length === 11 ? '#22c55e' : '#f87171' }}>
                  {phone2.length}/11 {phone2.length === 11 ? '✓' : ''}
                </p>
              )}
            </div>

            {/* Province */}
            <div className="space-y-1.5">
              <label className="font-semibold" style={{ fontSize: layout.labelSize, color: colors.labelColor }}>المحافظة *</label>
              <select value={province} onChange={e => setProvince(e.target.value)} className={inputCls} style={{ paddingTop: layout.inputPy, paddingBottom: layout.inputPy, borderColor: colors.fieldBorder }}>
                <option value="">— اختر المحافظة —</option>
                {IRAQI_PROVINCES.map(p => {
                  const f = deliveryFees[p] ?? 6000;
                  return <option key={p} value={p}>{p} — {formatPrice(f)} ({getDeliveryDays(f)})</option>;
                })}
              </select>
              {province && (
                <p className="text-xs text-green-700 font-semibold">
                  🚚 التوصيل: {formatPrice(deliveryFees[province] ?? 6000)} — {getDeliveryDays(deliveryFees[province] ?? 6000)}
                </p>
              )}
            </div>

            {/* Full address */}
            <div className="space-y-1.5">
              <label className="font-semibold" style={{ fontSize: layout.labelSize, color: colors.labelColor }}>العنوان الكامل مع أقرب نقطة *</label>
              <textarea value={address} onChange={e => setAddress(e.target.value)} className={inputCls} rows={3} placeholder="مثال: شارع الرشيد، بالقرب من السوق المركزي" />
            </div>

            {/* Age note */}
            <div className="space-y-2">
              <div className="rounded-xl bg-amber-50 border border-amber-300 px-3 py-2.5 flex items-start gap-2">
                <span className="text-lg leading-none mt-0.5">⚠️</span>
                <div>
                  <p className="font-bold text-amber-800" style={{ fontSize: layout.labelSize }}>ملاحظة العمر مهم جداً</p>
                  <p className="text-amber-700 mt-0.5" style={{ fontSize: layout.labelSize - 1 }}>اكتب العمر بالتفصيل مثل الأمثلة التي تحت</p>
                </div>
              </div>
              <textarea value={ageNote} onChange={e => setAgeNote(e.target.value)} className={inputCls} rows={5}
                placeholder={"مثال: 2 إلى 3 سنة\nمثال: 3 سنة بس ناعمة\nمثال: 4 سنة و 5 اشهر\nمثال: دزلي عمر 4 بالظبط"} />
            </div>

            {/* Totals */}
            <div className="rounded-xl border border-gray-100 space-y-1.5 text-sm" style={{ padding: layout.cardPad, background: colors.summaryBg }}>
              <div className="flex justify-between text-gray-600">
                <span>المجموع:</span><span className="font-semibold">{formatPrice(total)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>التوصيل ({province || '—'}):</span>
                <span className="font-semibold">{province ? `${formatPrice(deliveryFee)}` : '—'}</span>
              </div>
              {province && (
                <div className="flex justify-between font-bold text-gray-900 pt-1 border-t border-gray-100">
                  <span>الإجمالي:</span><span className="text-green-700">{formatPrice(grandTotal)}</span>
                </div>
              )}
            </div>

            {formError && <p className="text-xs text-red-500 text-center">⚠️ {formError}</p>}

            {/* Submit */}
            <button
              onClick={handleValidate}
              className="w-full rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 mb-4"
              style={{ height: layout.btnH, background: colors.checkoutBtn, boxShadow: '0 4px 16px rgba(26,115,232,0.25)' }}
            >
              معاينة الطلب ←
            </button>
          </div>
        )}

        {/* ── PREVIEW INVOICE VIEW ── */}
        {screen === 'preview' && (
          <div className="flex-1 overflow-y-auto" style={{ background: colors.formBg }}>
            {/* Invoice card */}
            <div ref={invoiceRef} className="m-3 bg-white rounded-xl shadow-sm overflow-hidden text-gray-800" style={{ fontSize: 12 }}>

              {/* Invoice header */}
              <div className="p-3 border-b border-gray-200 flex justify-between items-start gap-2">

                {/* ── جهة المتجر (يسار الشاشة في RTL) ── */}
                <div className="space-y-1 text-xs text-gray-700">
                  <div><span className="text-gray-400">المستخدم: </span><span className="font-bold">{user.name}</span></div>
                  <div><span className="text-gray-400">أرقام: </span><span className="font-bold" dir="ltr">{phone1}{phone2.trim() ? ` | ${phone2}` : ''}</span></div>
                  <div className="max-w-[160px]"><span className="text-gray-400">العنوان: </span><span className="font-bold leading-tight">{province} — {address}</span></div>
                </div>

                {/* ── جهة الزبون (يمين الشاشة في RTL) ── */}
                <div className="text-right shrink-0">
                  <p className="font-black text-lg text-gray-900 leading-none">Sonbola.baby</p>
                  <p className="text-xs text-gray-900 font-black mt-0.5 text-right">20947</p>
                  {pendingOrderId && (
                    <span className="inline-block mt-1.5 bg-gray-900 text-white text-[10px] font-bold px-2 py-0.5 rounded-full tracking-wide">
                      طلب #{pendingOrderId + 951}
                    </span>
                  )}
                </div>

              </div>

              {/* Products table */}
              <table className="w-full text-center border-collapse" style={{ fontSize: 11 }}>
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="py-2 px-1 font-semibold text-gray-600 border-l border-gray-200">السعر</th>
                    <th className="py-2 px-1 font-semibold text-gray-600 border-l border-gray-200">العدد</th>
                    <th className="py-2 px-2 font-semibold text-gray-600 border-l border-gray-200">الصورة</th>
                    <th className="py-2 px-1 font-semibold text-gray-600">المبلغ</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => {
                    const img = item.product.publicImageUrl || item.product.imageUrl;
                    const effP = getEffectivePrice(item.product);
                    const lineTotal = effP * item.qty;
                    return (
                      <tr key={item.product.productId} className="border-b border-gray-100">
                        <td className="py-2 px-1 border-l border-gray-100 font-semibold">
                          {formatPrice(effP)}
                        </td>
                        <td className="py-2 px-1 border-l border-gray-100 font-bold text-base">
                          {item.qty}
                        </td>
                        <td className="py-2 px-2 border-l border-gray-100">
                          <div className="relative inline-block">
                            {img ? (
                              <img src={img} alt="" className="w-16 h-16 object-cover rounded" />
                            ) : (
                              <div className="w-16 h-16 bg-gray-100 rounded flex items-center justify-center text-gray-400"><Package className="w-5 h-5" /></div>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-1 font-bold">
                          {formatPrice(lineTotal)}
                        </td>
                      </tr>
                    );
                  })}
                  {/* Delivery row */}
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <td className="py-2 px-1 border-l border-gray-100 font-bold text-blue-700">
                      {formatPrice(deliveryFee)}
                    </td>
                    <td className="py-2 px-1 border-l border-gray-100 text-gray-400 text-xs">—</td>
                    <td className="py-2 px-2 border-l border-gray-100 text-right text-gray-500 text-xs font-semibold">
                      محافظة <span className="text-gray-700">{province}</span>
                    </td>
                    <td className="py-2 px-1 font-bold text-blue-700">{formatPrice(deliveryFee)}</td>
                  </tr>
                </tbody>
              </table>

              {/* Total row */}
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t border-gray-200">
                <span className="font-bold text-gray-700 text-sm">المجموع</span>
                <span className="font-black text-base text-gray-900">{formatPrice(grandTotal)}</span>
              </div>

              {ageNote.trim() && (
                <div className="border border-red-400 bg-red-50 px-4 py-3 text-center">
                  <p className="font-black text-red-600 mb-1" style={{ fontSize: '13px', letterSpacing: '0.01em' }}>
                    <span className="text-red-600 mr-1" style={{ fontSize: '15px' }}>⚠️</span>
                    ملاحظة العمر (مهمة جداً):
                  </p>
                  <p className="font-bold text-red-900" style={{ fontSize: '13px' }}>{ageNote}</p>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="px-4 pb-5 pt-1 space-y-3">

              {/* WhatsApp — primary CTA with dynamic animation type */}
              {(() => {
                const btnInner = (
                  <button
                    onClick={handleSendWhatsApp}
                    disabled={isSending || hasSent}
                    className={`w-full rounded-2xl text-white font-extrabold text-base flex items-center gap-4 px-5 disabled:opacity-70 active:scale-95 transition-all${btnAnimType === 'glass-shimmer' ? ' btn-glass-shimmer' : ''}${btnAnimType === 'pulse' ? ' btn-pulse' : ''}`}
                    style={{
                      height: layout.btnH,
                      background: hasSent ? 'linear-gradient(135deg,#059669,#047857)' : 'linear-gradient(135deg,#128c7e,#25d366)',
                      boxShadow: hasSent ? '0 6px 20px rgba(5,150,105,0.45)' : '0 6px 22px rgba(37,211,102,0.50)',
                    }}
                  >
                    <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/20 shrink-0">
                      {isSending ? <Loader2 size={20} className="animate-spin" /> : hasSent ? <span style={{fontSize:20}}>✅</span> : <WhatsAppIcon size={22} color="#fff" />}
                    </span>
                    <span className="flex flex-col items-start leading-tight">
                      <span className="text-[10px] font-medium text-white/75 uppercase tracking-widest">
                        {isSending ? 'جارٍ الحفظ...' : hasSent ? 'تم بنجاح' : 'إرسال الطلب عبر'}
                      </span>
                      <span className="text-lg font-black tracking-wide">WhatsApp</span>
                    </span>
                  </button>
                );
                if (btnAnimType === 'neon-trace') {
                  return (
                    <NeonSnakeBorder color="#ffd700" borderRadius={16} strokeWidth={3} snakeFraction={0.25} duration={2.5} className="w-full">
                      {btnInner}
                    </NeonSnakeBorder>
                  );
                }
                return btnInner;
              })()}

              {/* Facebook + Instagram — display only, no action */}
              <div className="flex gap-3">
                <div
                  className="flex-1 h-[72px] rounded-2xl text-white flex flex-col items-center justify-center gap-1.5 select-none"
                  style={{
                    background: 'linear-gradient(145deg,#1877f2,#0a56d0)',
                    boxShadow: '0 5px 18px rgba(24,119,242,0.45)',
                    opacity: 0.85,
                  }}
                >
                  <FacebookIcon size={22} color="#fff" />
                  <span className="flex flex-col items-center leading-none gap-0.5">
                    <span className="text-[13px] font-black tracking-wide">Facebook</span>
                    <span className="text-[9px] text-white/75 font-medium">التقط صورة وأرسلها</span>
                  </span>
                </div>

                <div
                  className="flex-1 h-[72px] rounded-2xl text-white flex flex-col items-center justify-center gap-1.5 select-none"
                  style={{
                    background: 'linear-gradient(145deg,#f77737,#c13584,#833ab4)',
                    boxShadow: '0 5px 18px rgba(193,53,132,0.45)',
                    opacity: 0.85,
                  }}
                >
                  <InstagramIcon size={22} color="#fff" />
                  <span className="flex flex-col items-center leading-none gap-0.5">
                    <span className="text-[13px] font-black tracking-wide">Instagram</span>
                    <span className="text-[9px] text-white/75 font-medium">التقط صورة وأرسلها</span>
                  </span>
                </div>
              </div>

              {hasSent ? (
                <button
                  onClick={() => {
                    sessionStorage.removeItem(sentKey);
                    setHasSent(false);
                    sendLockRef.current = false;
                    setPhone1(user?.phone || '');
                    setPhone2('');
                    setProvince('');
                    setAddress('');
                    setAgeNote('');
                    setFormError('');
                    setPendingOrderId(null);
                    onClearCart();
                    setScreen('cart');
                  }}
                  className="w-full h-12 rounded-2xl font-bold text-sm transition-all active:scale-95"
                  style={{ background: 'linear-gradient(135deg,#6c3fc5,#9b59d0)', color: '#fff', boxShadow: '0 4px 14px rgba(108,63,197,0.4)' }}
                >
                  🛍️ طلب جديد
                </button>
              ) : (
                <button
                  onClick={() => setScreen('checkout')}
                  className="w-full h-10 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-500 font-semibold text-sm transition-colors"
                >
                  ← تعديل البيانات
                </button>
              )}
            </div>
          </div>
        )}
      </div>

    </>
  );
}

// ─── Product Card ─────────────────────────────────────────────────────────────

interface ProductCardProps {
  product: Product;
  onAddToCart: () => void;
  onChat: () => void;
  cartAnim?: BtnAnim;
  chatAnim?: BtnAnim;
  cartColor?: string;
  chatColor?: string;
  instagramMode?: boolean;
  explorerMode?: boolean;
}

function getFavoriteKey(productId: string) { return `fav_${productId}`; }


function ProductCard({ product, onAddToCart, onChat, cartAnim = 'static', chatAnim = 'static', cartColor = '#22c55e', chatColor = '#1877f2', instagramMode = false, explorerMode = false }: ProductCardProps) {
  const [imgError, setImgError] = useState(false);
  const [isFav, setIsFav] = useState(() => {
    try { return localStorage.getItem(getFavoriteKey(product.productId)) === '1'; } catch { return false; }
  });
  const [detailOpen, setDetailOpen] = useState(false);

  const imgSrc = product.publicImageUrl || product.imageUrl;
  const onSale = product.isOnSale && product.discountPrice != null && product.discountPrice > 0;
  const displayPrice = onSale ? product.discountPrice! : product.price;
  const originalPrice = product.price;
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');

  const toggleFav = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !isFav;
    setIsFav(next);
    try { next ? localStorage.setItem(getFavoriteKey(product.productId), '1') : localStorage.removeItem(getFavoriteKey(product.productId)); } catch {}
    fetch(`${base}/api/storefront/favorite/${encodeURIComponent(product.productId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: next ? 'add' : 'remove' }),
    }).catch(() => {});
  };

  if (explorerMode) {
    return (
      <>
        {/* ── Explorer Mode: masonry tile (natural aspect ratio) ── */}
        <div
          className="relative overflow-hidden cursor-pointer group w-full"
          style={{ background: '#111', breakInside: 'avoid', marginBottom: 2, display: 'block' }}
          onClick={() => setDetailOpen(true)}
        >
          {imgSrc && !imgError ? (
            <img
              src={imgSrc}
              alt={product.productId}
              className="w-full block object-cover transition-transform duration-300 group-hover:scale-105"
              style={{ display: 'block', minHeight: 80 }}
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="w-full flex items-center justify-center" style={{ height: 140, background: '#222' }}>
              <Package className="w-10 h-10 text-gray-500" />
            </div>
          )}
          {onSale && (
            <div className="absolute top-1.5 left-1.5">
              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-rose-500 text-white shadow-sm">خصم</span>
            </div>
          )}
          {/* code overlay */}
          <div className="absolute bottom-0 left-0 right-0 px-1.5 py-1" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 100%)' }}>
            <span className="text-[9px] text-white/80 font-mono">{product.productId}</span>
          </div>
        </div>

        {/* Detail modal */}
        {detailOpen && createPortal(
          <div
            className="fixed inset-0 z-[1000] flex items-center justify-center px-4"
            style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
            onClick={() => setDetailOpen(false)}
          >
            <div
              className="w-full max-w-xs bg-white rounded-3xl overflow-y-auto"
              style={{ maxHeight: '85vh', animation: 'slideUp 0.28s ease' }}
              onClick={e => e.stopPropagation()}
            >
              {imgSrc && !imgError ? (
                <div className="mx-3 mt-2 rounded-xl overflow-hidden bg-gray-100" style={{ aspectRatio: '1/1' }}>
                  <img src={imgSrc} alt="" className="w-full h-full object-contain" onError={() => setImgError(true)} />
                </div>
              ) : (
                <div className="mx-3 mt-2 rounded-xl bg-gray-100 flex items-center justify-center" style={{ height: 200 }}>
                  <Package className="w-12 h-12 text-gray-300" />
                </div>
              )}
              <div className="px-4 pt-3 pb-4 space-y-2" dir="rtl">
                {(() => {
                  const nameAr = product.nameAr !== product.productId ? product.nameAr : '';
                  const nameEn = product.nameEn !== product.productId ? product.nameEn : '';
                  if (!nameAr && !nameEn) return null;
                  return (<div><h2 className="text-base font-bold text-gray-800 leading-snug">{nameAr || nameEn}</h2></div>);
                })()}
                <div className="flex flex-wrap gap-1">
                  <span className="px-2.5 py-1 rounded-full text-sm font-semibold bg-amber-50 text-amber-700 border border-amber-100">{SEASON_AR[product.category] ?? product.category}</span>
                  <span className="px-2.5 py-1 rounded-full text-sm font-semibold bg-pink-50 text-pink-700 border border-pink-100">{GENDER_AR[product.gender] ?? product.gender}</span>
                  <AgeRangeBadges product={product} badgeClass="px-2.5 py-1 rounded-full text-sm font-semibold bg-blue-50 text-blue-700 border border-blue-100" />
                </div>
                <div className="text-center pt-1">
                  {onSale ? (
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-xl font-extrabold text-gray-800">{formatPrice(product.discountPrice!)}</span>
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-500 text-white">خصم</span>
                      <span className="text-sm text-gray-400 line-through">{formatPrice(product.price)}</span>
                    </div>
                  ) : (
                    <span className="text-2xl font-extrabold text-gray-800">{formatPrice(product.price)}</span>
                  )}
                </div>
                {product.descriptionAr && (
                  <div className="bg-gray-50 rounded-xl px-3 py-2">
                    <p className="text-xs text-gray-600 leading-relaxed">{product.descriptionAr}</p>
                  </div>
                )}
                <div className="flex gap-1.5 pt-1">
                  {(() => {
                    const btn = (
                      <button
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all active:scale-95${cartAnim === 'glass-shimmer' ? ' btn-glass-shimmer' : cartAnim === 'pulse' ? ' btn-pulse' : ''}`}
                        style={{ background: cartColor, color: '#fff' }}
                        onClick={() => { onAddToCart(); setDetailOpen(false); }}
                      ><ShoppingCart className="w-3.5 h-3.5 flex-shrink-0" /><span className="flex flex-col items-center leading-tight"><span>سلة</span><span>حجز</span></span></button>
                    );
                    return cartAnim === 'neon-trace'
                      ? <NeonSnakeBorder color="#4ade80" borderRadius={11} strokeWidth={2} snakeFraction={0.3} duration={2.5} className="flex-1">{btn}</NeonSnakeBorder>
                      : btn;
                  })()}
                  {(() => {
                    const btn = (
                      <button
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all active:scale-95${chatAnim === 'glass-shimmer' ? ' btn-glass-shimmer' : chatAnim === 'pulse' ? ' btn-pulse' : ''}`}
                        style={{ background: chatColor, color: '#fff' }}
                        onClick={() => { onChat(); setDetailOpen(false); }}
                      ><MessageCircle className="w-3.5 h-3.5 flex-shrink-0" />دردشة</button>
                    );
                    return chatAnim === 'neon-trace'
                      ? <NeonSnakeBorder color="#60a5fa" borderRadius={11} strokeWidth={2} snakeFraction={0.3} duration={2.5} className="flex-1">{btn}</NeonSnakeBorder>
                      : btn;
                  })()}
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
      </>
    );
  }

  if (instagramMode) {
    return (
      <>
        {/* ── Instagram Mode: image only tile ── */}
        <div
          className="relative overflow-hidden cursor-pointer group"
          style={{ aspectRatio: '1/1', background: '#f3f3f3' }}
          onClick={() => setDetailOpen(true)}
        >
          {imgSrc && !imgError ? (
            <img
              src={imgSrc}
              alt={product.productId}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Package className="w-10 h-10 text-gray-300" />
            </div>
          )}

          {/* Sale badge */}
          {onSale && (
            <div className="absolute top-1.5 left-1.5">
              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-rose-500 text-white shadow-sm">خصم</span>
            </div>
          )}

        </div>

        {/* Detail modal (shared with normal mode) */}
        {detailOpen && createPortal(
          <div
            className="fixed inset-0 z-[1000] flex items-center justify-center px-4"
            style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)' }}
            onClick={() => setDetailOpen(false)}
          >
            <div
              className="w-full max-w-xs bg-white rounded-3xl overflow-y-auto"
              style={{ maxHeight: '80vh', animation: 'slideUp 0.28s ease' }}
              onClick={e => e.stopPropagation()}
            >
              {imgSrc && !imgError ? (
                <div className="mx-3 mt-2 rounded-xl overflow-hidden bg-gray-100" style={{ aspectRatio: '1/1' }}>
                  <img src={imgSrc} alt="" className="w-full h-full object-contain" onError={() => setImgError(true)} />
                </div>
              ) : (
                <div className="mx-3 mt-2 rounded-xl bg-gray-100 flex items-center justify-center" style={{ height: 200 }}>
                  <Package className="w-12 h-12 text-gray-300" />
                </div>
              )}
              <div className="px-4 pt-3 pb-4 space-y-2" dir="rtl">
                {(() => {
                  const nameAr = product.nameAr !== product.productId ? product.nameAr : '';
                  const nameEn = product.nameEn !== product.productId ? product.nameEn : '';
                  if (!nameAr && !nameEn) return null;
                  return (
                    <div>
                      <h2 className="text-base font-bold text-gray-800 leading-snug">{nameAr || nameEn}</h2>
                      {nameEn && nameAr && nameEn !== nameAr && <p className="text-xs text-gray-500">{nameEn}</p>}
                    </div>
                  );
                })()}
                <div className="flex flex-wrap gap-2 justify-center">
                  <span className="px-3 py-1 rounded-full text-sm font-semibold bg-amber-50 text-amber-700 border border-amber-100">{SEASON_AR[product.category] ?? product.category}</span>
                  <span className="px-3 py-1 rounded-full text-sm font-semibold bg-pink-50 text-pink-700 border border-pink-100">{GENDER_AR[product.gender] ?? product.gender}</span>
                  <AgeRangeBadges product={product} badgeClass="px-3 py-1 rounded-full text-sm font-semibold bg-blue-50 text-blue-700 border border-blue-100" />
                </div>
                <div className="flex items-center justify-center gap-2">
                  <span className="text-2xl font-extrabold text-gray-900">{formatPrice(displayPrice)}</span>
                  {onSale && product.price > 0 && <span className="text-sm text-gray-400 line-through">{formatPrice(product.price)}</span>}
                  {onSale && <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-500 text-white">خصم</span>}
                </div>
                {product.colors && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-500">🎨 الألوان:</span>
                    <span className="text-xs font-medium text-gray-700">{product.colors}</span>
                  </div>
                )}
                {product.descriptionAr && (
                  <div className="bg-gray-50 rounded-xl px-3 py-2">
                    <p className="text-xs text-gray-600 leading-relaxed">{product.descriptionAr}</p>
                  </div>
                )}
                <div className="flex gap-1.5 pt-1">
                  {(() => {
                    const btn = (
                      <button
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all active:scale-95${cartAnim === 'glass-shimmer' ? ' btn-glass-shimmer' : cartAnim === 'pulse' ? ' btn-pulse' : ''}`}
                        style={{ background: cartColor, color: '#fff' }}
                        onClick={() => { onAddToCart(); setDetailOpen(false); }}
                      ><ShoppingCart className="w-3.5 h-3.5 flex-shrink-0" /><span className="flex flex-col items-center leading-tight"><span>سلة</span><span>حجز</span></span></button>
                    );
                    return cartAnim === 'neon-trace'
                      ? <NeonSnakeBorder color="#4ade80" borderRadius={11} strokeWidth={2} snakeFraction={0.3} duration={2.5} className="flex-1">{btn}</NeonSnakeBorder>
                      : btn;
                  })()}
                  {(() => {
                    const btn = (
                      <button
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all active:scale-95${chatAnim === 'glass-shimmer' ? ' btn-glass-shimmer' : chatAnim === 'pulse' ? ' btn-pulse' : ''}`}
                        style={{ background: chatColor, color: '#fff' }}
                        onClick={() => { onChat(); setDetailOpen(false); }}
                      ><MessageCircle className="w-3.5 h-3.5 flex-shrink-0" />دردشة</button>
                    );
                    return chatAnim === 'neon-trace'
                      ? <NeonSnakeBorder color="#60a5fa" borderRadius={11} strokeWidth={2} snakeFraction={0.3} duration={2.5} className="flex-1">{btn}</NeonSnakeBorder>
                      : btn;
                  })()}
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
      </>
    );
  }

  return (
    <div
      className="sf-card bg-white rounded-2xl overflow-hidden border border-gray-100 group flex flex-col"
      style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)', transition: 'box-shadow 0.2s, transform 0.2s', minHeight: 320 }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; }}
    >
      {/* Image — click opens detail sheet */}
      <div
        className="aspect-square bg-gray-100 relative overflow-hidden flex-shrink-0 cursor-pointer"
        onClick={() => setDetailOpen(true)}
      >
        {imgSrc && !imgError ? (
          <img
            src={imgSrc}
            alt={product.productId}
            className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="w-12 h-12 text-gray-300" />
          </div>
        )}

        {/* Sale badge — top left */}
        {onSale && (
          <div className="absolute top-2 left-2">
            <span className="sf-badge-sale px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500 text-white shadow-sm">
              خصم
            </span>
          </div>
        )}

        {/* Product ID badge — hidden from customers */}

        {/* Heart / Favorite — bottom right */}
        <button
          onClick={toggleFav}
          className="absolute bottom-2 right-2 w-8 h-8 flex items-center justify-center rounded-full bg-white/80 backdrop-blur-sm shadow transition-transform active:scale-90"
          aria-label="مفضلة"
          title="أعجبني"
        >
          {isFav ? (
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-rose-500" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="w-4 h-4 stroke-rose-400 fill-none" strokeWidth={2} xmlns="http://www.w3.org/2000/svg">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
          )}
        </button>
      </div>

      {/* ── Product Detail Modal — centered ── */}
      {detailOpen && createPortal(
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)' }}
          onClick={() => setDetailOpen(false)}
        >
          <div
            className="w-full max-w-xs bg-white rounded-3xl overflow-y-auto"
            style={{ maxHeight: '75vh', animation: 'slideUp 0.28s ease' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Image */}
            {imgSrc && !imgError ? (
              <div className="mx-3 mt-2 rounded-xl overflow-hidden bg-gray-100" style={{ aspectRatio: '1/1' }}>
                <img src={imgSrc} alt="" className="w-full h-full object-contain" onError={() => setImgError(true)} />
              </div>
            ) : (
              <div className="mx-3 mt-2 rounded-xl bg-gray-100 flex items-center justify-center" style={{ height: 200 }}>
                <Package className="w-12 h-12 text-gray-300" />
              </div>
            )}

            {/* Content */}
            <div className="px-4 pt-2 pb-4 space-y-2" dir="rtl">

              {/* Name — hide if it's just the product code */}
              {(() => {
                const nameAr = product.nameAr !== product.productId ? product.nameAr : '';
                const nameEn = product.nameEn !== product.productId ? product.nameEn : '';
                if (!nameAr && !nameEn) return null;
                return (
                  <div>
                    <h2 className="text-base font-bold text-gray-800 leading-snug">
                      {nameAr || nameEn}
                    </h2>
                    {nameEn && nameAr && nameEn !== nameAr && (
                      <p className="text-xs text-gray-500">{nameEn}</p>
                    )}
                  </div>
                );
              })()}

              {/* Badges */}
              <div className="flex flex-wrap gap-2 justify-center">
                <span className="px-3 py-1 rounded-full text-sm font-semibold bg-amber-50 text-amber-700 border border-amber-100">
                  {SEASON_AR[product.category] ?? product.category}
                </span>
                <span className="px-3 py-1 rounded-full text-sm font-semibold bg-pink-50 text-pink-700 border border-pink-100">
                  {GENDER_AR[product.gender] ?? product.gender}
                </span>
                <AgeRangeBadges product={product} badgeClass="px-3 py-1 rounded-full text-sm font-semibold bg-blue-50 text-blue-700 border border-blue-100" />
              </div>

              {/* Price */}
              <div className="flex items-center justify-center gap-2">
                <span className="text-2xl font-extrabold text-gray-900">
                  {formatPrice(displayPrice)}
                </span>
                {onSale && product.price > 0 && (
                  <span className="text-sm text-gray-400 line-through">
                    {formatPrice(product.price)}
                  </span>
                )}
                {onSale && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-500 text-white">
                    خصم
                  </span>
                )}
              </div>

              {/* Colors */}
              {product.colors && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-500">🎨 الألوان:</span>
                  <span className="text-xs font-medium text-gray-700">{product.colors}</span>
                </div>
              )}

              {/* Description */}
              {product.descriptionAr && (
                <div className="bg-gray-50 rounded-xl px-3 py-2">
                  <p className="text-xs text-gray-600 leading-relaxed">{product.descriptionAr}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-1.5 pt-0.5">
                {(() => {
                  const btn = (
                    <button
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all active:scale-95${cartAnim === 'glass-shimmer' ? ' btn-glass-shimmer' : cartAnim === 'pulse' ? ' btn-pulse' : ''}`}
                      style={{ background: cartColor, color: '#fff' }}
                      onClick={() => { onAddToCart(); setDetailOpen(false); }}
                    ><ShoppingCart className="w-3.5 h-3.5 flex-shrink-0" /><span className="flex flex-col items-center leading-tight"><span>سلة</span><span>حجز</span></span></button>
                  );
                  return cartAnim === 'neon-trace'
                    ? <NeonSnakeBorder color="#4ade80" borderRadius={11} strokeWidth={2} snakeFraction={0.3} duration={2.5} className="flex-1">{btn}</NeonSnakeBorder>
                    : btn;
                })()}
                {(() => {
                  const btn = (
                    <button
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all active:scale-95${chatAnim === 'glass-shimmer' ? ' btn-glass-shimmer' : chatAnim === 'pulse' ? ' btn-pulse' : ''}`}
                      style={{ background: chatColor, color: '#fff' }}
                      onClick={() => { onChat(); setDetailOpen(false); }}
                    ><MessageCircle className="w-3.5 h-3.5 flex-shrink-0" />دردشة</button>
                  );
                  return chatAnim === 'neon-trace'
                    ? <NeonSnakeBorder color="#60a5fa" borderRadius={11} strokeWidth={2} snakeFraction={0.3} duration={2.5} className="flex-1">{btn}</NeonSnakeBorder>
                    : btn;
                })()}
              </div>

            </div>
          </div>
        </div>,
        document.body
      )}


      {/* Info */}
      <div className="p-3 space-y-2 flex flex-col flex-1">
        {/* Category + Gender badges */}
        <div className="flex flex-wrap gap-1">
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-100">
            {SEASON_AR[product.category] ?? product.category}
          </span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-pink-50 text-pink-700 border border-pink-100">
            {GENDER_AR[product.gender] ?? product.gender}
          </span>
        </div>

        {/* Price block */}
        <div className="flex flex-col leading-tight">
          <p className={`font-bold text-sm ${onSale ? 'text-rose-600' : 'text-gray-900'}`}>
            {formatPrice(displayPrice)}
          </p>
          {onSale && (
            <p className="text-[11px] text-gray-400 line-through leading-none">
              {formatPrice(originalPrice)}
            </p>
          )}
        </div>

        {product.colors && (
          <p className="text-[11px] text-gray-500 truncate">🎨 {product.colors}</p>
        )}

        {product.descriptionAr && (
          <p className="text-[11px] text-gray-500 line-clamp-1">{product.descriptionAr}</p>
        )}

        {/* Age label — above action buttons */}
        <AgeRangeLines product={product} className="text-xs text-gray-400" />

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-1.5 pt-0.5">
          {(() => {
            const cartBtn = (
              <button
                onClick={onAddToCart}
                className={`w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all active:scale-95${cartAnim === 'glass-shimmer' ? ' btn-glass-shimmer' : cartAnim === 'pulse' ? ' btn-pulse' : ''}`}
                style={{ background: cartColor, color: '#fff' }}
                onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(0.85)')}
                onMouseLeave={e => (e.currentTarget.style.filter = '')}
              >
                <ShoppingCart className="w-3.5 h-3.5 text-white flex-shrink-0" />
                <span className="flex flex-col items-center leading-tight">
                  <span>سلة</span>
                  <span>حجز</span>
                </span>
              </button>
            );
            return cartAnim === 'neon-trace'
              ? <NeonSnakeBorder color="#4ade80" borderRadius={11} strokeWidth={2} snakeFraction={0.3} duration={2.5} className="w-full">{cartBtn}</NeonSnakeBorder>
              : cartBtn;
          })()}
          {(() => {
            const chatBtn = (
              <button
                onClick={onChat}
                className={`w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all active:scale-95${chatAnim === 'glass-shimmer' ? ' btn-glass-shimmer' : chatAnim === 'pulse' ? ' btn-pulse' : ''}`}
                style={{ background: chatColor, color: '#fff' }}
                onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(0.85)')}
                onMouseLeave={e => (e.currentTarget.style.filter = '')}
              >
                <MessageCircle className="w-3.5 h-3.5" />
                دردشة
              </button>
            );
            return chatAnim === 'neon-trace'
              ? <NeonSnakeBorder color="#60a5fa" borderRadius={11} strokeWidth={2} snakeFraction={0.3} duration={2.5} className="w-full">{chatBtn}</NeonSnakeBorder>
              : chatBtn;
          })()}
        </div>
      </div>
    </div>
  );
}

// ─── Main Storefront Page ─────────────────────────────────────────────────────

// ─── Customer Account (registered users) ─────────────────────────────────────
interface CustomerAccount {
  id: number;
  name: string | null;
  email: string | null;
  whatsapp: string | null;
  avatarUrl: string | null;
  googleId: string | null;
}
const CUSTOMER_TOKEN_KEY = 'sonbola_customer_token';
const CUSTOMER_DATA_KEY = 'sonbola_customer_data';

function getStoredCustomer(): CustomerAccount | null {
  try {
    const raw = localStorage.getItem(CUSTOMER_DATA_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function storeCustomer(account: CustomerAccount, token: string) {
  localStorage.setItem(CUSTOMER_TOKEN_KEY, token);
  localStorage.setItem(CUSTOMER_DATA_KEY, JSON.stringify(account));
}
function clearCustomer() {
  localStorage.removeItem(CUSTOMER_TOKEN_KEY);
  localStorage.removeItem(CUSTOMER_DATA_KEY);
}

// ─── Customer Auth Modal ──────────────────────────────────────────────────────
function CustomerAuthModal({ onClose, onLogin }: {
  onClose: () => void;
  onLogin: (account: CustomerAccount, token: string) => void;
}) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const [tab, setTab] = useState<'choose' | 'email-login' | 'email-register' | 'whatsapp' | 'profile'>('choose');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [whatsapp, setWhatsapp] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const [gisLoaded, setGisLoaded] = useState(false);

  // Load Google Client ID
  useEffect(() => {
    fetch(`${base}/api/customer/google-client-id`)
      .then(r => r.json())
      .then(d => { if (d.clientId) setGoogleClientId(d.clientId); })
      .catch(() => {});
  }, []);

  // Load Google Identity Services script
  useEffect(() => {
    if (!googleClientId) return;
    if ((window as any).google?.accounts) { setGisLoaded(true); return; }
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => setGisLoaded(true);
    document.head.appendChild(s);
  }, [googleClientId]);

  const handleGoogleLogin = () => {
    if (!googleClientId || !gisLoaded) return;
    (window as any).google.accounts.id.initialize({
      client_id: googleClientId,
      callback: async (resp: any) => {
        setLoading(true); setError('');
        try {
          const r = await fetch(`${base}/api/customer/google`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential: resp.credential }),
          });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error || 'فشل تسجيل الدخول');
          onLogin(d.user, d.token);
        } catch (e: any) { setError(e.message); } finally { setLoading(false); }
      },
    });
    (window as any).google.accounts.id.prompt();
  };

  const handleEmailRegister = async () => {
    if (!email || !password) { setError('أدخل الإيميل وكلمة المرور'); return; }
    setLoading(true); setError('');
    try {
      const r = await fetch(`${base}/api/customer/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'فشل التسجيل');
      onLogin(d.user, d.token);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };

  const handleEmailLogin = async () => {
    if (!email || !password) { setError('أدخل الإيميل وكلمة المرور'); return; }
    setLoading(true); setError('');
    try {
      const r = await fetch(`${base}/api/customer/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'بيانات غير صحيحة');
      onLogin(d.user, d.token);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };

  const handleSendOtp = async () => {
    const clean = whatsapp.replace(/\D/g, '');
    if (clean.length < 9) { setError('أدخل رقم واتساب صحيح'); return; }
    setLoading(true); setError('');
    try {
      const r = await fetch(`${base}/api/customer/whatsapp/send-otp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ whatsapp: clean }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'فشل إرسال الرمز');
      setOtpSent(true);
      setSuccess('تم إرسال رمز التحقق على واتساب');
      if (d.otp) { setOtpCode(d.otp); setOtp(d.otp); }
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };

  const handleVerifyOtp = async () => {
    if (!otp || otp.length < 4) { setError('أدخل رمز التحقق'); return; }
    setLoading(true); setError('');
    try {
      const clean = whatsapp.replace(/\D/g, '');
      const r = await fetch(`${base}/api/customer/whatsapp/verify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ whatsapp: clean, otp, name }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'رمز غير صحيح');
      onLogin(d.user, d.token);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative w-full max-w-sm mx-4 rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: '#fff' }}
        dir="rtl"
      >
        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg,#10b981 0%,#059669 100%)' }} className="px-5 py-4 flex items-center gap-3">
          {tab !== 'choose' && (
            <button
              onClick={() => { setTab('choose'); setError(''); setSuccess(''); setOtpSent(false); }}
              className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors flex-shrink-0"
            >
              <ChevronLeft className="w-4 h-4 text-white" />
            </button>
          )}
          <div className="flex-1">
            <p className="text-white font-bold text-base leading-tight">
              {tab === 'choose' ? 'سجّل حسابك في سنبلة' :
               tab === 'email-login' ? 'تسجيل الدخول' :
               tab === 'email-register' ? 'إنشاء حساب' :
               tab === 'whatsapp' ? 'الدخول بالواتساب' : 'حسابي'}
            </p>
            <p className="text-white/75 text-xs">متجر ملابس الأطفال</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors">
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {/* Error / Success */}
          {error && (
            <div className="p-3 rounded-xl text-sm text-red-600 bg-red-50 border border-red-200">{error}</div>
          )}
          {success && (
            <div className="p-3 rounded-xl text-sm text-green-700 bg-green-50 border border-green-200 flex items-center gap-2">
              <Check className="w-4 h-4 flex-shrink-0" />{success}
            </div>
          )}

          {/* ── Choose tab ── */}
          {tab === 'choose' && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500 text-center">اختر طريقة التسجيل أو الدخول</p>

              {/* Google */}
              {googleClientId && (
                <button
                  onClick={handleGoogleLogin}
                  disabled={loading || !gisLoaded}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors font-medium text-gray-700 text-sm"
                >
                  <svg width="20" height="20" viewBox="0 0 48 48" className="flex-shrink-0">
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                    <path fill="#FBBC05" d="M10.53 28.59c-.5-1.45-.79-3-.79-4.59s.29-3.14.79-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                  </svg>
                  الدخول بـ Google
                </button>
              )}

              {/* WhatsApp */}
              <button
                onClick={() => { setTab('whatsapp'); setError(''); setSuccess(''); }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors font-medium text-gray-700 text-sm"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#25D366" className="flex-shrink-0">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                </svg>
                الدخول بالواتساب
              </button>

              {/* Email */}
              <button
                onClick={() => { setTab('email-login'); setError(''); }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors font-medium text-gray-700 text-sm"
              >
                <Mail className="w-5 h-5 text-blue-500 flex-shrink-0" />
                الدخول بالإيميل وكلمة المرور
              </button>

              <p className="text-center text-xs text-gray-400 mt-1">التسجيل اختياري — يمكنك التسوق بدون حساب</p>
            </div>
          )}

          {/* ── Email Login tab ── */}
          {tab === 'email-login' && (
            <div className="space-y-3">
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="الإيميل"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-900 focus:outline-none focus:border-green-400 transition-colors"
              />
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="كلمة المرور"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-900 focus:outline-none focus:border-green-400 transition-colors pr-4 pl-11"
                  onKeyDown={e => e.key === 'Enter' && handleEmailLogin()}
                />
                <button type="button" onClick={() => setShowPass(v => !v)} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <button
                onClick={handleEmailLogin} disabled={loading}
                className="w-full py-3 rounded-xl text-white font-bold text-sm transition-all active:scale-95 disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg,#10b981 0%,#059669 100%)' }}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'تسجيل الدخول'}
              </button>
              <button onClick={() => { setTab('email-register'); setError(''); }} className="w-full text-center text-sm text-green-600 font-medium py-1">
                ما عندك حساب؟ سجّل الآن
              </button>
            </div>
          )}

          {/* ── Email Register tab ── */}
          {tab === 'email-register' && (
            <div className="space-y-3">
              <input
                type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="اسمك (اختياري)"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-900 focus:outline-none focus:border-green-400 transition-colors"
              />
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="الإيميل"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-900 focus:outline-none focus:border-green-400 transition-colors"
              />
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="كلمة المرور (6 أحرف على الأقل)"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-900 focus:outline-none focus:border-green-400 transition-colors pr-4 pl-11"
                />
                <button type="button" onClick={() => setShowPass(v => !v)} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <button
                onClick={handleEmailRegister} disabled={loading}
                className="w-full py-3 rounded-xl text-white font-bold text-sm transition-all active:scale-95 disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg,#10b981 0%,#059669 100%)' }}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'إنشاء الحساب'}
              </button>
              <button onClick={() => { setTab('email-login'); setError(''); }} className="w-full text-center text-sm text-green-600 font-medium py-1">
                عندك حساب؟ سجّل الدخول
              </button>
            </div>
          )}

          {/* ── WhatsApp tab ── */}
          {tab === 'whatsapp' && (
            <div className="space-y-3">
              {!otpSent ? (
                <>
                  <input
                    type="text" value={name} onChange={e => setName(e.target.value)}
                    placeholder="اسمك (اختياري)"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-900 focus:outline-none focus:border-green-400 transition-colors"
                  />
                  <input
                    type="tel" value={whatsapp} onChange={e => setWhatsapp(e.target.value)}
                    placeholder="رقم الواتساب (مثال: 07701234567)"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-900 focus:outline-none focus:border-green-400 transition-colors"
                    dir="ltr"
                  />
                  <button
                    onClick={handleSendOtp} disabled={loading}
                    className="w-full py-3 rounded-xl text-white font-bold text-sm transition-all active:scale-95 disabled:opacity-60"
                    style={{ background: 'linear-gradient(135deg,#25D366 0%,#128C7E 100%)' }}
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'إرسال رمز التحقق'}
                  </button>
                </>
              ) : (
                <>
                  {/* OTP code displayed on screen */}
                  {otpCode && (
                    <div className="rounded-2xl border-2 border-green-400 bg-green-50 p-4 text-center">
                      <p className="text-xs text-green-700 font-semibold mb-2">🔐 رمز التحقق الخاص بك</p>
                      <p className="text-3xl font-black tracking-[0.3em] text-gray-900" style={{ fontFamily: 'monospace', direction: 'ltr' }}>{otpCode}</p>
                    </div>
                  )}
                  <p className="text-sm text-gray-600 text-center">أدخل الرمز أدناه للتأكيد</p>
                  <input
                    type="text" value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="رمز التحقق (6 أرقام)"
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 text-gray-900 text-base text-center tracking-widest focus:outline-none focus:border-green-400 transition-colors"
                    style={{ color: '#111', fontSize: 20, fontFamily: 'monospace', letterSpacing: '0.3em' }}
                    dir="ltr" maxLength={6}
                  />
                  <button
                    onClick={handleVerifyOtp} disabled={loading}
                    className="w-full py-3 rounded-xl text-white font-bold text-sm transition-all active:scale-95 disabled:opacity-60"
                    style={{ background: 'linear-gradient(135deg,#25D366 0%,#128C7E 100%)' }}
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'تأكيد'}
                  </button>
                  <button onClick={() => { setOtpSent(false); setOtp(''); setOtpCode(''); setError(''); setSuccess(''); }} className="w-full text-center text-sm text-gray-500 py-1">
                    تغيير الرقم
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Customer Profile Panel ───────────────────────────────────────────────────
const PRESET_AVATARS = [
  { bg: '#fde68a', emoji: '🌸' }, { bg: '#bbf7d0', emoji: '🌿' },
  { bg: '#fecaca', emoji: '🦋' }, { bg: '#ddd6fe', emoji: '⭐' },
  { bg: '#fed7aa', emoji: '🌻' }, { bg: '#bfdbfe', emoji: '🐬' },
  { bg: '#fbcfe8', emoji: '🦄' }, { bg: '#a7f3d0', emoji: '🌺' },
  { bg: '#fef08a', emoji: '🐝' }, { bg: '#e9d5ff', emoji: '🎀' },
  { bg: '#cffafe', emoji: '🐱' }, { bg: '#fef9c3', emoji: '🌙' },
  { bg: '#d1fae5', emoji: '🍀' }, { bg: '#ffe4e6', emoji: '🌹' },
  { bg: '#e0f2fe', emoji: '🦊' }, { bg: '#f3e8ff', emoji: '🎠' },
];

function makeAvatarSvg(emoji: string, bg: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="${bg}"/><text x="50" y="66" text-anchor="middle" font-size="52" font-family="Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,sans-serif">${emoji}</text></svg>`;
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

function CustomerProfilePanel({ account, token, onClose, onLogout, onUpdate }: {
  account: CustomerAccount;
  token: string;
  onClose: () => void;
  onLogout: () => void;
  onUpdate: (acc: CustomerAccount) => void;
}) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const [editName, setEditName] = useState(account.name ?? '');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      setLoading(true);
      try {
        const r = await fetch(`${base}/api/customer/profile`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ avatarBase64: base64 }),
        });
        const d = await r.json();
        if (r.ok) { onUpdate(d); setMsg('تم تحديث الصورة'); }
        else setMsg(d.error || 'فشل التحديث');
      } catch { setMsg('حدث خطأ'); } finally { setLoading(false); }
    };
    reader.readAsDataURL(file);
  };

  const handlePresetAvatar = async (emoji: string, bg: string) => {
    const dataUrl = makeAvatarSvg(emoji, bg);
    setLoading(true); setMsg('');
    try {
      const r = await fetch(`${base}/api/customer/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ avatarBase64: dataUrl }),
      });
      const d = await r.json();
      if (r.ok) { onUpdate(d); setMsg('تم تحديث الصورة ✓'); setShowAvatarPicker(false); }
      else setMsg(d.error || 'فشل التحديث');
    } catch { setMsg('حدث خطأ'); } finally { setLoading(false); }
  };

  const handleSaveName = async () => {
    setLoading(true); setMsg('');
    try {
      const r = await fetch(`${base}/api/customer/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: editName }),
      });
      const d = await r.json();
      if (r.ok) { onUpdate(d); setMsg('تم الحفظ ✓'); }
      else setMsg(d.error || 'فشل الحفظ');
    } catch { setMsg('حدث خطأ'); } finally { setLoading(false); }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-sm mx-4 rounded-2xl overflow-hidden shadow-2xl bg-white" dir="rtl">
        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg,#10b981 0%,#059669 100%)' }} className="px-5 py-4 flex items-center gap-3">
          <div className="flex-1">
            <p className="text-white font-bold text-base">حسابي</p>
            <p className="text-white/75 text-xs">سنبلة</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors">
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Avatar */}
          <div className="flex flex-col items-center gap-2">
            <div className="relative group cursor-pointer" onClick={() => setShowAvatarPicker(v => !v)}>
              <div className="w-20 h-20 rounded-full overflow-hidden border-4 border-green-100 bg-gray-100 flex items-center justify-center">
                {account.avatarUrl ? (
                  <img src={account.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-10 h-10 text-gray-300" />
                )}
              </div>
              <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera className="w-6 h-6 text-white" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowAvatarPicker(v => !v)}
                className="text-xs text-green-600 font-semibold underline"
              >
                {showAvatarPicker ? '← إغلاق' : '🎨 اختر avatar جاهز'}
              </button>
              <button
                onClick={() => fileRef.current?.click()}
                className="text-xs text-gray-400 underline"
              >
                📷 رفع صورة
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />

            {/* Preset avatar grid */}
            {showAvatarPicker && (
              <div className="w-full rounded-2xl border border-green-100 bg-green-50 p-3">
                <p className="text-[11px] text-green-700 font-semibold text-center mb-2">اختر صورة جاهزة</p>
                <div className="grid grid-cols-8 gap-2">
                  {PRESET_AVATARS.map(({ bg, emoji }) => (
                    <button
                      key={emoji}
                      onClick={() => handlePresetAvatar(emoji, bg)}
                      disabled={loading}
                      className="w-9 h-9 rounded-full flex items-center justify-center text-xl transition-transform hover:scale-110 active:scale-95 shadow-sm disabled:opacity-50"
                      style={{ background: bg }}
                      title={emoji}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-sm text-gray-600 font-medium">الاسم</label>
            <div className="flex gap-2">
              <input
                type="text" value={editName} onChange={e => setEditName(e.target.value)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 focus:outline-none focus:border-green-400"
                placeholder="اسمك"
              />
              <button
                onClick={handleSaveName} disabled={loading}
                className="px-4 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-60"
                style={{ background: '#10b981' }}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حفظ'}
              </button>
            </div>
          </div>

          {/* Info */}
          <div className="space-y-2 text-sm text-gray-600">
            {account.email && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-gray-50">
                <Mail className="w-4 h-4 text-blue-500 flex-shrink-0" />
                <span className="truncate" dir="ltr">{account.email}</span>
              </div>
            )}
            {account.whatsapp && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-gray-50">
                <Phone className="w-4 h-4 text-green-500 flex-shrink-0" />
                <span dir="ltr">{account.whatsapp}</span>
              </div>
            )}
            {account.googleId && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-gray-50">
                <svg width="16" height="16" viewBox="0 0 48 48" className="flex-shrink-0">
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                  <path fill="#FBBC05" d="M10.53 28.59c-.5-1.45-.79-3-.79-4.59s.29-3.14.79-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                </svg>
                <span className="text-gray-500">Google Account</span>
              </div>
            )}
          </div>

          {msg && <p className="text-sm text-green-600 text-center">{msg}</p>}

          {/* Logout */}
          <button
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-red-200 text-red-500 font-medium text-sm hover:bg-red-50 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            تسجيل الخروج
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── PWA Install Arrow ────────────────────────────────────────────────────────
type PwaArrowAnim =
  | 'bounce-down' | 'slide-right' | 'slide-left' | 'swing'
  | 'shake-h'     | 'shake-v'    | 'pulse-glow'  | 'spin-drop'
  | 'rubber'      | 'flash';

interface PwaArrowCfg {
  enabled:   boolean;
  color:     string;
  size:      number;
  duration:  number;
  animation: PwaArrowAnim;
}

const PWA_ARROW_DEFAULTS: PwaArrowCfg = {
  enabled: true, color: '#22c55e', size: 90, duration: 3, animation: 'bounce-down',
};

// ─── Footer types ─────────────────────────────────────────────────────────────
type FooterSocial = { enabled: boolean; url: string };
type FooterSettings = {
  enabled: boolean;
  aboutText: string;
  bgColor: string;
  textColor: string;
  socials: {
    facebook: FooterSocial;
    instagram: FooterSocial;
    tiktok: FooterSocial;
    whatsapp: FooterSocial;
    telegram: FooterSocial;
    snapchat: FooterSocial;
    youtube: FooterSocial;
  };
};
const FOOTER_DEFAULTS: FooterSettings = {
  enabled: true,
  aboutText: '',
  bgColor: '#1a1a2e',
  textColor: '#e2e8f0',
  socials: {
    facebook:  { enabled: false, url: '' },
    instagram: { enabled: false, url: '' },
    tiktok:    { enabled: false, url: '' },
    whatsapp:  { enabled: false, url: '' },
    telegram:  { enabled: false, url: '' },
    snapchat:  { enabled: false, url: '' },
    youtube:   { enabled: false, url: '' },
  },
};

const PWA_ARROW_KEYFRAMES = `
@keyframes pwa-bounce-down {
  0%   { transform: translateY(-60px) scale(.8); opacity:0; }
  55%  { transform: translateY(12px)  scale(1.05); opacity:1; }
  75%  { transform: translateY(-8px)  scale(.97); }
  90%  { transform: translateY(6px)   scale(1.02); }
  100% { transform: translateY(0)     scale(1); opacity:1; }
}
@keyframes pwa-slide-right {
  0%   { transform: translateX(-120px) rotate(-15deg); opacity:0; }
  70%  { transform: translateX(10px)   rotate(3deg);  opacity:1; }
  100% { transform: translateX(0)      rotate(0);     opacity:1; }
}
@keyframes pwa-slide-left {
  0%   { transform: translateX(120px) rotate(15deg); opacity:0; }
  70%  { transform: translateX(-10px) rotate(-3deg); opacity:1; }
  100% { transform: translateX(0)     rotate(0);     opacity:1; }
}
@keyframes pwa-swing {
  0%   { transform-origin: top center; transform: rotate(-30deg); opacity:0; }
  20%  { transform: rotate(25deg); opacity:1; }
  40%  { transform: rotate(-18deg); }
  60%  { transform: rotate(12deg); }
  80%  { transform: rotate(-6deg); }
  100% { transform: rotate(0deg); opacity:1; }
}
@keyframes pwa-shake-h {
  0%,100% { transform: translateX(0); }
  10%,30%,50%,70%,90% { transform: translateX(-14px); }
  20%,40%,60%,80%     { transform: translateX(14px);  }
}
@keyframes pwa-shake-v {
  0%,100% { transform: translateY(0); }
  10%,30%,50%,70%,90% { transform: translateY(-12px); }
  20%,40%,60%,80%     { transform: translateY(12px);  }
}
@keyframes pwa-pulse-glow {
  0%,100% { transform: scale(1);    filter: drop-shadow(0 0 4px currentColor); }
  50%     { transform: scale(1.18); filter: drop-shadow(0 0 20px currentColor); }
}
@keyframes pwa-spin-drop {
  0%   { transform: translateY(-80px) rotate(-360deg); opacity:0; }
  60%  { transform: translateY(8px)   rotate(10deg);  opacity:1; }
  80%  { transform: translateY(-4px)  rotate(-5deg); }
  100% { transform: translateY(0)     rotate(0);     opacity:1; }
}
@keyframes pwa-rubber {
  0%   { transform: scaleX(1)   scaleY(1); }
  30%  { transform: scaleX(1.25) scaleY(.75); }
  40%  { transform: scaleX(.75) scaleY(1.25); }
  55%  { transform: scaleX(1.15) scaleY(.85); }
  70%  { transform: scaleX(.95) scaleY(1.05); }
  100% { transform: scaleX(1)   scaleY(1); }
}
@keyframes pwa-flash {
  0%,50%,100% { opacity:1; }
  25%,75%     { opacity:0; }
}
`;

const ANIM_CSS: Record<PwaArrowAnim, string> = {
  'bounce-down': 'pwa-bounce-down 0.9s cubic-bezier(.36,.07,.19,.97) both',
  'slide-right': 'pwa-slide-right 0.7s ease both',
  'slide-left':  'pwa-slide-left  0.7s ease both',
  'swing':       'pwa-swing       0.9s ease both',
  'shake-h':     'pwa-shake-h     0.8s ease infinite',
  'shake-v':     'pwa-shake-v     0.8s ease infinite',
  'pulse-glow':  'pwa-pulse-glow  1.2s ease-in-out infinite',
  'spin-drop':   'pwa-spin-drop   0.9s cubic-bezier(.36,.07,.19,.97) both',
  'rubber':      'pwa-rubber      0.9s ease infinite',
  'flash':       'pwa-flash       1s linear infinite',
};

// Portal overlay: centered bounce animation, plays for cfg.duration then disappears
function PwaAnimOverlay({ cfg }: { cfg: PwaArrowCfg }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setVisible(false), cfg.duration * 1000);
    return () => clearTimeout(t);
  }, [cfg.duration]);

  if (!visible) return null;

  return createPortal(
    <>
      <style>{PWA_ARROW_KEYFRAMES}</style>
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 99999, pointerEvents: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <svg width={cfg.size} height={cfg.size} viewBox="0 0 24 24" fill="none"
            style={{ animation: ANIM_CSS[cfg.animation], filter: `drop-shadow(0 4px 16px ${cfg.color}90)` }}>
            <path d="M12 4v13m0 0l-5-5m5 5l5-5" stroke={cfg.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M4 20h16" stroke={cfg.color} strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
          <div style={{
            background: cfg.color, color: '#fff',
            padding: '7px 18px', borderRadius: 28,
            fontSize: Math.max(12, cfg.size / 7),
            fontWeight: 800, whiteSpace: 'nowrap',
            boxShadow: `0 6px 24px ${cfg.color}70`,
            animation: ANIM_CSS[cfg.animation],
          }}>
            أضف سنبلة لشاشتك الرئيسية 📲
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}

export default function Storefront() {
  const [user, setUser] = useState<StorefrontUser>(() => getOrCreateAnonymousUser());
  const [customerAccount, setCustomerAccount] = useState<CustomerAccount | null>(() => getStoredCustomer());
  const [customerToken, setCustomerToken] = useState<string | null>(() => localStorage.getItem(CUSTOMER_TOKEN_KEY));
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);

  // ── PWA Install Bar: bar shows immediately, animation overlay plays independently ──
  const [pwaBarCfg, setPwaBarCfg] = useState<PwaArrowCfg | null>(null);
  const [installBannerMsg, setInstallBannerMsg] = useState('أضف سنبلة لشاشتك الرئيسية');
  // ── Footer settings ──────────────────────────────────────────────────────────
  const [footerCfg, setFooterCfg] = useState<FooterSettings | null>(null);

  // ── IP-based visit tracking on mount ────────────────────────────────────────
  useEffect(() => {
    const visitorId = getOrCreateVisitorId();
    const base = import.meta.env.BASE_URL.replace(/\/$/, '');
    fetch(`${base}/api/storefront/track-visit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorId, userAgent: navigator.userAgent }),
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [seasonFilter, setSeasonFilter] = useState('');
  const [genderFilter, setGenderFilter] = useState('');
  const [search, setSearch] = useState('');
  // ── PWA Install Prompt ─────────────────────────────────────────────────────
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [showIosInstall, setShowIosInstall] = useState(false);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
  const isInstalled = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true || localStorage.getItem('sonbola_pwa_installed') === '1';
  // Separate check for the PWA bar/animation — only hides when truly in standalone mode (no localStorage)
  const isPwaInstalled = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;

  // Fetch PWA arrow config once on mount; bar shows immediately, animation overlay is independent
  useEffect(() => {
    if (isPwaInstalled) return;
    fetch('/api/storefront/pwa-arrow')
      .then(r => r.json())
      .then((d: Partial<PwaArrowCfg>) => {
        const merged: PwaArrowCfg = { ...PWA_ARROW_DEFAULTS, ...d };
        if (merged.enabled) setPwaBarCfg(merged);
      })
      .catch(() => setPwaBarCfg(PWA_ARROW_DEFAULTS));
    // Fetch install-banner message so the bar and the notification show the same text
    fetch('/api/storefront/install-banner')
      .then(r => r.json())
      .then((d: { enabled?: boolean; message?: string }) => {
        if (d.message) setInstallBannerMsg(d.message);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch footer settings once on mount
  useEffect(() => {
    fetch('/api/storefront/footer')
      .then(r => r.json())
      .then((d: Partial<FooterSettings>) => {
        const merged: FooterSettings = {
          ...FOOTER_DEFAULTS,
          ...d,
          socials: { ...FOOTER_DEFAULTS.socials, ...(d.socials ?? {}) },
        };
        if (merged.enabled) setFooterCfg(merged);
      })
      .catch(() => {});
  }, []);


  // ── Per-button animation types (from settings) ─────────────────────────────
  const [btnAnims, setBtnAnims] = useState<BtnAnimations>(DEFAULT_BTN_ANIMS);
  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.ok ? r.json() : {})
      .then((d: any) => {
        if (d.btnAnimations) {
          try {
            const parsed = JSON.parse(d.btnAnimations);
            setBtnAnims(prev => ({ ...prev, ...parsed }));
          } catch {}
        } else if (d.btnAnimationType) {
          setBtnAnims(prev => ({ ...prev, whatsapp: d.btnAnimationType as BtnAnim }));
        }
      })
      .catch(() => {});
  }, []);

  // ── Active storefront theme ────────────────────────────────────────────────
  const [sfTheme, setSfTheme] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    fetch('/api/storefront/active-theme')
      .then(r => r.ok ? r.json() : null)
      .then((d: any) => { if (d?.config) setSfTheme(d.config); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (isPwaInstalled) return;
    const handler = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    const onInstalled = () => {
      localStorage.setItem('sonbola_pwa_installed', '1');
      setInstallPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', handler as any);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler as any);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);


  // ── Grid Layout ─────────────────────────────────────────────────────────────
  const [gridLayout, setGridLayout] = useState<'2' | '3' | 'explorer'>('2');
  useEffect(() => {
    fetch('/api/storefront/grid-layout')
      .then(r => r.json())
      .then(d => { if (d.layout === '2' || d.layout === '3' || d.layout === 'explorer') setGridLayout(d.layout); })
      .catch(() => {});
  }, []);

  // ── Storefront Notes + Ticker colors ────────────────────────────────────────
  const [storefrontNotes, setStorefrontNotes] = useState('');
  const [tickerColors, setTickerColors] = useState({ bg: '#f59e0b', text: '#ffffff' });
  const [notesColors, setNotesColors] = useState({ bg: '#eff6ff', text: '#1e40af' });
  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.ok ? r.json() : Promise.resolve({}))
      .then((d: any) => {
        if (d.storefrontNotes) setStorefrontNotes(d.storefrontNotes);
        try { if (d.tickerColors) setTickerColors(c => ({ ...c, ...JSON.parse(d.tickerColors) })); } catch {}
        try { if (d.notesColors) setNotesColors(c => ({ ...c, ...JSON.parse(d.notesColors) })); } catch {}
      })
      .catch(() => {});
  }, []);

  // ── Ticker messages ─────────────────────────────────────────────────────────
  const [tickerMsgs, setTickerMsgs] = useState<string[]>([]);
  const [tickerIdx, setTickerIdx] = useState(0);
  const [tickerVisible, setTickerVisible] = useState(true);

  useEffect(() => {
    fetch('/api/storefront/ticker')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setTickerMsgs(d.map((m: any) => m.text)); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (tickerMsgs.length <= 1) return;
    const interval = setInterval(() => {
      setTickerVisible(false);
      setTimeout(() => {
        setTickerIdx(i => (i + 1) % tickerMsgs.length);
        setTickerVisible(true);
      }, 500);
    }, 5000);
    return () => clearInterval(interval);
  }, [tickerMsgs.length]);


  const handleInstall = async () => {
    if (isIOS) { setShowIosInstall(true); return; }
    if (installPrompt) {
      installPrompt.prompt();
      const result = await installPrompt.userChoice;
      if (result.outcome === 'accepted') {
        localStorage.setItem('sonbola_pwa_installed', '1');
        setInstallPrompt(null);
      }
    } else {
      // Fallback: Chrome hasn't provided install prompt yet — show manual instructions
      setShowIosInstall(true);
    }
  };

  const cartKey = user ? `storefront_cart_${user.phone}` : null;

  const [cart, setCartRaw] = useState<CartItem[]>(() => {
    if (!user) return [];
    try {
      const raw = localStorage.getItem(`storefront_cart_${user.phone}`);
      return raw ? (JSON.parse(raw) as CartItem[]) : [];
    } catch { return []; }
  });
  const [cartOpen, setCartOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatProduct, setChatProduct] = useState<Product | undefined>();
  const [chatKey, setChatKey] = useState(0);
  const [fabPos, setFabPos] = useState<{ right: number; bottom: number }>(() => ({
    right: 12,
    bottom: Math.max(8, Math.round(window.innerHeight / 2) - 28),
  }));
  const fabDragRef = useRef<{ startX: number; startY: number; startRight: number; startBottom: number } | null>(null);
  const fabDidDragRef = useRef(false);

  // Persist cart to localStorage whenever it changes
  const setCart = (updater: CartItem[] | ((prev: CartItem[]) => CartItem[])) => {
    setCartRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (cartKey) {
        try { localStorage.setItem(cartKey, JSON.stringify(next)); } catch {}
      }
      return next;
    });
  };

  const handleLogout = () => {
    localStorage.removeItem(STOREFRONT_USER_KEY);
    localStorage.removeItem(VISITOR_ID_KEY);
    setChatOpen(false);
    setCartRaw([]);
    setUser(getOrCreateAnonymousUser());
  };

  // ── Session duration tracking ──────────────────────────────────────────────
  useEffect(() => {
    if (!user?.phone) return;
    const sessionStart = Date.now();
    let lastSent = 0;

    const sendDuration = (seconds: number) => {
      if (seconds <= 0) return;
      const body = JSON.stringify({ phone: user.phone, seconds });
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/storefront/session-ping', new Blob([body], { type: 'application/json' }));
      } else {
        fetch('/api/storefront/session-ping', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
      }
    };

    const heartbeat = setInterval(() => {
      const elapsed = Math.floor((Date.now() - sessionStart) / 1000);
      const chunk = elapsed - lastSent;
      if (chunk >= 60) { sendDuration(chunk); lastSent = elapsed; }
    }, 60_000);

    const handleUnload = () => {
      const elapsed = Math.floor((Date.now() - sessionStart) / 1000);
      const chunk = elapsed - lastSent;
      sendDuration(chunk);
    };
    window.addEventListener('beforeunload', handleUnload);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') handleUnload();
    });

    return () => {
      clearInterval(heartbeat);
      window.removeEventListener('beforeunload', handleUnload);
      const elapsed = Math.floor((Date.now() - sessionStart) / 1000);
      sendDuration(elapsed - lastSent);
    };
  }, [user?.phone]);

  // Reload cart when user changes (e.g. login after logout)
  useEffect(() => {
    if (!user) return;
    try {
      const raw = localStorage.getItem(`storefront_cart_${user.phone}`);
      setCartRaw(raw ? (JSON.parse(raw) as CartItem[]) : []);
    } catch { setCartRaw([]); }
  }, [user?.phone]);

  useEffect(() => {
    if (!user) return;
    fetch('/api/storefront/products')
      .then(r => r.json())
      .then((data: Product[]) => { setProducts(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [user?.phone]);

  const filtered = products.filter(p => {
    if (seasonFilter && p.category !== seasonFilter) return false;
    if (genderFilter && p.gender !== genderFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!p.productId.toLowerCase().includes(q) &&
          !(p.descriptionAr ?? '').toLowerCase().includes(q) &&
          !(p.colors ?? '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  const addToCart = (product: Product) => {
    setCart(prev => {
      const ex = prev.find(i => i.product.productId === product.productId);
      if (ex) return prev.map(i => i.product.productId === product.productId ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { product, qty: 1 }];
    });
  };

  const removeFromCart = (id: string) => setCart(prev => prev.filter(i => i.product.productId !== id));
  const changeQty = (id: string, qty: number) => setCart(prev => prev.map(i => i.product.productId === id ? { ...i, qty } : i));

  const openChat = (product?: Product) => {
    if (product?.id) {
      const base = import.meta.env.BASE_URL.replace(/\/$/, '');
      fetch(`${base}/api/inventory/${product.id}/view`, { method: 'POST' }).catch(() => {});
    }
    // Only reset the chat (remount) when switching to a DIFFERENT product
    // Opening chat with no product, or reopening same product, preserves history
    const isNewProduct = product?.productId !== chatProduct?.productId && !!product?.productId;
    if (isNewProduct) {
      setChatKey(k => k + 1);
    }
    setChatProduct(product);
    setChatOpen(true);
  };

  return (
    <div className="min-h-screen" dir="rtl" style={{ fontFamily: sfTheme?.fontFamily ?? "'Segoe UI', Tahoma, sans-serif", background: sfTheme?.pageBg ?? '#f7f8fa' }}>
      {sfTheme && (
        <style>{`
          :root {
            --sf-primary: ${sfTheme.primaryColor ?? '#25d366'};
            --sf-primary-text: ${sfTheme.primaryText ?? '#ffffff'};
            --sf-accent: ${sfTheme.accentColor ?? '#ff6b9d'};
            --sf-card-bg: ${sfTheme.cardBg ?? '#ffffff'};
            --sf-card-border: ${sfTheme.cardBorder ?? '#f0f0f0'};
            --sf-card-radius: ${sfTheme.cardRadius ?? 16}px;
            --sf-badge-sale-bg: ${sfTheme.badgeSaleBg ?? '#ef4444'};
            --sf-badge-sale-text: ${sfTheme.badgeSaleText ?? '#ffffff'};
          }
          .sf-card { background: var(--sf-card-bg) !important; border-color: var(--sf-card-border) !important; border-radius: var(--sf-card-radius) !important; }
          .sf-badge-sale { background: var(--sf-badge-sale-bg) !important; color: var(--sf-badge-sale-text) !important; }
          .sf-primary-btn { background: var(--sf-primary) !important; color: var(--sf-primary-text) !important; }
          .sf-cart-badge { background: var(--sf-primary) !important; }
        `}</style>
      )}

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b" style={{ background: sfTheme?.headerBg ?? '#ffffff', borderColor: sfTheme?.headerBorder ?? '#e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          {/* Logo */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <img
              src={`${import.meta.env.BASE_URL}logo.png`}
              alt="SONBOLA"
              className="h-10 w-auto object-contain"
            />
          </div>

          {/* Search */}
          <div className="flex-1 max-w-sm relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ابحث عن منتج..."
              className="w-full h-9 pr-9 pl-4 rounded-full border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:border-blue-400 focus:bg-white transition-colors"
            />
          </div>

          {/* Right side: user + cart */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* 👤 Customer Account Button */}
            <button
              onClick={() => customerAccount ? setProfileModalOpen(true) : setAuthModalOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl transition-all hover:bg-gray-50 active:scale-95 relative"
              title={customerAccount ? (customerAccount.name ?? 'حسابي') : 'تسجيل الدخول'}
            >
              {customerAccount?.avatarUrl ? (
                <img src={customerAccount.avatarUrl} alt="avatar" className="w-7 h-7 rounded-full object-cover border-2 border-green-300" />
              ) : (
                <div className={`w-7 h-7 rounded-full flex items-center justify-center ${customerAccount ? 'bg-green-500' : 'bg-gray-100'}`}>
                  <User className={`w-4 h-4 ${customerAccount ? 'text-white' : 'text-gray-400'}`} />
                </div>
              )}
              <span className="hidden sm:block text-sm font-medium text-gray-700">
                {customerAccount ? (customerAccount.name?.split(' ')[0] ?? 'حسابي') : 'دخول'}
              </span>
            </button>

            {/* Cart button */}
            <button
              onClick={() => setCartOpen(true)}
              className="relative flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors"
            >
              <ShoppingCart className="w-5 h-5 text-red-500" />
              {cartCount > 0 && (
                <span className="sf-cart-badge absolute -top-1 -left-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {cartCount}
                </span>
              )}
              <span className="hidden sm:block text-sm font-medium text-gray-700">السلة</span>
            </button>

            {/* Install App */}
            {!isInstalled && (
              <button
                onClick={handleInstall}
                title="تثبيت التطبيق"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all"
                style={{ background: 'linear-gradient(135deg,#10b981 0%,#059669 100%)', color: '#fff', boxShadow: '0 2px 8px rgba(16,185,129,0.35)' }}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span className="hidden sm:block">تثبيت</span>
              </button>
            )}

          </div>
        </div>
      </header>

      {/* ── Customer Auth Modal ──────────────────────────────────────────────── */}
      {authModalOpen && (
        <CustomerAuthModal
          onClose={() => setAuthModalOpen(false)}
          onLogin={(acc, token) => {
            storeCustomer(acc, token);
            setCustomerAccount(acc);
            setCustomerToken(token);
            setAuthModalOpen(false);
          }}
        />
      )}

      {/* ── Customer Profile Modal ────────────────────────────────────────────── */}
      {profileModalOpen && customerAccount && customerToken && (
        <CustomerProfilePanel
          account={customerAccount}
          token={customerToken}
          onClose={() => setProfileModalOpen(false)}
          onLogout={() => {
            clearCustomer();
            setCustomerAccount(null);
            setCustomerToken(null);
            setProfileModalOpen(false);
          }}
          onUpdate={(updated) => {
            storeCustomer(updated, customerToken);
            setCustomerAccount(updated);
          }}
        />
      )}


      <style>{`
        @keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes slideDown { from { transform: translateY(-100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes tickerScroll { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
      `}</style>


      {/* ── iOS Install Modal ──────────────────────────────────────────────── */}
      {showIosInstall && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowIosInstall(false)}>
          <div className="bg-white rounded-t-2xl w-full max-w-md p-6 pb-10" dir="rtl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-800">أضف سنبلة لشاشتك الرئيسية</h3>
              <button onClick={() => setShowIosInstall(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="flex items-center gap-3 mb-5 p-3 rounded-xl" style={{ background: '#f0fdf4' }}>
              <img src={`${import.meta.env.BASE_URL}logo.png`} alt="سنبلة" className="w-14 h-14 rounded-2xl object-cover" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }} />
              <div>
                <p className="font-bold text-gray-800 text-base">سنبلة</p>
                <p className="text-sm text-gray-500">متجر ملابس الأطفال</p>
              </div>
            </div>
            {isIOS ? (
              <div className="space-y-3">
                <p className="text-sm text-gray-600 font-medium">اتبع الخطوات التالية في Safari:</p>
                <div className="flex items-start gap-3 p-3 rounded-xl bg-gray-50">
                  <span className="w-7 h-7 rounded-full bg-blue-500 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">١</span>
                  <div className="flex items-center gap-2">
                    <Share2 className="w-5 h-5 text-blue-500 flex-shrink-0" />
                    <p className="text-sm text-gray-700">اضغط على زر <strong>المشاركة</strong> في أسفل Safari</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-xl bg-gray-50">
                  <span className="w-7 h-7 rounded-full bg-blue-500 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">٢</span>
                  <div className="flex items-center gap-2">
                    <Smartphone className="w-5 h-5 text-blue-500 flex-shrink-0" />
                    <p className="text-sm text-gray-700">اختر <strong>"Add to Home Screen"</strong> (إضافة إلى الشاشة الرئيسية)</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-xl bg-gray-50">
                  <span className="w-7 h-7 rounded-full bg-green-500 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">٣</span>
                  <p className="text-sm text-gray-700">اضغط <strong>Add</strong> (إضافة) في الأعلى</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-600 font-medium">اتبع الخطوات التالية في Chrome:</p>
                <div className="flex items-start gap-3 p-3 rounded-xl bg-gray-50">
                  <span className="w-7 h-7 rounded-full bg-green-500 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">١</span>
                  <p className="text-sm text-gray-700">اضغط على <strong>القائمة ⋮</strong> في أعلى Chrome</p>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-xl bg-gray-50">
                  <span className="w-7 h-7 rounded-full bg-green-500 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">٢</span>
                  <div className="flex items-center gap-2">
                    <Smartphone className="w-5 h-5 text-green-500 flex-shrink-0" />
                    <p className="text-sm text-gray-700">اختر <strong>"Add to Home screen"</strong></p>
                  </div>
                </div>
              </div>
            )}
            <button onClick={() => setShowIosInstall(false)} className="w-full mt-5 py-3 rounded-xl font-bold text-white" style={{ background: 'linear-gradient(135deg,#10b981 0%,#059669 100%)' }}>
              فهمت! شكراً
            </button>
          </div>
        </div>
      )}

      {/* ── Filter chips ───────────────────────────────────────────────── */}
      {(() => {
        const availableSeasons = (['Summer', 'Winter', 'Spring'] as const).filter(s => products.some(p => p.category === s));
        const availableGenders = (['Girls', 'Boys', 'both'] as const).filter(g => products.some(p => p.gender === g));
        if (availableSeasons.length === 0 && availableGenders.length === 0) return null;
        return (
          <div className="bg-white border-b border-gray-100 sticky top-[60px] z-20">
            <div className="max-w-6xl mx-auto px-4 py-2.5 flex items-center gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
              {availableSeasons.map(s => (
                <Chip key={s} active={seasonFilter === s} onClick={() => setSeasonFilter(v => v === s ? '' : s)}>
                  {s === 'Summer' ? '☀️' : s === 'Winter' ? '❄️' : '🌸'} {SEASON_AR[s]}
                </Chip>
              ))}
              {availableSeasons.length > 0 && availableGenders.length > 0 && (
                <div className="w-px h-5 bg-gray-200 flex-shrink-0 mx-1" />
              )}
              {availableGenders.map(g => (
                <Chip key={g} active={genderFilter === g} color="pink" onClick={() => setGenderFilter(v => v === g ? '' : g)}>
                  {g === 'Girls' ? '👧' : g === 'Boys' ? '👦' : '👦👧'} {GENDER_AR[g]}
                </Chip>
              ))}
            </div>
          </div>
        );
      })()}


      {/* ── PWA Install Bar (inline DOM flow, below filters, above ticker — always from load) ── */}
      {pwaBarCfg && !isPwaInstalled && (() => {
        const c = pwaBarCfg;
        return (
          <>
            <style>{`
              @keyframes pwa-bar-drop-in {
                0%   { transform: translateY(-100%); opacity: 0; }
                100% { transform: translateY(0);     opacity: 1; }
              }
              @keyframes pwa-bar-glow-inline {
                0%,100% { box-shadow: 0 4px 20px ${c.color}50; }
                50%     { box-shadow: 0 4px 32px ${c.color}90; }
              }
            `}</style>
            <button
              onClick={handleInstall}
              style={{
                width: '100%', border: 'none',
                background: c.color,
                padding: '10px 20px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                animation: 'pwa-bar-drop-in 0.4s cubic-bezier(0.16,1,0.3,1) both, pwa-bar-glow-inline 2.5s ease-in-out infinite 0.4s',
                boxShadow: `0 4px 16px ${c.color}50`,
                cursor: 'pointer',
              }}
            >
              <span style={{ color: '#fff', fontWeight: 800, fontSize: 14, letterSpacing: 0.2 }}>
                {installBannerMsg}
              </span>
            </button>
          </>
        );
      })()}

      {/* ── News Ticker Bar ─────────────────────────────────────────────────── */}
      {tickerMsgs.length > 0 && (
        <div className="w-full overflow-hidden flex items-center">
          <div
            className="w-full flex items-center justify-center overflow-hidden"
            style={{ background: tickerColors.bg, boxShadow: `0 2px 12px ${tickerColors.bg}55` }}
          >
            <div className="overflow-hidden px-4 py-2.5 flex items-center justify-center w-full">
              <p
                className="text-xs font-semibold truncate text-center"
                style={{
                  color: tickerColors.text,
                  transition: 'opacity 0.5s ease, transform 0.5s ease',
                  opacity: tickerVisible ? 1 : 0,
                  transform: tickerVisible ? 'translateY(0)' : 'translateY(-8px)',
                }}
                dir="rtl"
              >
                {tickerMsgs[tickerIdx] ?? ''}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Storefront Notes ─────────────────────────────────────────────────── */}
      {storefrontNotes && (
        <div className="w-full" dir="rtl">
          <div className="flex items-center justify-center px-4 py-2.5 text-sm font-medium" style={{ background: notesColors.bg, color: notesColors.text }}>
            <span className="leading-relaxed text-center" dir="rtl">{storefrontNotes}</span>
          </div>
        </div>
      )}

      {/* ── Product grid ───────────────────────────────────────────────── */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-400">
            <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
            <p className="text-sm">جارٍ تحميل المنتجات...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-400">
            <Package className="w-16 h-16 opacity-20" />
            <p className="text-lg font-medium">لا توجد منتجات</p>
            {(seasonFilter || genderFilter || search) && (
              <button onClick={() => { setSeasonFilter(''); setGenderFilter(''); setSearch(''); }} className="text-sm text-blue-600 underline">
                إزالة الفلاتر
              </button>
            )}
          </div>
        ) : (
          <>
            <div
              className={
                gridLayout === 'explorer'
                  ? '-mx-4'
                  : gridLayout === '3'
                  ? 'grid grid-cols-3 gap-0.5 -mx-4'
                  : 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4'
              }
              style={gridLayout === 'explorer' ? { columns: 3, columnGap: 2 } : undefined}
            >
              {filtered.map(p => (
                <ProductCard
                  key={p.id}
                  product={p}
                  onAddToCart={() => { addToCart(p); setCartOpen(true); }}
                  onChat={() => openChat(p)}
                  cartAnim={btnAnims.cart}
                  chatAnim={btnAnims.chat}
                  cartColor={btnAnims.cartColor}
                  chatColor={btnAnims.chatColor}
                  instagramMode={gridLayout === '3'}
                  explorerMode={gridLayout === 'explorer'}
                />
              ))}
            </div>
          </>
        )}
      </main>

      {/* ── Storefront Footer ──────────────────────────────────────────── */}
      {footerCfg && (
        <footer dir="rtl" style={{ background: footerCfg.bgColor, color: footerCfg.textColor }} className="w-full mt-6 px-5 py-8">
          {/* About text */}
          {footerCfg.aboutText && (
            <div className="mb-6 text-sm leading-relaxed opacity-90 whitespace-pre-line text-center" style={{ color: footerCfg.textColor }}>
              {footerCfg.aboutText}
            </div>
          )}
          {/* Social icon buttons */}
          {Object.values(footerCfg.socials).some(s => s.enabled && s.url) && (
            <div className="flex flex-wrap justify-center gap-5 mb-6">
              {footerCfg.socials.facebook.enabled && footerCfg.socials.facebook.url && (
                <a href={footerCfg.socials.facebook.url} target="_blank" rel="noopener noreferrer"
                  className="flex flex-col items-center gap-1.5 group active:scale-90 transition-transform">
                  <span className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg transition-transform group-active:scale-90"
                    style={{ background: '#1877f2' }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="white"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
                  </span>
                  <span className="text-xs font-medium opacity-70" style={{ color: footerCfg.textColor }}>Facebook</span>
                </a>
              )}
              {footerCfg.socials.instagram.enabled && footerCfg.socials.instagram.url && (
                <a href={footerCfg.socials.instagram.url} target="_blank" rel="noopener noreferrer"
                  className="flex flex-col items-center gap-1.5 group active:scale-90 transition-transform">
                  <span className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg"
                    style={{ background: 'linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)' }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
                      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
                    </svg>
                  </span>
                  <span className="text-xs font-medium opacity-70" style={{ color: footerCfg.textColor }}>Instagram</span>
                </a>
              )}
              {footerCfg.socials.tiktok.enabled && footerCfg.socials.tiktok.url && (
                <a href={footerCfg.socials.tiktok.url} target="_blank" rel="noopener noreferrer"
                  className="flex flex-col items-center gap-1.5 group active:scale-90 transition-transform">
                  <span className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg"
                    style={{ background: '#010101' }}>
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="white">
                      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.87a8.19 8.19 0 0 0 4.78 1.52V7a4.85 4.85 0 0 1-1.01-.31z"/>
                    </svg>
                  </span>
                  <span className="text-xs font-medium opacity-70" style={{ color: footerCfg.textColor }}>TikTok</span>
                </a>
              )}
              {footerCfg.socials.whatsapp.enabled && footerCfg.socials.whatsapp.url && (
                <a href={footerCfg.socials.whatsapp.url} target="_blank" rel="noopener noreferrer"
                  className="flex flex-col items-center gap-1.5 group active:scale-90 transition-transform">
                  <span className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg"
                    style={{ background: '#25d366' }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
                    </svg>
                  </span>
                  <span className="text-xs font-medium opacity-70" style={{ color: footerCfg.textColor }}>WhatsApp</span>
                </a>
              )}
              {footerCfg.socials.telegram.enabled && footerCfg.socials.telegram.url && (
                <a href={footerCfg.socials.telegram.url} target="_blank" rel="noopener noreferrer"
                  className="flex flex-col items-center gap-1.5 group active:scale-90 transition-transform">
                  <span className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg"
                    style={{ background: '#0088cc' }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
                      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248-1.97 9.289c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L6.12 14.53l-2.96-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.696.956z"/>
                    </svg>
                  </span>
                  <span className="text-xs font-medium opacity-70" style={{ color: footerCfg.textColor }}>Telegram</span>
                </a>
              )}
              {footerCfg.socials.snapchat.enabled && footerCfg.socials.snapchat.url && (
                <a href={footerCfg.socials.snapchat.url} target="_blank" rel="noopener noreferrer"
                  className="flex flex-col items-center gap-1.5 group active:scale-90 transition-transform">
                  <span className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg"
                    style={{ background: '#FFFC00' }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="#000">
                      <path d="M12.206.793c.99 0 4.347.276 5.93 3.821.529 1.193.403 3.219.333 4.616-.031.62.084.846.232.846.218.0.63-.181 1.02-.338.196-.075.39-.139.592-.139.388.0.894.2.894.71.0.522-.822.923-1.078 1.032-.05.022-.122.064-.198.113-.602.366-1.344.817-1.206 1.754.193 1.281 2.037 2.764 3.115 3.544.46.33.605.467.605.607.0.15-.122.288-.354.288h-.028l-.02.001c-.37.037-1.01.12-1.72.421-.453.195-.607.52-.607.743.0.1-.001.209-.003.315-.008.373-.018.739-.024 1.088-.012.69-.118.864-.507.864-.212.0-.519-.113-.82-.236-.527-.213-1.108-.448-1.89-.448-.422.0-.773.042-1.197.104-.503.074-1.07.151-1.887.151-.818.0-1.38-.077-1.879-.151-.427-.063-.775-.104-1.197-.104-.783.0-1.363.235-1.89.448-.302.123-.608.236-.82.236-.389.0-.495-.174-.507-.864-.006-.35-.016-.715-.024-1.088-.002-.106-.003-.215-.003-.315.0-.223-.155-.547-.607-.743-.71-.301-1.35-.384-1.72-.421l-.02-.001h-.029c-.23.0-.352-.138-.352-.288.0-.14.144-.277.604-.607 1.078-.78 2.922-2.263 3.115-3.544.138-.937-.604-1.388-1.206-1.754-.076-.049-.148-.091-.198-.113-.256-.109-1.078-.51-1.078-1.032.0-.51.506-.71.894-.71.202.0.396.064.592.139.39.157.802.338 1.02.338.148.0.263-.226.232-.846-.07-1.397-.196-3.423.333-4.616C7.856 1.069 11.213.793 12.206.793z"/>
                    </svg>
                  </span>
                  <span className="text-xs font-medium opacity-70" style={{ color: footerCfg.textColor }}>Snapchat</span>
                </a>
              )}
              {footerCfg.socials.youtube.enabled && footerCfg.socials.youtube.url && (
                <a href={footerCfg.socials.youtube.url} target="_blank" rel="noopener noreferrer"
                  className="flex flex-col items-center gap-1.5 group active:scale-90 transition-transform">
                  <span className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg"
                    style={{ background: '#FF0000' }}>
                    <svg width="30" height="30" viewBox="0 0 24 24" fill="white">
                      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                    </svg>
                  </span>
                  <span className="text-xs font-medium opacity-70" style={{ color: footerCfg.textColor }}>YouTube</span>
                </a>
              )}
            </div>
          )}
          {/* Divider + copyright */}
          <div className="text-center text-xs opacity-50 pt-4 border-t" style={{ borderColor: `${footerCfg.textColor}30` }}>
            سنبلة © {new Date().getFullYear()} — جميع الحقوق محفوظة
          </div>
        </footer>
      )}

      {/* ── Cart drawer ────────────────────────────────────────────────── */}
      {cartOpen && (
        <CartDrawer items={cart} onRemove={removeFromCart} onQtyChange={changeQty} onClearCart={() => setCartRaw([])} onClose={() => setCartOpen(false)} user={user} btnAnimType={btnAnims.whatsapp} />
      )}

      {/* ── Floating chat button (draggable) — snake border ────────────── */}
      <div
        className="fixed z-40"
        style={{ bottom: fabPos.bottom, right: fabPos.right, touchAction: 'none', cursor: 'grab' }}
        onTouchStart={e => {
          const t = e.touches[0];
          fabDragRef.current = { startX: t.clientX, startY: t.clientY, startRight: fabPos.right, startBottom: fabPos.bottom };
          fabDidDragRef.current = false;
        }}
        onTouchMove={e => {
          if (!fabDragRef.current) return;
          e.preventDefault();
          const t = e.touches[0];
          const dx = t.clientX - fabDragRef.current.startX;
          const dy = t.clientY - fabDragRef.current.startY;
          if (Math.abs(dx) > 5 || Math.abs(dy) > 5) fabDidDragRef.current = true;
          const newRight = Math.max(8, Math.min(window.innerWidth - 64, fabDragRef.current.startRight - dx));
          const newBottom = Math.max(8, Math.min(window.innerHeight - 64, fabDragRef.current.startBottom - dy));
          setFabPos({ right: newRight, bottom: newBottom });
        }}
        onTouchEnd={() => { fabDragRef.current = null; }}
      >
        {(() => {
          const fabBtn = (
            <button
              onClick={() => {
                if (fabDidDragRef.current) { fabDidDragRef.current = false; return; }
                chatOpen ? setChatOpen(false) : openChat();
              }}
              className={`w-14 h-14 rounded-full text-white flex items-center justify-center active:scale-95${btnAnims.fab === 'glass-shimmer' ? ' btn-glass-shimmer' : btnAnims.fab === 'pulse' ? ' btn-pulse' : ''}`}
              style={{ background: 'linear-gradient(135deg,#1877f2,#0d65d9)', boxShadow: '0 4px 20px rgba(24,119,242,0.45)' }}
              title={chatOpen ? 'إغلاق الدردشة' : 'دردش معنا'}
            >
              {chatOpen ? <ArrowRight className="w-6 h-6" /> : <MessageCircle className="w-7 h-7" />}
            </button>
          );
          return btnAnims.fab === 'neon-trace'
            ? <NeonSnakeBorder color="#ff2d78" borderRadius={28} strokeWidth={2.5} snakeFraction={0.3} duration={2.5}>{fabBtn}</NeonSnakeBorder>
            : fabBtn;
        })()}
      </div>

      {/* ── Chat widget — always mounted, hidden via CSS to preserve history ── */}
      <div style={{ display: chatOpen ? 'block' : 'none' }}>
        <ChatWidget
          key={chatKey}
          initialProduct={chatProduct}
          onClose={() => { setChatOpen(false); }}
          user={user ?? undefined}
        />
      </div>

      {/* ── PWA Animation Overlay (centered bounce, disappears after duration) ── */}
      {pwaBarCfg && !isPwaInstalled && <PwaAnimOverlay cfg={pwaBarCfg} />}
    </div>
  );
}

// ─── Chip helper ─────────────────────────────────────────────────────────────

function Chip({ children, active, onClick, color = 'blue' }: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  color?: 'blue' | 'pink';
}) {
  const activeStyle = color === 'pink' ? { background: '#ec4899', color: '#fff' } : { background: '#1877f2', color: '#fff' };
  const inactiveStyle = { background: '#f3f4f6', color: '#4b5563' };
  return (
    <button
      onClick={onClick}
      className="flex-shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium transition-all active:scale-95"
      style={active ? activeStyle : inactiveStyle}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = '#e5e7eb'; }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = '#f3f4f6'; }}
    >
      {children}
    </button>
  );
}
