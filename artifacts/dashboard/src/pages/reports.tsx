import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, Button, Input } from '@/components/ui-custom';
import { BarChart2, ArrowUpDown, Ban, Trash2, UserX, Loader2, RefreshCw, CheckCircle2, AlertCircle, MessageCircle, ShoppingCart, Activity, TrendingUp, ExternalLink, Zap, XCircle } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { useGetStats } from '@workspace/api-client-react';
import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, LabelList } from 'recharts';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

// ── Types ──────────────────────────────────────────────────────────────────
type SortKey = 'id' | 'viewCount' | 'botSendCount' | 'favoriteCount' | 'createdAt' | 'stock';

interface ProductStat {
  id: number;
  productId: string;
  category: string | null;
  gender: string | null;
  price: number | null;
  stock: number | null;
  available: boolean;
  viewCount: number;
  botSendCount: number;
  favoriteCount: number;
  createdAt: string;
  imageUrl: string | null;
  publicImageUrl: string | null;
}

interface Visitor {
  id: number;
  phone: string;
  name: string;
  visitCount: number;
  totalTimeSpent: number;
  firstVisitAt: string;
  lastVisitAt: string;
}

interface BlockedPhone {
  id: number;
  phone: string;
  reason: string;
  createdAt: string;
}

function normalizeForDisplay(phone: string): string {
  const p = phone.replace(/\D/g, '');
  if (p.length === 10 && p.startsWith('7')) return `0${p}`;
  return phone;
}

// ── ProductRankingSection ──────────────────────────────────────────────────
function ProductRankingSection() {
  const [stats, setStats] = useState<ProductStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('botSendCount');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    setLoading(true);
    fetch(`${BASE}/api/inventory/stats`)
      .then(r => r.json())
      .then(d => { setStats(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const toggle = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const sorted = [...stats].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number);
    return sortDir === 'desc' ? -cmp : cmp;
  });

  const SortBtn = ({ k, label }: { k: SortKey; label: string }) => (
    <button
      onClick={() => toggle(k)}
      className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${sortKey === k ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
    >
      {label}
      <ArrowUpDown className="w-3 h-3" />
      {sortKey === k && <span>{sortDir === 'desc' ? '↓' : '↑'}</span>}
    </button>
  );

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart2 className="w-4 h-4" />
          ترتيب وإحصائيات المنتجات
        </CardTitle>
        <p className="text-xs text-muted-foreground">المشاهدات على الواجهة + عدد مرات إرسال البوت لكل منتج</p>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2 mb-4 items-center">
          <span className="text-xs text-muted-foreground font-medium">ترتيب حسب:</span>
          <SortBtn k="botSendCount" label="إرسال البوت" />
          <SortBtn k="viewCount" label="المشاهدات" />
          <SortBtn k="favoriteCount" label="❤️ القلوب" />
          <SortBtn k="createdAt" label="التاريخ" />
          <SortBtn k="stock" label="المخزون" />
          <SortBtn k="id" label="الرقم التسلسلي" />
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> جاري التحميل...
          </div>
        ) : sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد منتجات بعد.</p>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="overflow-x-auto overflow-y-auto max-h-[540px]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10">
                <tr className="bg-muted/80 border-b border-border backdrop-blur-sm">
                  <th className="text-right px-3 py-2 font-semibold text-muted-foreground">#</th>
                  <th className="text-right px-3 py-2 font-semibold text-muted-foreground">الصورة</th>
                  <th className="text-right px-3 py-2 font-semibold text-muted-foreground">الكود</th>
                  <th className="text-right px-3 py-2 font-semibold text-muted-foreground">الصنف</th>
                  <th className="text-right px-3 py-2 font-semibold text-muted-foreground">السعر</th>
                  <th className="text-right px-3 py-2 font-semibold text-muted-foreground">المخزون</th>
                  <th className="text-right px-3 py-2 font-semibold text-muted-foreground">👁 مشاهدات</th>
                  <th className="text-right px-3 py-2 font-semibold text-muted-foreground">🤖 إرسال البوت</th>
                  <th className="text-right px-3 py-2 font-semibold text-muted-foreground">❤️ قلوب</th>
                  <th className="text-right px-3 py-2 font-semibold text-muted-foreground">الحالة</th>
                  <th className="text-right px-3 py-2 font-semibold text-muted-foreground">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((p, i) => {
                  const imgSrc = p.publicImageUrl || (p.imageUrl && !p.imageUrl.startsWith('data:') ? p.imageUrl : null);
                  return (
                  <tr key={p.id} className={`border-b border-border/50 ${i % 2 === 0 ? 'bg-background/50' : 'bg-muted/20'}`}>
                    <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                    <td className="px-2 py-1.5">
                      {imgSrc ? (
                        <img
                          src={imgSrc}
                          alt={p.productId}
                          className="w-10 h-10 rounded-lg object-cover border border-border/50 bg-muted/30"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-muted/30 border border-border/50 flex items-center justify-center text-muted-foreground/40 text-[9px]">
                          لا صورة
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono font-semibold">{p.productId}</td>
                    <td className="px-3 py-2">{p.category || '—'}</td>
                    <td className="px-3 py-2">{p.price ? `${p.price.toLocaleString()} د.ع` : '—'}</td>
                    <td className="px-3 py-2">{p.stock ?? 0}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1 font-semibold ${(p.viewCount ?? 0) > 0 ? 'text-blue-500' : 'text-muted-foreground'}`}>
                        {p.viewCount ?? 0}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1 font-semibold ${(p.botSendCount ?? 0) > 0 ? 'text-green-500' : 'text-muted-foreground'}`}>
                        {p.botSendCount ?? 0}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1 font-semibold ${(p.favoriteCount ?? 0) > 0 ? 'text-rose-500' : 'text-muted-foreground'}`}>
                        {(p.favoriteCount ?? 0) > 0 ? '❤️' : '🤍'} {p.favoriteCount ?? 0}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${p.available ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                        {p.available ? 'ظاهر' : 'مخفي'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {p.createdAt ? new Date(p.createdAt).toLocaleDateString('ar-IQ', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── StorefrontVisitorsCard ─────────────────────────────────────────────────
function StorefrontVisitorsCard() {
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [blocked, setBlocked] = useState<BlockedPhone[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [blockingId, setBlockingId] = useState<string | null>(null);
  const [manualPhone, setManualPhone] = useState('');
  const [manualReason, setManualReason] = useState('');
  const [manualAdding, setManualAdding] = useState(false);
  const [manualErr, setManualErr] = useState('');
  const [showManual, setShowManual] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [vRes, bRes] = await Promise.all([
        fetch(`${BASE}/api/storefront/visitors`),
        fetch(`${BASE}/api/beqolky/blocked-phones`),
      ]);
      const [v, b] = await Promise.all([vRes.json(), bRes.json()]);
      setVisitors(Array.isArray(v) ? v : []);
      setBlocked(Array.isArray(b) ? b : []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  const blockedSet = new Set(blocked.map(b => b.phone));
  const blockedMap = new Map(blocked.map(b => [b.phone, b]));

  const handleBlock = async (phone: string) => {
    if (!confirm(`هل تريد حظر الرقم ${phone}؟`)) return;
    setBlockingId(phone);
    try {
      await fetch(`${BASE}/api/beqolky/blocked-phones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, reason: '' }),
      });
      await loadAll();
    } catch {}
    setBlockingId(null);
  };

  const handleUnblock = async (id: number) => {
    if (!confirm('هل تريد رفع الحظر عن هذا الرقم؟')) return;
    try {
      await fetch(`${BASE}/api/beqolky/blocked-phones/${id}`, { method: 'DELETE' });
      await loadAll();
    } catch {}
  };

  const handleManualBlock = async () => {
    if (!manualPhone.trim()) { setManualErr('أدخل الرقم'); return; }
    setManualAdding(true); setManualErr('');
    try {
      const res = await fetch(`${BASE}/api/beqolky/blocked-phones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: manualPhone.trim(), reason: manualReason.trim() }),
      });
      const d = await res.json();
      if (!res.ok) { setManualErr(d.error || 'خطأ'); return; }
      setManualPhone(''); setManualReason(''); setShowManual(false);
      await loadAll();
    } catch { setManualErr('تعذّر الاتصال'); }
    finally { setManualAdding(false); }
  };

  const filtered = visitors.filter(v =>
    v.phone.includes(search) || v.name.includes(search)
  );

  const blockedOnlyPhones = blocked.filter(b => !visitors.some(v => v.phone === b.phone));

  const fmt = (iso: string) => iso
    ? new Date(iso).toLocaleDateString('ar-IQ', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

  const fmtDuration = (secs: number) => {
    if (!secs || secs <= 0) return <span className="text-muted-foreground/50">—</span>;
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return <span className="text-amber-400 font-semibold">{h}س {m}د</span>;
    if (m > 0) return <span className="text-emerald-400 font-semibold">{m}د {s}ث</span>;
    return <span className="text-muted-foreground">{s}ث</span>;
  };

  return (
    <Card className="glass-card">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <span>📱</span> زوار الموقع وإدارة الحظر
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">الأرقام التي سجّلت دخولها — يمكنك حظر أي رقم مباشرة من هنا</p>
          </div>
          <button
            onClick={() => setShowManual(s => !s)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors whitespace-nowrap"
          >
            <Ban className="w-3.5 h-3.5" /> حظر رقم
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 bg-primary/10 text-primary px-3 py-1.5 rounded-lg">
            <span className="text-lg font-bold">{visitors.length}</span>
            <span className="text-xs font-medium">زائر فريد</span>
          </div>
          <div className="flex items-center gap-2 bg-blue-500/10 text-blue-400 px-3 py-1.5 rounded-lg">
            <span className="text-lg font-bold">{visitors.reduce((s, v) => s + (v.visitCount ?? 1), 0)}</span>
            <span className="text-xs font-medium">إجمالي الزيارات</span>
          </div>
          {blocked.length > 0 && (
            <div className="flex items-center gap-2 bg-red-500/10 text-red-400 px-3 py-1.5 rounded-lg">
              <Ban className="w-3.5 h-3.5" />
              <span className="text-lg font-bold">{blocked.length}</span>
              <span className="text-xs font-medium">محظور</span>
            </div>
          )}
          <button onClick={loadAll} className="mr-auto p-1.5 rounded-lg bg-muted hover:bg-muted/80 transition-colors" title="تحديث">
            <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>

        {showManual && (
          <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/20 space-y-2">
            <p className="text-xs font-semibold text-red-400 flex items-center gap-1.5"><UserX className="w-3.5 h-3.5" /> حظر رقم يدوياً</p>
            <input
              value={manualPhone}
              onChange={e => { setManualPhone(e.target.value.replace(/[^\d+]/g, '')); setManualErr(''); }}
              placeholder="07XXXXXXXXX أو +964XXXXXXXXX"
              maxLength={16} inputMode="numeric" dir="ltr"
              className="w-full h-9 px-3 rounded-lg border border-white/10 bg-card text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-red-500/50 placeholder:text-muted-foreground"
              onKeyDown={e => e.key === 'Enter' && handleManualBlock()}
            />
            <input
              value={manualReason}
              onChange={e => setManualReason(e.target.value)}
              placeholder="سبب الحظر (اختياري)"
              maxLength={120}
              className="w-full h-9 px-3 rounded-lg border border-white/10 bg-card text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-red-500/50 placeholder:text-muted-foreground"
              onKeyDown={e => e.key === 'Enter' && handleManualBlock()}
            />
            {manualErr && <p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{manualErr}</p>}
            <div className="flex gap-2">
              <button onClick={handleManualBlock} disabled={manualAdding || !manualPhone.trim()}
                className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-semibold hover:bg-red-500/25 transition-colors disabled:opacity-50">
                {manualAdding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />} حظر
              </button>
              <button onClick={() => setShowManual(false)} className="px-3 py-1.5 rounded-lg bg-muted text-muted-foreground text-xs hover:bg-muted/80 transition-colors">إلغاء</button>
            </div>
          </div>
        )}

        <Input
          placeholder="🔍 ابحث برقم الهاتف أو الاسم..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="text-sm h-8"
          dir="rtl"
        />

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> جاري التحميل...
          </div>
        ) : filtered.length === 0 && blockedOnlyPhones.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            {search ? 'لا توجد نتائج للبحث' : 'لم يسجّل أحد دخوله بعد'}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="text-right px-3 py-2 font-semibold text-muted-foreground">#</th>
                  <th className="text-right px-3 py-2 font-semibold text-muted-foreground">رقم الهاتف</th>
                  <th className="text-right px-3 py-2 font-semibold text-muted-foreground">الاسم</th>
                  <th className="text-right px-3 py-2 font-semibold text-muted-foreground">الزيارات</th>
                  <th className="text-right px-3 py-2 font-semibold text-muted-foreground">⏱ مدة البقاء</th>
                  <th className="text-right px-3 py-2 font-semibold text-muted-foreground">آخر زيارة</th>
                  <th className="text-right px-3 py-2 font-semibold text-muted-foreground">الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((v, i) => {
                  const isBlocked = blockedSet.has(v.phone);
                  const blockedEntry = blockedMap.get(v.phone);
                  return (
                    <tr key={v.id} className={`border-b border-border/50 ${isBlocked ? 'bg-red-500/5' : i % 2 === 0 ? 'bg-background/50' : 'bg-muted/20'}`}>
                      <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-2" dir="ltr">
                        <span className="font-mono font-semibold">{v.phone}</span>
                        {isBlocked && (
                          <span className="mr-2 px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/20 text-red-400">محظور</span>
                        )}
                      </td>
                      <td className="px-3 py-2">{v.name || <span className="text-muted-foreground italic">—</span>}</td>
                      <td className="px-3 py-2">
                        <span className={`font-bold ${(v.visitCount ?? 1) > 1 ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                          {v.visitCount ?? 1}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{fmtDuration(v.totalTimeSpent ?? 0)}</td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{fmt(v.lastVisitAt)}</td>
                      <td className="px-3 py-2">
                        {isBlocked ? (
                          <button
                            onClick={() => blockedEntry && handleUnblock(blockedEntry.id)}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-green-500/10 text-green-400 text-[10px] font-semibold hover:bg-green-500/20 transition-colors"
                          >
                            <CheckCircle2 className="w-3 h-3" /> رفع الحظر
                          </button>
                        ) : (
                          <button
                            onClick={() => handleBlock(v.phone)}
                            disabled={blockingId === v.phone}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-500/10 text-red-400 text-[10px] font-semibold hover:bg-red-500/20 transition-colors disabled:opacity-50"
                          >
                            {blockingId === v.phone ? <Loader2 className="w-3 h-3 animate-spin" /> : <Ban className="w-3 h-3" />} حظر
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {!search && blockedOnlyPhones.map((b) => (
                  <tr key={`bo-${b.id}`} className="border-b border-border/50 bg-red-500/5">
                    <td className="px-3 py-2 text-muted-foreground">—</td>
                    <td className="px-3 py-2" dir="ltr">
                      <span className="font-mono font-semibold text-red-300">{normalizeForDisplay(b.phone)}</span>
                      <span className="mr-2 px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/20 text-red-400">محظور</span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground italic">لم يزر</td>
                    <td className="px-3 py-2 text-muted-foreground">—</td>
                    <td className="px-3 py-2 text-muted-foreground">—</td>
                    <td className="px-3 py-2 text-muted-foreground text-[10px]">
                      {b.reason && <span className="block text-muted-foreground/70">{b.reason}</span>}
                      {fmt(b.createdAt)}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => handleUnblock(b.id)}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-green-500/10 text-green-400 text-[10px] font-semibold hover:bg-green-500/20 transition-colors"
                      >
                        <CheckCircle2 className="w-3 h-3" /> رفع الحظر
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}


// ── StatCard ───────────────────────────────────────────────────────────────
function StatCard({ title, value, icon: Icon, color }: { title: string; value: number; icon: any; color: string }) {
  return (
    <Card className="group hover:border-primary/50 transition-colors duration-300">
      <CardContent className="p-6">
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold tracking-tight text-foreground">{value}</p>
          </div>
          <div className={`p-3 rounded-xl bg-black/20 ${color} group-hover:scale-110 transition-transform duration-300`}>
            <Icon className="w-6 h-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── GaugeBar ───────────────────────────────────────────────────────────────
function GaugeBar({ label, value, ar }: { label: string; value: number; ar: boolean }) {
  const pct = Math.min(100, Math.max(0, value));
  const color = pct >= 80 ? 'bg-red-500' : pct >= 50 ? 'bg-amber-500' : pct >= 20 ? 'bg-yellow-400' : 'bg-emerald-500';
  const textColor = pct >= 80 ? 'text-red-400' : pct >= 50 ? 'text-amber-400' : pct >= 20 ? 'text-yellow-400' : 'text-emerald-400';
  const status = pct >= 80 ? (ar ? 'خطر' : 'Critical') : pct >= 50 ? (ar ? 'تحذير' : 'Warning') : (ar ? 'طبيعي' : 'Healthy');
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold ${textColor}`}>{status}</span>
          <span className={`text-base font-bold ${textColor}`}>{pct.toFixed(1)}%</span>
        </div>
      </div>
      <div className="h-3 bg-white/10 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── MetaRateLimitMonitor ───────────────────────────────────────────────────
function MetaRateLimitMonitor({ ar }: { ar: boolean }) {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['/api/meta-rate-limit'],
    queryFn: () => fetch(`${BASE}/api/meta-rate-limit`).then(r => r.json()),
    refetchInterval: 2 * 60 * 1000,
    staleTime: 60_000,
  });
  const rawAppUsage = data?.appUsage as { call_count: number; total_time: number; total_cputime: number } | null | undefined;
  const businessUsage = data?.businessUsage as Record<string, Array<{ call_count: number; total_time: number; total_cputime: number }>> | null | undefined;
  const businessEntry = businessUsage ? Object.values(businessUsage).flatMap(arr => arr)[0] ?? null : null;
  const appUsage = rawAppUsage ?? businessEntry ?? null;
  const usageSource = rawAppUsage ? 'App Level' : businessEntry ? 'Page Level' : null;
  const error = data?.error as string | undefined;
  const checkedAt = data?.checkedAt as string | undefined;
  const formatTime = (iso: string) => new Date(iso).toLocaleTimeString(ar ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' });
  const hasData = appUsage && (appUsage.call_count !== undefined);
  const anyAlert = hasData && (appUsage.call_count >= 50 || appUsage.total_time >= 50 || appUsage.total_cputime >= 50);
  return (
    <Card className={`border ${anyAlert ? 'border-amber-500/40 bg-amber-500/5' : 'border-orange-500/20 bg-orange-500/5'}`}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-orange-400">
            <Activity className="w-5 h-5" />
            {ar ? 'مراقب حد معدل Meta API — حي' : 'Meta API Rate Limit — Live Monitor'}
          </CardTitle>
          <div className="flex items-center gap-3">
            {checkedAt && <span className="text-xs text-muted-foreground hidden sm:block">{ar ? 'آخر فحص:' : 'Last check:'} {formatTime(checkedAt)}</span>}
            <button onClick={() => refetch()} disabled={isFetching}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 transition-colors disabled:opacity-50">
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
              {ar ? 'تحديث' : 'Refresh'}
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading && <div className="flex items-center gap-3 py-4"><Activity className="w-5 h-5 animate-spin text-orange-400" /><p className="text-sm text-muted-foreground">{ar ? 'جاري استدعاء Meta API...' : 'Querying Meta API...'}</p></div>}
        {!isLoading && error === 'no_token' && (
          <div className="flex items-center gap-3 py-3 px-4 rounded-xl bg-white/5 border border-white/10">
            <XCircle className="w-5 h-5 text-muted-foreground shrink-0" />
            <p className="text-sm text-muted-foreground">{ar ? 'لم يتم ضبط توكن Meta بعد. اذهب إلى الإعدادات وأضف الـ Access Token.' : 'No Meta token configured. Go to Settings and add your Access Token.'}</p>
          </div>
        )}
        {!isLoading && error && error !== 'no_token' && (
          <div className="flex items-center gap-3 py-3 px-4 rounded-xl bg-red-500/10 border border-red-500/20">
            <XCircle className="w-5 h-5 text-red-400 shrink-0" /><p className="text-sm text-red-300">{error}</p>
          </div>
        )}
        {!isLoading && hasData && !error && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <p className="text-xs text-emerald-400 font-medium">
                {ar ? 'متصل بـ Meta API — بيانات حقيقية' : 'Connected to Meta API — Live data'}
                {usageSource && <span className="ml-1 text-muted-foreground">({usageSource})</span>}
              </p>
              {anyAlert && <span className="mr-auto text-xs font-bold text-amber-400 animate-pulse">⚠️ {ar ? 'تجاوز 50% — راقب الوضع' : 'Above 50% — Monitor closely'}</span>}
            </div>
            <GaugeBar label={ar ? 'عدد الطلبات (Call Count)' : 'API Call Count'} value={appUsage!.call_count} ar={ar} />
            <GaugeBar label={ar ? 'الوقت الإجمالي (Total Time)' : 'Total Time'} value={appUsage!.total_time} ar={ar} />
            <GaugeBar label={ar ? 'وقت المعالج (CPU Time)' : 'CPU Time'} value={appUsage!.total_cputime} ar={ar} />
            <p className="text-xs text-muted-foreground pt-1">
              {ar ? '* النسب تمثل الاستهلاك من الحد الأقصى المسموح به من Meta. عند تجاوز 100% سيتوقف البوت مؤقتاً.' : "* Percentages represent usage of Meta's allowed quota. At 100% the bot will be temporarily throttled."}
            </p>
          </div>
        )}
        <div className="flex flex-wrap gap-2 pt-1 border-t border-white/5">
          <a href="https://developers.facebook.com/tools/debug/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"><ExternalLink className="w-3 h-3" />{ar ? 'مصحّح التوكن' : 'Token Debugger'}</a>
          <span className="text-muted-foreground/30">·</span>
          <a href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"><ExternalLink className="w-3 h-3" />{ar ? 'Meta للمطورين' : 'Meta Developers'}</a>
          <span className="text-muted-foreground/30">·</span>
          <a href="https://developers.facebook.com/docs/graph-api/overview/rate-limiting/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"><ExternalLink className="w-3 h-3" />{ar ? 'توثيق Rate Limiting' : 'Rate Limit Docs'}</a>
        </div>
      </CardContent>
    </Card>
  );
}

// ── DashboardStatsSection ─────────────────────────────────────────────────
function DashboardStatsSection() {
  const { t, language } = useTranslation();
  const ar = language === 'ar';
  const { data: stats } = useGetStats();
  const { data: dailyStats } = useQuery({
    queryKey: ['/api/stats/daily'],
    queryFn: () => fetch(`${BASE}/api/stats/daily`).then(r => r.json()),
    refetchInterval: 60_000,
  });
  const chartData = Array.isArray(dailyStats) ? dailyStats : [];

  return (
    <>
      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title={t('totalConversations')} value={stats?.totalConversations || 0} icon={MessageCircle} color="text-blue-400" />
        <StatCard title={t('activeBookings')} value={stats?.activeConversations || 0} icon={ShoppingCart} color="text-emerald-400" />
        <StatCard title={t('completedBookings')} value={stats?.completedBookings || 0} icon={Activity} color="text-purple-400" />
        <StatCard title={t('escalatedChats')} value={stats?.escalatedConversations || 0} icon={AlertCircle} color="text-destructive" />
      </div>

      {/* System Status */}
      <Card className="border border-cyan-500/20 bg-cyan-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-cyan-400">
            <Zap className="w-5 h-5" />
            {ar ? 'حالة النظام' : 'System Status'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="bg-white/5 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-emerald-400">{stats?.totalInventoryItems || 0}</p>
              <p className="text-xs text-muted-foreground mt-1">{ar ? 'منتجات في المخزون' : 'Inventory Products'}</p>
            </div>
            <div className="bg-white/5 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-blue-400">{stats?.totalConversations || 0}</p>
              <p className="text-xs text-muted-foreground mt-1">{ar ? 'إجمالي المحادثات' : 'Total Conversations'}</p>
            </div>
            <div className="bg-white/5 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-amber-400">{stats?.activeConversations || 0}</p>
              <p className="text-xs text-muted-foreground mt-1">{ar ? 'حجوزات نشطة' : 'Active Bookings'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Messages Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            {ar ? '📊 رسائل الزبائن — آخر 7 أيام' : '📊 Customer Messages — Last 7 Days'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[280px] w-full">
            {chartData.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                {ar ? 'لا توجد رسائل في آخر 7 أيام' : 'No messages in the last 7 days'}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '8px' }}
                    formatter={(value: number) => [value, ar ? 'رسائل' : 'messages']}
                  />
                  <Line type="monotone" dataKey="msgs" stroke="hsl(var(--primary))" strokeWidth={3} dot={{ r: 4, fill: 'hsl(var(--primary))' }} activeDot={{ r: 8 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Meta Rate Limit */}
      <MetaRateLimitMonitor ar={ar} />
    </>
  );
}

// ── BookingsReport (merged: orders list + province breakdown) ───────────────
interface ProvinceStat {
  governorate: string;
  total: number;
  fromBot: number;
  fromStorefront: number;
  totalAmount: number;
  pending: number;
  completed: number;
  cancelled: number;
}

interface SFBooking {
  id: number;
  senderName: string | null;
  phoneNumber: string | null;
  governorate: string | null;
  status: string;
  totalAmount: number | null;
  starred: boolean;
  createdAt: string;
}

const PROVINCE_COLORS: Record<string, string> = {
  'بغداد': '#6366f1', 'البصرة': '#8b5cf6', 'نينوى': '#a78bfa',
  'أربيل': '#10b981', 'السليمانية': '#34d399', 'كركوك': '#f59e0b',
  'الأنبار': '#f97316', 'بابل': '#06b6d4', 'ذي قار': '#ec4899',
  'واسط': '#14b8a6', 'النجف': '#84cc16', 'كربلاء': '#ef4444',
  'صلاح الدين': '#3b82f6', 'ميسان': '#f43f5e', 'المثنى': '#a3e635',
  'القادسية': '#22d3ee', 'ديالى': '#fb923c', 'دهوك': '#c084fc',
  'حلبجة': '#4ade80', 'زاخو': '#fbbf24',
};

function BookingsReport() {
  const [tab, setTab] = useState<'orders' | 'provinces'>('orders');
  const [beeBalances, setBeeBalances] = useState<Record<string, number>>({});

  const { data: provinceData, isLoading: provLoading, refetch: refetchProv, isFetching: provFetching } = useQuery<ProvinceStat[]>({
    queryKey: ['/api/bookings/stats/provinces'],
    queryFn: () => fetch(`${BASE}/api/bookings/stats/provinces`).then(r => r.json()),
    refetchInterval: 60_000,
  });

  const { data: ordersData, isLoading: ordersLoading, refetch: refetchOrders, isFetching: ordersFetching } = useQuery<SFBooking[]>({
    queryKey: ['/api/bookings', 'storefront'],
    queryFn: () => fetch(`${BASE}/api/bookings`).then(r => r.json()).then((d: SFBooking[]) => d.filter(b => (b as any).platform === 'storefront')),
    refetchInterval: 60_000,
  });

  const rows: ProvinceStat[] = Array.isArray(provinceData) ? provinceData : [];
  const orders: SFBooking[] = Array.isArray(ordersData) ? ordersData : [];

  // ── Fetch bee balances once orders are loaded ──────────────────────────────
  useEffect(() => {
    if (!orders.length) return;
    const phones = [...new Set(orders.map(o => o.phoneNumber).filter(Boolean) as string[])];
    if (!phones.length) return;
    fetch(`${BASE}/api/beqolky/bee/balances?phones=${encodeURIComponent(phones.join(','))}`)
      .then(r => r.ok ? r.json() : {})
      .then((map: Record<string, number>) => setBeeBalances(map))
      .catch(() => {});
  }, [ordersData]);

  // ── Summary stats from province data (all platforms) ──
  const grandTotal = rows.reduce((s, r) => s + r.total, 0);
  const grandAmount = rows.reduce((s, r) => s + r.totalAmount, 0);
  const grandCompleted = rows.reduce((s, r) => s + r.completed, 0);
  const grandPending = rows.reduce((s, r) => s + r.pending, 0);
  const grandCancelled = rows.reduce((s, r) => s + r.cancelled, 0);
  const grandBot = rows.reduce((s, r) => s + r.fromBot, 0);
  const grandStorefront = rows.reduce((s, r) => s + r.fromStorefront, 0);

  const chartData = rows.map(r => ({
    name: r.governorate,
    حجوزات: r.total,
  }));

  const isFetching = tab === 'orders' ? ordersFetching : provFetching;
  const refetch = tab === 'orders' ? refetchOrders : refetchProv;

  const fmtDate = (iso: string) => iso
    ? new Date(iso).toLocaleDateString('ar-IQ', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

  const statusBadge = (s: string) => {
    if (s === 'completed') return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400">مكتمل ✓</span>;
    if (s === 'cancelled') return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/15 text-red-400">ملغى ✗</span>;
    return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400">معلّق ⏳</span>;
  };

  return (
    <Card className="border border-indigo-500/20 bg-gradient-to-br from-indigo-500/5 to-emerald-500/5">
      <CardHeader className="pb-0">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart2 className="w-5 h-5 text-indigo-400" />
              <span>📦 تقرير الحجوزات</span>
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              إجمالي: <span className="text-indigo-300 font-bold">{grandTotal}</span> حجز
              {grandAmount > 0 && <> · <span className="text-amber-300 font-bold">{grandAmount.toLocaleString()}</span> د.ع</>}
              {grandBot > 0 && <> · <span className="text-blue-400">🤖 {grandBot} فيسبوك</span></>}
              {grandStorefront > 0 && <> · <span className="text-emerald-400">🛒 {grandStorefront} بوت الموقع</span></>}
            </p>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-white/10 hover:bg-white/15 text-muted-foreground transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            تحديث
          </button>
        </div>

        {/* Summary stat cards */}
        {grandTotal > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
            {[
              { label: 'إجمالي', val: grandTotal, color: 'text-foreground', bg: 'bg-white/5' },
              { label: 'مكتمل', val: grandCompleted, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
              { label: 'معلّق', val: grandPending, color: 'text-amber-400', bg: 'bg-amber-500/10' },
              { label: 'ملغى', val: grandCancelled, color: 'text-red-400', bg: 'bg-red-500/10' },
            ].map(c => (
              <div key={c.label} className={`${c.bg} rounded-xl p-2.5 text-center border border-white/10`}>
                <div className={`text-xl font-bold ${c.color}`}>{c.val}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{c.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mt-4 border-b border-white/10 pb-0">
          <button
            onClick={() => setTab('orders')}
            className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors border-b-2 -mb-px ${
              tab === 'orders'
                ? 'border-emerald-400 text-emerald-400 bg-emerald-500/10'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            🛒 قائمة الطلبات {orders.length > 0 && `(${orders.length})`}
          </button>
          <button
            onClick={() => setTab('provinces')}
            className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors border-b-2 -mb-px ${
              tab === 'provinces'
                ? 'border-indigo-400 text-indigo-400 bg-indigo-500/10'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            📍 حسب المحافظة {rows.length > 0 && `(${rows.length})`}
          </button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-4">

        {/* ── Tab: Orders List ─────────────────────────────────────── */}
        {tab === 'orders' && (
          <>
            {ordersLoading && (
              <div className="flex items-center gap-3 py-8 justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
                <span className="text-sm text-muted-foreground">جاري التحميل...</span>
              </div>
            )}
            {!ordersLoading && orders.length === 0 && (
              <div className="py-10 text-center">
                <ShoppingCart className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">لم تصل طلبات من بوت الموقع بعد</p>
              </div>
            )}
            {!ordersLoading && orders.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full text-xs" dir="rtl">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/5">
                      <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground">#</th>
                      <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground">الزبون</th>
                      <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground">الهاتف</th>
                      <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground">المحافظة</th>
                      <th className="text-center px-3 py-2.5 font-semibold text-muted-foreground">المبلغ</th>
                      <th className="text-center px-3 py-2.5 font-semibold text-amber-400">🐝 نقاط النحلة</th>
                      <th className="text-center px-3 py-2.5 font-semibold text-muted-foreground">الحالة</th>
                      <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground">التاريخ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((b, i) => (
                      <tr key={b.id} className={`border-b border-white/5 transition-colors ${i % 2 === 0 ? 'bg-background/30' : 'bg-white/5'}`}>
                        <td className="px-3 py-2.5 text-muted-foreground font-mono">
                          #{b.id + 951}
                          {b.starred && <span className="mr-1 text-amber-400">⭐</span>}
                        </td>
                        <td className="px-3 py-2.5 font-medium">{b.senderName || <span className="italic text-muted-foreground">—</span>}</td>
                        <td className="px-3 py-2.5 font-mono text-muted-foreground" dir="ltr">{b.phoneNumber || '—'}</td>
                        <td className="px-3 py-2.5">
                          {b.governorate
                            ? <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 text-[11px]">{b.governorate}</span>
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {b.totalAmount
                            ? <span className="font-semibold text-amber-300">{b.totalAmount.toLocaleString()}</span>
                            : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {(() => {
                            const bal = b.phoneNumber ? (beeBalances[b.phoneNumber] ?? null) : null;
                            if (bal === null) return <span className="text-muted-foreground/40">—</span>;
                            if (bal === 0) return <span className="text-muted-foreground/60 text-[11px]">0 🐝</span>;
                            return (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-400">
                                {bal.toLocaleString()} 🐝
                              </span>
                            );
                          })()}
                        </td>
                        <td className="px-3 py-2.5 text-center">{statusBadge(b.status)}</td>
                        <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{fmtDate(b.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-white/10 bg-white/5 font-semibold">
                      <td colSpan={4} className="px-3 py-2.5 text-muted-foreground">المجموع</td>
                      <td className="px-3 py-2.5 text-center text-amber-300">
                        {orders.filter(b => b.status !== 'cancelled').reduce((s, b) => s + (b.totalAmount ?? 0), 0).toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5 text-center text-amber-400 text-[11px]">
                        {Object.values(beeBalances).reduce((s, v) => s + v, 0).toLocaleString()} 🐝
                      </td>
                      <td className="px-3 py-2.5 text-center text-emerald-400">
                        {orders.filter(b => b.status === 'completed').length} مكتمل
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── Tab: Province Breakdown ───────────────────────────────── */}
        {tab === 'provinces' && (
          <>
            {provLoading && (
              <div className="flex items-center gap-3 py-8 justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
                <span className="text-sm text-muted-foreground">جاري تحميل البيانات...</span>
              </div>
            )}
            {!provLoading && rows.length === 0 && (
              <div className="py-10 text-center">
                <BarChart2 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">لا توجد حجوزات بعد</p>
              </div>
            )}
            {!provLoading && rows.length > 0 && (
              <>
                <div style={{ height: Math.max(320, chartData.length * 42 + 32) }} className="w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} layout="vertical" margin={{ left: 4, right: 48, top: 4, bottom: 4 }}>
                      <XAxis type="number" stroke="#888888" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                      <YAxis type="category" dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} width={110} />
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '8px', fontSize: 12 }} formatter={(val: number) => [val, 'إجمالي']} />
                      <Bar dataKey="حجوزات" radius={[0, 6, 6, 0]} barSize={24}>
                        {chartData.map((entry) => (
                          <Cell key={entry.name} fill={PROVINCE_COLORS[entry.name] ?? '#6366f1'} />
                        ))}
                        <LabelList dataKey="حجوزات" position="right" style={{ fill: '#94a3b8', fontSize: 12, fontWeight: 700 }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="overflow-x-auto rounded-xl border border-white/10">
                  <table className="w-full text-sm" dir="rtl">
                    <thead>
                      <tr className="border-b border-white/10 bg-white/5">
                        <th className="text-right px-3 py-2.5 text-xs font-semibold text-muted-foreground">#</th>
                        <th className="text-right px-3 py-2.5 text-xs font-semibold text-muted-foreground">المحافظة</th>
                        <th className="text-center px-3 py-2.5 text-xs font-semibold text-muted-foreground">الإجمالي</th>
                        <th className="text-center px-3 py-2.5 text-xs font-semibold text-blue-400">🤖 فيسبوك</th>
                        <th className="text-center px-3 py-2.5 text-xs font-semibold text-emerald-400">🛒 بوت الموقع</th>
                        <th className="text-center px-3 py-2.5 text-xs font-semibold text-amber-400">⏳ معلق</th>
                        <th className="text-center px-3 py-2.5 text-xs font-semibold text-green-400">✅ مكتمل</th>
                        <th className="text-center px-3 py-2.5 text-xs font-semibold text-red-400">❌ ملغي</th>
                        <th className="text-center px-3 py-2.5 text-xs font-semibold text-muted-foreground">المبلغ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, i) => {
                        const pct = grandTotal > 0 ? Math.round((row.total / grandTotal) * 100) : 0;
                        const color = PROVINCE_COLORS[row.governorate] ?? '#6366f1';
                        return (
                          <tr key={row.governorate} className={`border-b border-white/5 ${i % 2 === 0 ? '' : 'bg-white/3'} hover:bg-white/5 transition-colors`}>
                            <td className="px-3 py-2.5 text-xs text-muted-foreground">{i + 1}</td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                                <span className="font-medium">{row.governorate}</span>
                                <span className="text-xs text-muted-foreground">({pct}%)</span>
                              </div>
                              <div className="h-1.5 bg-white/10 rounded-full mt-1.5 w-20">
                                <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-center font-bold">{row.total}</td>
                            <td className="px-3 py-2.5 text-center text-blue-400">{row.fromBot || '—'}</td>
                            <td className="px-3 py-2.5 text-center text-emerald-400">{row.fromStorefront || '—'}</td>
                            <td className="px-3 py-2.5 text-center text-amber-400">{row.pending || '—'}</td>
                            <td className="px-3 py-2.5 text-center text-green-400">{row.completed || '—'}</td>
                            <td className="px-3 py-2.5 text-center text-red-400">{row.cancelled || '—'}</td>
                            <td className="px-3 py-2.5 text-center text-xs text-muted-foreground">{row.totalAmount > 0 ? row.totalAmount.toLocaleString() : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-white/20 bg-white/5 font-bold">
                        <td /><td className="px-3 py-2.5 text-xs text-muted-foreground">المجموع</td>
                        <td className="px-3 py-2.5 text-center">{grandTotal}</td>
                        <td className="px-3 py-2.5 text-center text-blue-400">{grandBot || '—'}</td>
                        <td className="px-3 py-2.5 text-center text-emerald-400">{grandStorefront || '—'}</td>
                        <td className="px-3 py-2.5 text-center text-amber-400">{grandPending || '—'}</td>
                        <td className="px-3 py-2.5 text-center text-green-400">{grandCompleted || '—'}</td>
                        <td className="px-3 py-2.5 text-center text-red-400">{grandCancelled || '—'}</td>
                        <td className="px-3 py-2.5 text-center text-xs text-muted-foreground">{grandAmount > 0 ? grandAmount.toLocaleString() : '—'}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Reports Page ───────────────────────────────────────────────────────────
export default function Reports() {
  const { language, isRtl } = useTranslation();
  const ar = language === 'ar';
  return (
    <div className="space-y-6 p-4 md:p-6" dir={isRtl ? 'rtl' : 'ltr'}>
      <div>
        <h1 className="text-2xl font-bold">{ar ? 'التقارير' : 'Reports'}</h1>
        <p className="text-sm text-muted-foreground mt-1">{ar ? 'إحصائيات المتجر، الزوار، وأسعار التوصيل' : 'Store statistics, visitors, and delivery prices'}</p>
      </div>

      <DashboardStatsSection />
      <BookingsReport />
      <StorefrontVisitorsCard />
      <ProductRankingSection />
    </div>
  );
}
