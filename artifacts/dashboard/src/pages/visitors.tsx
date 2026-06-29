import { useState, useEffect } from 'react';
import {
  Users, Shield, ShieldOff, RefreshCw, MapPin,
  Phone, Mail, Globe, Ban, Trash2, AlertTriangle,
  Eye, UserCheck, UserX, Search, ChevronDown, ChevronUp,
  RotateCcw,
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

interface AnonVisitor {
  kind: 'anonymous';
  visitorId: string;
  ip: string;
  governorate: string;
  city: string;
  visitCount: number;
  firstVisit: string;
  lastVisit: string;
  userAgent: string;
  banned: boolean;
}

interface RegVisitor {
  kind: 'registered';
  id: number;
  name: string;
  email: string | null;
  whatsapp: string | null;
  method: string;
  createdAt: string;
  banned: boolean;
}

interface StoreVisitor {
  kind: 'store_visitor';
  id: number;
  phone: string;
  name: string;
  visitCount: number;
  totalTimeSpent: number;
  beeBalance: number;
  firstVisitAt: string;
  lastVisitAt: string;
  banned: boolean;
}

interface SiteBan {
  id: number;
  type: string;
  value: string;
  reason: string;
  bannedAt: string;
}

type Tab = 'anonymous' | 'registered' | 'store' | 'bans';

const METHOD_LABELS: Record<string, { label: string; color: string; icon: typeof Phone }> = {
  whatsapp: { label: 'واتساب', color: 'text-emerald-400', icon: Phone },
  email:    { label: 'إيميل',  color: 'text-blue-400',    icon: Mail  },
  google:   { label: 'جوجل',  color: 'text-yellow-400',   icon: Globe },
  unknown:  { label: 'غير معروف', color: 'text-white/40', icon: UserCheck },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 2) return 'الآن';
  if (m < 60) return `${m} دقيقة`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ساعة`;
  const d = Math.floor(h / 24);
  return `${d} يوم`;
}

function shortAgent(ua: string): string {
  if (!ua) return '—';
  if (/iPhone|iPad/i.test(ua)) return '📱 iOS';
  if (/Android/i.test(ua)) return '📱 Android';
  if (/Windows/i.test(ua)) return '🖥️ Windows';
  if (/Mac/i.test(ua)) return '🖥️ Mac';
  if (/Linux/i.test(ua)) return '🖥️ Linux';
  return '🌐 متصفح';
}

export default function Visitors() {
  const { language, isRtl } = useTranslation();
  const ar = language === 'ar';
  const [tab, setTab] = useState<Tab>('anonymous');
  const [anonymous, setAnonymous] = useState<AnonVisitor[]>([]);
  const [registered, setRegistered] = useState<RegVisitor[]>([]);
  const [storeVisitors, setStoreVisitors] = useState<StoreVisitor[]>([]);
  const [bans, setBans] = useState<SiteBan[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [banModal, setBanModal] = useState<{ type: string; value: string; label: string } | null>(null);
  const [banReason, setBanReason] = useState('');
  const [banning, setBanning] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/beqolky/site-visitors`);
      if (res.ok) {
        const data = await res.json();
        setAnonymous(data.anonymous || []);
        setRegistered(data.registered || []);
        setStoreVisitors(data.storeVisitors || []);
        setBans(data.bans || []);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openBanModal = (type: string, value: string, label: string) => {
    setBanModal({ type, value, label });
    setBanReason('');
  };

  const confirmBan = async () => {
    if (!banModal) return;
    setBanning(true);
    try {
      await fetch(`${BASE}/api/beqolky/site-bans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: banModal.type, value: banModal.value, reason: banReason }),
      });
      setBanModal(null);
      await load();
    } catch { /* ignore */ }
    finally { setBanning(false); }
  };

  const removeBan = async (id: number) => {
    await fetch(`${BASE}/api/beqolky/site-bans/${id}`, { method: 'DELETE' });
    await load();
  };

  const doReset = async () => {
    setResetting(true);
    try {
      await fetch(`${BASE}/api/beqolky/site-visitors/reset`, { method: 'DELETE' });
      setAnonymous([]);
      setResetConfirm(false);
    } catch { /* ignore */ }
    finally { setResetting(false); }
  };

  // Compute province stats from anonymous visitors
  const provinceStats = (() => {
    const counts: Record<string, number> = {};
    for (const v of anonymous) {
      const gov = v.governorate || 'غير معروف';
      counts[gov] = (counts[gov] || 0) + (v.visitCount || 1);
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  })();
  const maxProvCount = provinceStats[0]?.[1] || 1;

  // Compute device stats from user agent
  const deviceStats = (() => {
    const counts: Record<string, number> = {};
    for (const v of anonymous) {
      const ua = v.userAgent || '';
      let device: string;
      if (/iPad/i.test(ua))                         device = '📟 تابليت';
      else if (/iPhone/i.test(ua))                  device = '🍎 آيفون';
      else if (/Android.*Mobile/i.test(ua))         device = '📱 أندرويد';
      else if (/Android/i.test(ua))                 device = '📟 أندرويد تابليت';
      else if (/Windows/i.test(ua))                 device = '🖥️ ويندوز';
      else if (/Macintosh|Mac OS/i.test(ua))        device = '🍎 ماك';
      else if (/Linux/i.test(ua))                   device = '🐧 لينكس';
      else                                          device = '🌐 غير معروف';
      counts[device] = (counts[device] || 0) + (v.visitCount || 1);
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  })();
  const maxDevCount = deviceStats[0]?.[1] || 1;

  const anonFiltered = anonymous.filter(v =>
    !search ||
    v.ip.includes(search) ||
    v.governorate.includes(search) ||
    v.visitorId.includes(search)
  );

  const regFiltered = registered.filter(v =>
    !search ||
    (v.name || '').includes(search) ||
    (v.email || '').includes(search) ||
    (v.whatsapp || '').includes(search)
  );

  const storeFiltered = storeVisitors.filter(v =>
    !search ||
    (v.name || '').includes(search) ||
    (v.phone || '').includes(search)
  );

  const tabs: { key: Tab; label: string; count: number; icon: typeof Users }[] = [
    { key: 'anonymous',  label: ar ? 'مجهولون'    : 'Anonymous',    count: anonymous.length,     icon: Eye      },
    { key: 'store',      label: ar ? 'زوار المتجر' : 'Store Visitors', count: storeVisitors.length, icon: UserCheck },
    { key: 'registered', label: ar ? 'مسجلون'     : 'Registered',   count: registered.length,    icon: Users    },
    { key: 'bans',       label: ar ? 'محظورون'    : 'Banned',       count: bans.length,          icon: Ban       },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Users className="text-primary" size={24} />
            {ar ? 'زوار الموقع' : 'Site Visitors'}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">{ar ? 'كل من دخل sonbola.shop — مجهول أو مسجل' : 'Everyone who visited sonbola.shop — anonymous or registered'}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-sm font-medium"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            {ar ? 'تحديث' : 'Refresh'}
          </button>
          <button
            onClick={() => setResetConfirm(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors text-sm font-medium border border-red-500/20"
          >
            <RotateCcw size={15} />
            {ar ? 'مسح الكل' : 'Clear All'}
          </button>
        </div>
      </div>

      {/* Stats row: provinces + devices */}
      {(provinceStats.length > 0 || deviceStats.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Province stats */}
          {provinceStats.length > 0 && (
            <div className="bg-card border border-white/10 rounded-2xl p-4 col-span-full">
              <div className="flex items-center gap-2 mb-4">
                <MapPin size={16} className="text-primary" />
                <h2 className="text-sm font-bold text-foreground">أكثر محافظة دخلت الموقع</h2>
                <span className="text-xs text-muted-foreground mr-auto">زيارات</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
                {provinceStats.map(([gov, count], i) => (
                  <div key={gov} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-5 flex-shrink-0 text-center">{i + 1}</span>
                    <span className="text-sm text-foreground w-32 flex-shrink-0">{gov}</span>
                    <div className="flex-1 bg-white/5 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary to-purple-500 transition-all"
                        style={{ width: `${(count / maxProvCount) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-bold text-foreground w-10 text-left flex-shrink-0">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Device stats */}
          {deviceStats.length > 0 && (
            <div className="bg-card border border-white/10 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-4">
                <Globe size={16} className="text-cyan-400" />
                <h2 className="text-sm font-bold text-foreground">نوع الجهاز</h2>
                <span className="text-xs text-muted-foreground mr-auto">زيارات</span>
              </div>
              <div className="space-y-2.5">
                {deviceStats.map(([device, count]) => (
                  <div key={device} className="flex items-center gap-3">
                    <span className="text-sm text-foreground w-36 flex-shrink-0">{device}</span>
                    <div className="flex-1 bg-white/5 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all"
                        style={{ width: `${(count / maxDevCount) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-bold text-foreground w-8 text-left flex-shrink-0">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-card border border-white/10 rounded-2xl p-3 text-center">
          <p className="text-xl font-bold">{anonymous.length}</p>
          <p className="text-xs text-muted-foreground mt-1">مجهول</p>
        </div>
        <div className="bg-card border border-white/10 rounded-2xl p-3 text-center">
          <p className="text-xl font-bold text-emerald-400">{storeVisitors.length}</p>
          <p className="text-xs text-muted-foreground mt-1">زوار المتجر</p>
        </div>
        <div className="bg-card border border-white/10 rounded-2xl p-3 text-center">
          <p className="text-xl font-bold">{registered.length}</p>
          <p className="text-xs text-muted-foreground mt-1">مسجل</p>
        </div>
        <div className="bg-card border border-white/10 rounded-2xl p-3 text-center">
          <p className="text-xl font-bold text-red-400">{bans.length}</p>
          <p className="text-xs text-muted-foreground mt-1">محظور</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-4 gap-1 bg-black/20 p-1 rounded-xl border border-white/10">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setSearch(''); }}
            className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all ${
              tab === t.key
                ? 'bg-primary text-white shadow'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <t.icon size={13} />
            {t.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${tab === t.key ? 'bg-white/20' : 'bg-white/10'}`}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Search */}
      {tab !== 'bans' && (
        <div className="relative">
          <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={
              tab === 'anonymous' ? 'ابحث بـ IP أو المحافظة...' :
              tab === 'store'     ? 'ابحث بالاسم أو الهاتف...' :
              'ابحث بالاسم أو الهاتف أو الإيميل...'
            }
            className="w-full bg-card border border-white/10 rounded-xl pr-9 pl-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
          />
        </div>
      )}

      {/* ── Anonymous visitors ── */}
      {tab === 'anonymous' && (
        <div
          className="space-y-3 overflow-y-auto pr-1"
          style={{ maxHeight: '72vh' }}
        >
          {loading ? (
            <p className="text-center text-muted-foreground py-8">جاري التحميل...</p>
          ) : anonFiltered.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">لا يوجد زوار</p>
          ) : anonFiltered.map(v => (
            <div
              key={v.visitorId}
              className={`bg-card border rounded-xl p-4 transition-colors ${v.banned ? 'border-red-500/30 bg-red-500/5' : 'border-white/10'}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${v.banned ? 'bg-red-500/20' : 'bg-white/5'}`}>
                    {v.banned ? <UserX size={16} className="text-red-400" /> : <Eye size={16} className="text-muted-foreground" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-mono text-foreground/70">{v.ip || '—'}</span>
                      <span className="text-xs bg-white/10 px-2 py-0.5 rounded-full">{v.governorate}</span>
                      <span className="text-xs text-muted-foreground">{shortAgent(v.userAgent)}</span>
                      {v.banned && <span className="text-xs text-red-400 font-medium">محظور</span>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {v.visitCount} زيارة · آخر زيارة {timeAgo(v.lastVisit)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => setExpanded(expanded === v.visitorId ? null : v.visitorId)}
                    className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {expanded === v.visitorId ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  {!v.banned ? (
                    <button
                      onClick={() => openBanModal('visitor_id', v.visitorId, `زائر ${v.ip}`)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors text-xs"
                    >
                      <Ban size={12} /> حظر
                    </button>
                  ) : (
                    <span className="text-xs text-red-400/60">محظور</span>
                  )}
                </div>
              </div>

              {expanded === v.visitorId && (
                <div className="mt-3 pt-3 border-t border-white/10 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div><span className="text-white/40">Visitor ID:</span> <span className="font-mono text-xs break-all">{v.visitorId.slice(0, 20)}...</span></div>
                  <div><span className="text-white/40">IP:</span> {v.ip}</div>
                  <div><span className="text-white/40">أول زيارة:</span> {new Date(v.firstVisit).toLocaleDateString('ar-IQ')}</div>
                  <div><span className="text-white/40">آخر زيارة:</span> {new Date(v.lastVisit).toLocaleDateString('ar-IQ')}</div>
                  <div className="col-span-2 flex gap-2 mt-1">
                    <button
                      onClick={() => openBanModal('visitor_id', v.visitorId, `زائر ${v.ip} (بالـ ID)`)}
                      className="flex-1 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs hover:bg-red-500/20 transition-colors"
                    >
                      حظر بالـ Visitor ID
                    </button>
                    {v.ip && (
                      <button
                        onClick={() => openBanModal('ip', v.ip, `IP ${v.ip}`)}
                        className="flex-1 py-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs hover:bg-orange-500/20 transition-colors"
                      >
                        حظر بالـ IP
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Registered visitors ── */}
      {tab === 'registered' && (
        <div className="space-y-3 overflow-y-auto pr-1" style={{ maxHeight: '72vh' }}>
          {loading ? (
            <p className="text-center text-muted-foreground py-8">جاري التحميل...</p>
          ) : regFiltered.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">لا يوجد مسجلون</p>
          ) : regFiltered.map(v => {
            const m = METHOD_LABELS[v.method] || METHOD_LABELS.unknown;
            const MIcon = m.icon;
            const banValue = v.whatsapp || v.email || '';
            const banType  = v.whatsapp ? 'phone' : 'email';
            return (
              <div
                key={v.id}
                className={`bg-card border rounded-xl p-4 transition-colors ${v.banned ? 'border-red-500/30 bg-red-500/5' : 'border-white/10'}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${v.banned ? 'bg-red-500/20' : 'bg-primary/10'}`}>
                      {v.banned ? <UserX size={16} className="text-red-400" /> : <UserCheck size={16} className="text-primary" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground">{v.name}</span>
                        <span className={`flex items-center gap-1 text-xs ${m.color}`}>
                          <MIcon size={11} /> {m.label}
                        </span>
                        {v.banned && <span className="text-xs text-red-400 font-medium">محظور</span>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {v.whatsapp && <span className="ml-2">📱 {v.whatsapp}</span>}
                        {v.email && <span>✉️ {v.email}</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        سجّل {timeAgo(v.createdAt)}
                      </p>
                    </div>
                  </div>
                  {!v.banned && banValue ? (
                    <button
                      onClick={() => openBanModal(banType, banValue, v.name)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors text-xs flex-shrink-0"
                    >
                      <Ban size={12} /> حظر
                    </button>
                  ) : v.banned ? (
                    <span className="text-xs text-red-400/60 flex-shrink-0">محظور</span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Store visitors ── */}
      {tab === 'store' && (
        <div className="space-y-3 overflow-y-auto pr-1" style={{ maxHeight: '72vh' }}>
          {loading ? (
            <p className="text-center text-muted-foreground py-8">جاري التحميل...</p>
          ) : storeFiltered.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">لا يوجد زوار للمتجر</p>
          ) : storeFiltered.map(v => (
            <div
              key={v.id}
              className={`bg-card border rounded-xl p-4 transition-colors ${v.banned ? 'border-red-500/30 bg-red-500/5' : 'border-white/10'}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm ${v.banned ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
                    {v.banned ? <UserX size={16} /> : (v.name !== '—' ? v.name.charAt(0) : '👤')}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">{v.name}</span>
                      <span className="text-xs font-mono text-muted-foreground" dir="ltr">{v.phone}</span>
                      {v.banned && <span className="text-xs text-red-400 font-medium">محظور</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      <span className="text-xs text-muted-foreground">
                        🏪 {v.visitCount} زيارة
                      </span>
                      {v.beeBalance > 0 && (
                        <span className="text-xs text-yellow-400">
                          🐝 {v.beeBalance} عملة
                        </span>
                      )}
                      {v.totalTimeSpent > 0 && (
                        <span className="text-xs text-muted-foreground">
                          ⏱ {Math.round(v.totalTimeSpent / 60)} د
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        آخر زيارة {timeAgo(v.lastVisitAt)}
                      </span>
                    </div>
                  </div>
                </div>
                {!v.banned ? (
                  <button
                    onClick={() => openBanModal('phone', v.phone, v.name)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors text-xs flex-shrink-0"
                  >
                    <Ban size={12} /> حظر
                  </button>
                ) : (
                  <span className="text-xs text-red-400/60 flex-shrink-0">محظور</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Bans list ── */}
      {tab === 'bans' && (
        <div className="space-y-3 overflow-y-auto pr-1" style={{ maxHeight: '72vh' }}>
          {bans.length === 0 ? (
            <div className="text-center py-12">
              <Shield size={40} className="mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">لا يوجد محظورون حالياً</p>
            </div>
          ) : bans.map(b => (
            <div key={b.id} className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                    <Ban size={16} className="text-red-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-mono text-red-300 break-all">
                        {b.value.length > 30 ? b.value.slice(0, 30) + '...' : b.value}
                      </span>
                      <span className="text-xs bg-red-500/20 text-red-300 px-2 py-0.5 rounded-full">
                        {b.type === 'visitor_id' ? 'متصفح' : b.type === 'ip' ? 'IP' : b.type === 'phone' ? 'هاتف' : 'إيميل'}
                      </span>
                    </div>
                    {b.reason && <p className="text-xs text-muted-foreground mt-0.5">{b.reason}</p>}
                    <p className="text-xs text-muted-foreground">حُظر {timeAgo(b.bannedAt)}</p>
                  </div>
                </div>
                <button
                  onClick={() => removeBan(b.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors text-xs flex-shrink-0"
                >
                  <ShieldOff size={12} /> رفع الحظر
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Reset confirmation modal ── */}
      {resetConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-white/10 rounded-2xl p-6 w-full max-w-sm" dir={isRtl ? 'rtl' : 'ltr'}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                <RotateCcw size={20} className="text-red-400" />
              </div>
              <div>
                <p className="font-semibold text-foreground">{ar ? 'مسح كل بيانات الزوار' : 'Clear All Visitor Data'}</p>
                <p className="text-xs text-muted-foreground">{ar ? 'سيتم حذف سجل الزيارات المجهولة بشكل نهائي' : 'Anonymous visit history will be permanently deleted'}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-5 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
              {ar ? '⚠️ هذا الإجراء لا يمكن التراجع عنه. بيانات المحافظات والزيارات ستُحذف.' : '⚠️ This action cannot be undone. Province and visit data will be deleted.'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={doReset}
                disabled={resetting}
                className="flex-1 py-2.5 rounded-xl bg-red-600/40 border border-red-500/40 text-red-300 hover:bg-red-600/60 transition-colors text-sm font-medium"
              >
                {resetting ? (ar ? 'جاري المسح...' : 'Clearing...') : (ar ? 'نعم، امسح الكل' : 'Yes, Clear All')}
              </button>
              <button
                onClick={() => setResetConfirm(false)}
                className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-muted-foreground hover:bg-white/10 transition-colors text-sm"
              >
                {ar ? 'إلغاء' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Ban confirmation modal ── */}
      {banModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-white/10 rounded-2xl p-6 w-full max-w-sm" dir={isRtl ? 'rtl' : 'ltr'}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                <AlertTriangle size={20} className="text-red-400" />
              </div>
              <div>
                <p className="font-semibold text-foreground">{ar ? 'تأكيد الحظر' : 'Confirm Ban'}</p>
                <p className="text-xs text-muted-foreground">{banModal.label}</p>
              </div>
            </div>
            <input
              value={banReason}
              onChange={e => setBanReason(e.target.value)}
              placeholder="سبب الحظر (اختياري)..."
              className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-red-500/50 mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={confirmBan}
                disabled={banning}
                className="flex-1 py-2.5 rounded-xl bg-red-600/40 border border-red-500/40 text-red-300 hover:bg-red-600/60 transition-colors text-sm font-medium"
              >
                {banning ? 'جاري الحظر...' : 'تأكيد الحظر'}
              </button>
              <button
                onClick={() => setBanModal(null)}
                className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-muted-foreground hover:bg-white/10 transition-colors text-sm"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
