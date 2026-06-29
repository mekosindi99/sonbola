import { useState, useEffect } from 'react';
import { useGetSettings, useUpdateSettings } from '@workspace/api-client-react';
import { useTranslation } from '@/lib/i18n';
import { useQueryClient } from '@tanstack/react-query';
import {
  Instagram, CheckCircle2, XCircle, Loader2, Save,
  RefreshCw, AlertTriangle, Info, Eye, EyeOff,
  Zap, MessageSquare, ShoppingBag, ToggleLeft, ToggleRight,
  Bot, Key, ExternalLink, Copy,
} from 'lucide-react';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

type TokenState = 'idle' | 'checking' | 'valid' | 'invalid';

function Toggle({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      onClick={() => !disabled && onChange(!value)}
      disabled={disabled}
      className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${value ? 'bg-pink-500' : 'bg-zinc-600'}`}
    >
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${value ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: React.ComponentType<any>; label: string; value: string | number; color: string }) {
  return (
    <div className={`rounded-2xl border p-5 bg-gradient-to-br ${color}`}>
      <div className="flex items-center gap-3 mb-2">
        <Icon className="w-5 h-5 text-white/70" />
        <span className="text-white/70 text-sm">{label}</span>
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
    </div>
  );
}

export default function InstagramBot() {
  const { language, isRtl } = useTranslation();
  const ar = language === 'ar';
  const qc = useQueryClient();
  const { data: settings, isLoading } = useGetSettings();

  const [localIG, setLocalIG] = useState<boolean | null>(null);
  const igEnabled = localIG !== null ? localIG : (settings?.instagramBotEnabled ?? false);

  const [tokenInput, setTokenInput] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [tokenState, setTokenState] = useState<TokenState>('idle');
  const [tokenMsg, setTokenMsg] = useState('');
  const [savingToken, setSavingToken] = useState(false);
  const [savedToken, setSavedToken] = useState(false);
  const [stats, setStats] = useState<{ igBookings: number; igChats: number } | null>(null);
  const [copied, setCopied] = useState(false);

  const { mutate: updateSettings, isPending } = useUpdateSettings({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: ['/api/settings'] }),
      onError: () => setLocalIG(settings?.instagramBotEnabled ?? false),
    },
  });

  const handleToggle = () => {
    if (isPending) return;
    const next = !igEnabled;
    setLocalIG(next);
    updateSettings({ data: { instagramBotEnabled: next } });
  };

  const checkToken = async (token: string) => {
    if (!token.trim()) return;
    setTokenState('checking');
    setTokenMsg('');
    try {
      const res = await fetch(`https://graph.facebook.com/me?access_token=${encodeURIComponent(token)}`);
      const data = await res.json();
      if (data.id && data.name) {
        setTokenState('valid');
        setTokenMsg(`✅ حساب صالح: ${data.name} (${data.id})`);
      } else if (data.error) {
        setTokenState('invalid');
        setTokenMsg(`❌ ${data.error.message}`);
      } else {
        setTokenState('invalid');
        setTokenMsg('❌ توكن غير صالح');
      }
    } catch {
      setTokenState('invalid');
      setTokenMsg('❌ فشل الاتصال');
    }
  };

  const saveToken = async () => {
    if (!tokenInput.trim()) return;
    setSavingToken(true);
    try {
      await fetch(`${BASE}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instagramAccessToken: tokenInput.trim() }),
      });
      setSavedToken(true);
      qc.invalidateQueries({ queryKey: ['/api/settings'] });
      setTimeout(() => setSavedToken(false), 3000);
      await checkToken(tokenInput.trim());
    } finally {
      setSavingToken(false);
    }
  };

  // Load stats from Instagram bookings
  useEffect(() => {
    fetch(`${BASE}/api/bookings?platform=instagram&limit=1`)
      .then(r => r.json())
      .then(d => {
        const count = Array.isArray(d) ? d.length : (d?.total ?? d?.bookings?.length ?? 0);
        setStats({ igBookings: d?.total ?? 0, igChats: 0 });
      })
      .catch(() => {});
  }, []);

  // Check current token on load
  useEffect(() => {
    if (settings?.instagramAccessToken) {
      checkToken(settings.instagramAccessToken);
    }
  }, [settings?.instagramAccessToken]);

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-pink-400" />
      </div>
    );
  }

  const hasToken = !!(settings?.instagramAccessToken);
  const currentTokenDisplay = hasToken
    ? `${settings!.instagramAccessToken!.slice(0, 12)}...${settings!.instagramAccessToken!.slice(-6)}`
    : '—';

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto" dir={isRtl ? 'rtl' : 'ltr'}>

      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-pink-500 via-rose-500 to-purple-600 flex items-center justify-center shadow-lg shadow-pink-500/30">
          <Instagram className="w-7 h-7 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">{ar ? 'بوت الانستقرام' : 'Instagram Bot'}</h1>
          <p className="text-white/50 text-sm">{ar ? 'إدارة بوت الحجز على Instagram Messenger' : 'Manage the booking bot on Instagram Messenger'}</p>
        </div>
      </div>

      {/* Enable Toggle */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bot className="w-5 h-5 text-pink-400" />
          <div>
            <p className="text-white font-semibold">{ar ? 'تفعيل البوت' : 'Enable Bot'}</p>
            <p className="text-white/50 text-sm">{ar ? 'تلقي ومعالجة رسائل Instagram تلقائياً' : 'Receive and process Instagram messages automatically'}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-sm font-medium ${igEnabled ? 'text-pink-400' : 'text-zinc-500'}`}>
            {igEnabled ? (ar ? 'مفعّل' : 'Active') : (ar ? 'موقوف' : 'Stopped')}
          </span>
          <Toggle value={igEnabled} onChange={handleToggle} disabled={isPending} />
        </div>
      </div>

      {/* Token Status */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
        <div className="flex items-center gap-3 mb-1">
          <Key className="w-5 h-5 text-pink-400" />
          <h2 className="text-white font-bold text-lg">توكن الانستقرام</h2>
        </div>

        {/* Current token status */}
        {hasToken && (
          <div className={`flex items-center gap-3 p-4 rounded-xl border ${
            tokenState === 'valid' ? 'bg-emerald-500/10 border-emerald-500/30' :
            tokenState === 'invalid' ? 'bg-red-500/10 border-red-500/30' :
            tokenState === 'checking' ? 'bg-blue-500/10 border-blue-500/30' :
            'bg-white/5 border-white/10'
          }`}>
            {tokenState === 'checking' && <Loader2 className="w-4 h-4 text-blue-400 animate-spin shrink-0" />}
            {tokenState === 'valid' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
            {tokenState === 'invalid' && <XCircle className="w-4 h-4 text-red-400 shrink-0" />}
            {tokenState === 'idle' && <Info className="w-4 h-4 text-white/40 shrink-0" />}
            <div className="flex-1 min-w-0">
              <div className="text-white/60 text-xs mb-1">التوكن الحالي</div>
              <div className="text-white/80 text-sm font-mono">{currentTokenDisplay}</div>
              {tokenMsg && <div className={`text-sm mt-1 ${tokenState === 'valid' ? 'text-emerald-400' : 'text-red-400'}`}>{tokenMsg}</div>}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => copyText(settings!.instagramAccessToken!)}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/60 transition-colors"
                title="نسخ التوكن"
              >
                {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
              <button
                onClick={() => checkToken(settings!.instagramAccessToken!)}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/60 transition-colors"
                title="إعادة التحقق"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {!hasToken && (
          <div className="flex items-center gap-3 p-4 rounded-xl border bg-amber-500/10 border-amber-500/30">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <p className="text-amber-300 text-sm">لم يتم إضافة توكن الانستقرام بعد. أدخله أدناه لتفعيل البوت.</p>
          </div>
        )}

        {/* Token input */}
        <div className="space-y-3">
          <label className="text-white/70 text-sm font-medium">تحديث التوكن</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showToken ? 'text' : 'password'}
                value={tokenInput}
                onChange={e => setTokenInput(e.target.value)}
                placeholder="EAAQPOSMuBZC..."
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 text-sm font-mono focus:outline-none focus:border-pink-500/50 pr-10"
                dir="ltr"
              />
              <button
                onClick={() => setShowToken(v => !v)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
              >
                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <button
              onClick={saveToken}
              disabled={!tokenInput.trim() || savingToken}
              className="px-4 py-3 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 text-white font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
            >
              {savingToken ? <Loader2 className="w-4 h-4 animate-spin" /> : savedToken ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              {savedToken ? 'تم الحفظ' : 'حفظ'}
            </button>
          </div>
        </div>
      </div>

      {/* How to get token */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
        <div className="flex items-center gap-3 mb-1">
          <Info className="w-5 h-5 text-blue-400" />
          <h2 className="text-white font-bold text-lg">كيفية الحصول على التوكن</h2>
        </div>
        <ol className="space-y-3 text-white/70 text-sm" dir="rtl">
          <li className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-pink-500/20 text-pink-400 text-xs font-bold flex items-center justify-center shrink-0">1</span>
            <span>افتح <strong className="text-white">Meta for Developers</strong> واختر تطبيقك</span>
          </li>
          <li className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-pink-500/20 text-pink-400 text-xs font-bold flex items-center justify-center shrink-0">2</span>
            <span>اذهب إلى <strong className="text-white">Instagram → Instagram Basic Display</strong> أو <strong className="text-white">Instagram API</strong></span>
          </li>
          <li className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-pink-500/20 text-pink-400 text-xs font-bold flex items-center justify-center shrink-0">3</span>
            <span>اضغط <strong className="text-white">Generate Token</strong> لحساب الانستقرام المرتبط بالصفحة</span>
          </li>
          <li className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-pink-500/20 text-pink-400 text-xs font-bold flex items-center justify-center shrink-0">4</span>
            <span>انسخ التوكن والصقه أعلاه ثم اضغط <strong className="text-white">حفظ</strong></span>
          </li>
        </ol>
        <a
          href="https://developers.facebook.com/tools/explorer/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm text-pink-400 hover:text-pink-300 transition-colors mt-2"
        >
          <ExternalLink className="w-4 h-4" />
          فتح Graph API Explorer
        </a>
      </div>

      {/* Bot behavior info */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
        <div className="flex items-center gap-3 mb-1">
          <Zap className="w-5 h-5 text-amber-400" />
          <h2 className="text-white font-bold text-lg">سلوك البوت على انستقرام</h2>
        </div>
        <div className="space-y-3 text-sm">
          <div className="flex items-start gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-white font-medium">نفس تدفق الفيسبوك</p>
              <p className="text-white/60">موسم → جنس → عمر → منتجات → كمية → محافظة → هاتف → عنوان</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
            <MessageSquare className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-white font-medium">طريقة العرض</p>
              <p className="text-white/60">بدل الكروسل يتم إرسال صور المنتجات مع أزرار سريعة للحجز (Quick Replies)</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-xl bg-purple-500/10 border border-purple-500/20">
            <ShoppingBag className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-white font-medium">الحجوزات</p>
              <p className="text-white/60">تظهر في قسم "حجوزات انستقرام" مع نفس إمكانيات الإدارة</p>
            </div>
          </div>
        </div>
      </div>

      {/* Account info */}
      {(settings?.instagramAccountId) && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-3">
          <div className="flex items-center gap-3 mb-1">
            <Instagram className="w-5 h-5 text-pink-400" />
            <h2 className="text-white font-bold text-lg">معلومات الحساب</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 rounded-xl bg-white/5">
              <div className="text-white/50 text-xs mb-1">Instagram Account ID</div>
              <div className="text-white text-sm font-mono">{settings.instagramAccountId}</div>
            </div>
            <div className="p-3 rounded-xl bg-white/5">
              <div className="text-white/50 text-xs mb-1">حالة Webhook</div>
              <div className={`text-sm font-medium flex items-center gap-1.5 ${settings?.instagramWebhookActive ? 'text-emerald-400' : 'text-zinc-500'}`}>
                {settings?.instagramWebhookActive
                  ? <><CheckCircle2 className="w-4 h-4" /> مفعّل</>
                  : <><XCircle className="w-4 h-4" /> غير مفعّل</>}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
