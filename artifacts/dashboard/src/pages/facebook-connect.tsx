import { useState, useEffect } from 'react';
import { useTranslation } from '@/lib/i18n';
import { useGetSettings, useUpdateSettings } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle, Button, Input } from '@/components/ui-custom';
import {
  CheckCircle2, AlertCircle, Loader2, ExternalLink,
  Wifi, WifiOff, Facebook, Copy, Info, Zap, Globe, Eye, EyeOff, ArrowRight,
  Instagram, Link2, Link2Off, AtSign, RefreshCw,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

function copyText(text: string, set: (v: boolean) => void) {
  navigator.clipboard.writeText(text).then(() => { set(true); setTimeout(() => set(false), 2000); });
}
function genToken(n = 32) {
  const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: n }, () => c[Math.floor(Math.random() * c.length)]).join('');
}

type Tab = 'oauth' | 'manual';
type State = 'idle' | 'loading' | 'ok' | 'fail';

interface FBPage { id: string; name: string; token: string; category?: string; }

export default function FacebookConnect() {
  const { language } = useTranslation();
  const ar = language === 'ar';
  const qc = useQueryClient();
  const { data: settings, isLoading } = useGetSettings();

  /* ── Bot toggles ── */
  const [localFB,     setLocalFB]     = useState<boolean | null>(null);
  const [localIG,     setLocalIG]     = useState<boolean | null>(null);
  const fbEnabled     = localFB     !== null ? localFB     : (settings?.facebookBotEnabled     ?? false);
  const igEnabled     = localIG     !== null ? localIG     : (settings?.instagramBotEnabled    ?? false);

  const { mutate: updateSettings, isPending: toggPending } = useUpdateSettings({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: ['/api/settings'] }),
      onError: () => {
        setLocalFB(settings?.facebookBotEnabled ?? false);
        setLocalIG(settings?.instagramBotEnabled ?? false);
      },
    },
  });

  const handleToggleFB = () => {
    if (toggPending) return;
    const next = !fbEnabled; setLocalFB(next);
    updateSettings({ data: { facebookBotEnabled: next } });
  };
  const handleToggleIG = () => {
    if (toggPending) return;
    const next = !igEnabled; setLocalIG(next);
    updateSettings({ data: { instagramBotEnabled: next } });
  };
  const [tab, setTab] = useState<Tab>('oauth');

  /* OAuth tab */
  const [appId,     setAppId]     = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [showSec,   setShowSec]   = useState(false);
  const [oauthState, setOauthState] = useState<State>('idle');
  const [callbackUrl, setCallbackUrl] = useState('');

  /* Page chooser (after oauth with multiple pages) */
  const [pages,        setPages]        = useState<FBPage[]>([]);
  const [selectedPage, setSelectedPage] = useState<FBPage | null>(null);
  const [selectState,  setSelectState]  = useState<State>('idle');
  const [selectMsg,    setSelectMsg]    = useState('');

  /* Manual tab */
  const [pageId,      setPageId]      = useState('');
  const [pageToken,   setPageToken]   = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [webhookUrl,  setWebhookUrl]  = useState('');
  const [manualState, setManualState] = useState<State>('idle');
  const [manualMsg,   setManualMsg]   = useState('');
  const [manualOk,    setManualOk]    = useState(false);
  const [copWH, setCopWH] = useState(false);
  const [copVT, setCopVT] = useState(false);

  /* Instagram tab */
  const [igState,   setIgState]   = useState<State>('idle');
  const [igMsg,     setIgMsg]     = useState('');
  const [igResult,  setIgResult]  = useState<{ appOk?: boolean; pageOk?: boolean } | null>(null);
  const [igToken,   setIgToken]   = useState('');
  const [igTokenSaving, setIgTokenSaving] = useState(false);
  const [igTokenSaved,  setIgTokenSaved]  = useState(false);

  /* Success / error from OAuth callback redirect */
  const [oauthResult, setOauthResult] = useState<{
    type: 'success' | 'error' | 'choose'; pageName?: string; error?: string; pages?: FBPage[];
  } | null>(null);

  const isConnected = !!(settings?.metaAccessToken && settings?.facebookPageId);

  useEffect(() => {
    // Load server-side info
    fetch(`${BASE}/api/webhook-url`).then(r => r.json()).then(d => {
      if (d.webhookUrl) setWebhookUrl(d.webhookUrl);
    }).catch(() => {});
    setVerifyToken(genToken());

    // Pre-fill from settings
    if (settings?.metaAppId) setAppId(settings.metaAppId);
    if (settings?.facebookPageId) setPageId(settings.facebookPageId);
    if (settings?.metaAccessToken) setPageToken(settings.metaAccessToken);
    if (settings?.webhookVerifyToken) setVerifyToken(settings.webhookVerifyToken);
    if (settings?.instagramAccessToken) setIgToken(settings.instagramAccessToken);

    // Parse OAuth callback result from URL
    const params = new URLSearchParams(window.location.search);
    if (params.has('success')) {
      setOauthResult({ type: 'success', pageName: params.get('page') || '' });
      qc.invalidateQueries({ queryKey: ['/api/settings'] });
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.has('error')) {
      const errMsg = params.get('error') || 'unknown';
      setOauthResult({ type: 'error', error: friendlyError(errMsg, ar) });
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('step') === 'choose') {
      try {
        const ps: FBPage[] = JSON.parse(decodeURIComponent(params.get('pages') || '[]'));
        setPages(ps);
        setOauthResult({ type: 'choose', pages: ps });
      } catch (_) {}
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [settings]);

  // Compute callback URL after webhookUrl known
  useEffect(() => {
    if (webhookUrl) {
      try {
        const u = new URL(webhookUrl);
        setCallbackUrl(`${u.protocol}//${u.host}/api/facebook/oauth/callback`);
      } catch (_) {}
    }
  }, [webhookUrl]);

  function friendlyError(err: string, ar: boolean): string {
    if (err === 'no_credentials') return ar ? 'أدخل App ID و App Secret أولاً ثم اضغط التالي' : 'Enter App ID and App Secret first';
    if (err === 'no_pages') return ar ? 'لا توجد صفحات مرتبطة بهذا الحساب' : 'No pages found for this account';
    if (err === 'no_code') return ar ? 'تم إلغاء تسجيل الدخول' : 'Login was cancelled';
    if (err.includes('domain')) return ar ? 'النطاق غير مسجّل في تطبيق Meta. أضف النطاق كما هو موضح أدناه.' : 'Domain not registered in Meta App. Add it as shown below.';
    return err;
  }

  /* Start OAuth redirect */
  const handleOAuthStart = async () => {
    if (!appId.trim() || !appSecret.trim()) {
      setOauthState('fail');
      return;
    }
    setOauthState('loading');
    try {
      const r = await fetch(`${BASE}/api/facebook/oauth/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appId: appId.trim(), appSecret: appSecret.trim() }),
      });
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      // Open in new tab to avoid iframe embedding issues (Facebook blocks iframes)
      window.open(data.oauthUrl, '_blank', 'noopener,noreferrer');
    } catch (e: any) {
      setOauthState('fail');
    }
  };

  /* Select page after multiple-page OAuth */
  const handleSelectPage = async () => {
    if (!selectedPage) return;
    setSelectState('loading');
    try {
      const r = await fetch(`${BASE}/api/facebook/oauth/select-page`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId: selectedPage.id, pageAccessToken: selectedPage.token, pageName: selectedPage.name }),
      });
      const data = await r.json();
      if (!data.success) throw new Error(data.error || 'Failed');
      qc.invalidateQueries({ queryKey: ['/api/settings'] });
      setSelectMsg(ar ? `تم ربط صفحة "${selectedPage.name}" بنجاح!` : `"${selectedPage.name}" connected!`);
      setSelectState('ok');
      setOauthResult({ type: 'success', pageName: selectedPage.name });
      setPages([]);
    } catch (e: any) {
      setSelectState('fail');
      setSelectMsg(e.message);
    }
  };

  /* Manual connect */
  const handleManual = async () => {
    if (!pageId.trim() || !pageToken.trim()) {
      setManualMsg(ar ? 'أدخل Page ID و Page Token' : 'Enter Page ID and Page Token');
      setManualState('fail');
      return;
    }
    setManualState('loading'); setManualMsg('');
    try {
      const check = await fetch(`https://graph.facebook.com/v18.0/${pageId.trim()}?fields=id,name&access_token=${pageToken.trim()}`);
      const checkData = await check.json();
      if (checkData.error) throw new Error(checkData.error.message);
      const pageName = checkData.name || 'Facebook Page';

      const r = await fetch(`${BASE}/api/facebook/configure-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appId: '', appSecret: '', pageId: pageId.trim(), pageAccessToken: pageToken.trim(), pageName, verifyToken, webhookUrl }),
      });
      const data = await r.json();
      qc.invalidateQueries({ queryKey: ['/api/settings'] });
      setManualOk(!!data.pageSubscribed);
      setManualMsg(data.message || (ar ? 'تم الحفظ' : 'Saved'));
      setManualState('ok');
    } catch (e: any) {
      setManualState('fail');
      setManualMsg(e.message);
    }
  };

  /* Save Instagram access token */
  const handleIgTokenSave = async () => {
    if (!igToken.trim()) return;
    setIgTokenSaving(true);
    try {
      await fetch(`${BASE}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instagramAccessToken: igToken.trim() }),
      });
      setIgTokenSaved(true);
      setTimeout(() => setIgTokenSaved(false), 2500);
      qc.invalidateQueries({ queryKey: ['/api/settings'] });
    } catch (_) {}
    setIgTokenSaving(false);
  };

  /* Connect Instagram — one-click webhook subscription, no re-auth needed */
  const handleInstagramConnect = async () => {
    setIgState('loading');
    setIgMsg('');
    setIgResult(null);
    try {
      const r = await fetch(`${BASE}/api/instagram/subscribe-webhook`, { method: 'POST' });
      const data = await r.json();
      if (!data.success) {
        setIgState('fail');
        setIgMsg(ar ? 'فشل الربط. تأكد من إعدادات التطبيق.' : 'Connection failed. Check app settings.');
        return;
      }
      setIgResult({ appOk: data.appOk, pageOk: data.pageOk });
      setIgState('ok');
      qc.invalidateQueries({ queryKey: ['/api/settings'] });
    } catch (e: any) {
      setIgState('fail');
      setIgMsg(e.message || (ar ? 'خطأ في الاتصال' : 'Network error'));
    }
  };

  const handleInstagramDisconnect = async () => {
    setIgState('loading');
    try {
      await fetch(`${BASE}/api/instagram/disconnect`, { method: 'POST' });
      setIgResult(null);
      setIgState('idle');
      setIgMsg('');
      qc.invalidateQueries({ queryKey: ['/api/settings'] });
    } catch (e: any) {
      setIgState('idle');
    }
  };

  /* ── UI ── */
  if (isLoading) return <div className="flex justify-center p-16"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-24">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center">
              <Facebook className="w-5 h-5 text-blue-400" />
            </div>
            {ar ? 'ربط فيسبوك' : 'Facebook Connect'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {ar ? 'اربط صفحة Sonbola.baby لاستقبال الرسائل' : 'Connect Sonbola.baby page to receive messages'}
          </p>
        </div>
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border
          ${isConnected ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
          {isConnected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
          {isConnected ? (ar ? 'متصل' : 'Connected') : (ar ? 'غير متصل' : 'Not Connected')}
        </div>
      </div>

      {/* ── Bot Controls ── */}
      <div className="flex gap-3">
        {/* Facebook Bot Toggle */}
        <button
          onClick={handleToggleFB}
          disabled={toggPending}
          className={`flex-1 flex flex-col items-center gap-2 rounded-2xl border p-4 transition-all duration-300 focus:outline-none
            ${fbEnabled ? 'border-blue-500/40 bg-blue-500/10 shadow-lg shadow-blue-900/20' : 'border-white/10 bg-white/5 opacity-70'}
            ${toggPending ? 'cursor-not-allowed' : 'cursor-pointer hover:brightness-110'}`}
        >
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${fbEnabled ? 'bg-blue-500/20' : 'bg-white/5'}`}>
            <svg viewBox="0 0 24 24" className={`w-6 h-6 ${fbEnabled ? 'text-blue-400' : 'text-muted-foreground'}`} fill="currentColor">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground font-medium">فيسبوك</p>
            <p className={`text-sm font-bold ${fbEnabled ? 'text-blue-400' : 'text-muted-foreground'}`}>
              {fbEnabled ? '● شغّال' : '● موقوف'}
            </p>
          </div>
          <div className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-300 ${fbEnabled ? 'bg-blue-500' : 'bg-muted'}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-300 ${fbEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </div>
        </button>

        {/* Instagram Bot Toggle */}
        <button
          onClick={handleToggleIG}
          disabled={toggPending}
          className={`flex-1 flex flex-col items-center gap-2 rounded-2xl border p-4 transition-all duration-300 focus:outline-none
            ${igEnabled ? 'border-pink-500/40 bg-pink-500/10 shadow-lg shadow-pink-900/20' : 'border-white/10 bg-white/5 opacity-70'}
            ${toggPending ? 'cursor-not-allowed' : 'cursor-pointer hover:brightness-110'}`}
        >
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${igEnabled ? 'bg-pink-500/20' : 'bg-white/5'}`}>
            <Instagram className={`w-6 h-6 ${igEnabled ? 'text-pink-400' : 'text-muted-foreground'}`} />
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground font-medium">إنستغرام</p>
            <p className={`text-sm font-bold ${igEnabled ? 'text-pink-400' : 'text-muted-foreground'}`}>
              {igEnabled ? '● شغّال' : '● موقوف'}
            </p>
          </div>
          <div className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-300 ${igEnabled ? 'bg-pink-500' : 'bg-muted'}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-300 ${igEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </div>
        </button>

      </div>

      {/* ── Bot mode info note ── */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-muted-foreground space-y-1">
        <p className="font-semibold text-white/70">📌 ملاحظة — وضع بوت فيسبوك:</p>
        <p>
          <span className="text-blue-400 font-medium">شغّال</span> — بوت AI كامل مثل انستقرام (تعرّف على صور المنتجات، حجز، توصيل، وكل المحادثات)
        </p>
        <p>
          <span className="text-white/40 font-medium">موقوف</span> — يرسل خطوات التعريف بالمتجر ورابط الموقع فقط
        </p>
      </div>

      {/* ── OAuth Success Banner ── */}
      {oauthResult?.type === 'success' && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/40 rounded-2xl flex items-start gap-3">
          <CheckCircle2 className="w-6 h-6 text-emerald-400 flex-shrink-0" />
          <div>
            <p className="font-bold text-emerald-300">{ar ? '🎉 تم الربط بنجاح!' : '🎉 Connected successfully!'}</p>
            {oauthResult.pageName && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {ar ? `صفحة "${oauthResult.pageName}" مرتبطة والبوت جاهز لاستقبال الرسائل.` : `"${oauthResult.pageName}" is connected and bot is ready.`}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── OAuth Error Banner ── */}
      {oauthResult?.type === 'error' && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-300 text-sm">{ar ? 'حدث خطأ' : 'Error'}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{oauthResult.error}</p>
          </div>
        </div>
      )}

      {/* ── Page Chooser (multiple pages) ── */}
      {oauthResult?.type === 'choose' && pages.length > 0 && (
        <Card className="border-2 border-primary/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{ar ? 'اختر صفحتك' : 'Choose your page'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              {pages.map(p => (
                <button key={p.id} onClick={() => setSelectedPage(p)}
                  className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 text-left transition-all
                    ${selectedPage?.id === p.id ? 'border-primary bg-primary/10' : 'border-white/10 hover:border-white/30 bg-white/5'}`}>
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                    <Facebook className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{p.name}</p>
                    <p className="text-xs text-muted-foreground">ID: {p.id}</p>
                  </div>
                  {selectedPage?.id === p.id && <CheckCircle2 className="w-4 h-4 text-primary" />}
                </button>
              ))}
            </div>
            <Button onClick={handleSelectPage} disabled={!selectedPage || selectState === 'loading'} size="lg" className="w-full gap-2">
              {selectState === 'loading' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
              {ar ? 'ربط الصفحة المختارة' : 'Connect selected page'}
            </Button>
            {selectState === 'ok' && <p className="text-sm text-emerald-400 text-center">{selectMsg}</p>}
            {selectState === 'fail' && <p className="text-sm text-red-400 text-center">{selectMsg}</p>}
          </CardContent>
        </Card>
      )}

      {/* ── Tabs ── */}
      <div className="flex gap-1 p-1 bg-white/5 rounded-xl border border-white/10">
        {([['oauth', ar ? '🔑 تسجيل دخول فيسبوك' : '🔑 Facebook Login'], ['manual', ar ? '✍️ إدخال يدوي' : '✍️ Manual Entry']] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all
              ${tab === t ? 'bg-primary text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════
          OAUTH TAB — Mobile-friendly redirect
      ════════════════════════════════════ */}
      {tab === 'oauth' && (
        <>
          {/* ── PRIMARY: One-click reconnect (always visible when app exists) ── */}
          <Card className="border-2 border-blue-500/50 bg-blue-500/5">
            <CardContent className="pt-5 pb-5 space-y-4">
              <div className="text-center space-y-1">
                <p className="font-bold text-base">{ar ? 'ربط فيسبوك + إنستغرام' : 'Connect Facebook + Instagram'}</p>
                <p className="text-xs text-muted-foreground">{ar ? 'اضغط الزر وسجّل دخولك بفيسبوك — يعمل للاثنين تلقائياً' : 'Click the button and login with Facebook — works for both automatically'}</p>
              </div>
              <a
                href={`${BASE}/api/facebook/oauth/quick-start`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-3 w-full py-4 px-5 rounded-2xl bg-[#1877F2] hover:bg-[#166FE5] active:bg-[#1464D2] text-white font-bold text-base transition-colors shadow-lg"
              >
                <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="white"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                {ar ? 'تسجيل الدخول بـ Facebook' : 'Login with Facebook'}
              </a>
              <p className="text-[11px] text-center text-muted-foreground">
                {ar ? 'سيفتح صفحة فيسبوك — وافق على جميع الصلاحيات — ثم اختر صفحة Sonbola.baby' : 'Opens Facebook — accept all permissions — then choose Sonbola.baby page'}
              </p>
            </CardContent>
          </Card>

          {/* ── ADVANCED: Manual credentials (collapsed, for first-time setup only) ── */}
          <details className="group">
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground flex items-center gap-2 py-1 select-none">
              <span className="w-4 h-4 border border-white/20 rounded flex items-center justify-center text-[10px] group-open:rotate-90 transition-transform">▶</span>
              {ar ? 'إعداد أولي / تغيير بيانات التطبيق' : 'First-time setup / change app credentials'}
            </summary>
            <div className="mt-3 space-y-3">
              {/* Redirect URI */}
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-blue-300">{ar ? 'رابط إعادة التوجيه (أضفه في Meta App → Facebook Login → Valid OAuth Redirect URIs):' : 'Redirect URI (add to Meta App → Facebook Login → Valid OAuth Redirect URIs):'}</p>
                <div className="flex gap-2">
                  <div className="flex-1 px-3 py-2 rounded-lg bg-black/30 border border-blue-500/30 font-mono text-[10px] text-blue-300 break-all">{callbackUrl || '...'}</div>
                  <button onClick={() => copyText(callbackUrl, setCopWH)} className="px-2.5 py-1.5 rounded-lg border border-blue-500/30 text-blue-400 hover:bg-blue-500/10 flex-shrink-0">
                    {copWH ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {/* Credentials */}
              <div className="grid gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">App ID</label>
                  <Input value={appId} onChange={e => setAppId(e.target.value)} placeholder="123456789012345" className="font-mono text-base" inputMode="numeric" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">App Secret</label>
                  <div className="flex gap-2">
                    <Input type={showSec ? 'text' : 'password'} value={appSecret} onChange={e => setAppSecret(e.target.value)} placeholder="••••••••••••••••" className="font-mono flex-1 text-base" />
                    <Button type="button" variant="outline" size="icon" onClick={() => setShowSec(!showSec)} className="flex-shrink-0">
                      {showSec ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              </div>
              {oauthState === 'fail' && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <p className="text-sm text-red-300">{ar ? 'أدخل App ID و App Secret أولاً' : 'Enter App ID and App Secret first'}</p>
                </div>
              )}
              <Button type="button" onClick={handleOAuthStart} disabled={oauthState === 'loading' || !appId.trim() || !appSecret.trim()} size="lg" className="w-full gap-3 text-base h-12 rounded-2xl">
                {oauthState === 'loading' ? <Loader2 className="w-5 h-5 animate-spin" /> : <svg className="w-5 h-5" viewBox="0 0 24 24" fill="white"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>}
                {ar ? 'تسجيل الدخول بـ Facebook' : 'Login with Facebook'}
              </Button>
            </div>
          </details>
        </>
      )}

      {/* ════════════════════════════════════
          MANUAL TAB
      ════════════════════════════════════ */}
      {tab === 'manual' && (
        <>
          <Card className="border border-amber-500/20 bg-amber-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-amber-400 flex items-center gap-2">
                <Info className="w-4 h-4" />
                {ar ? 'كيفية الحصول على Page Token من الجوال' : 'How to get Page Token on mobile'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2 text-xs text-muted-foreground">
                {(ar ? [
                  'افتح متصفح الجوال واذهب إلى developers.facebook.com/tools/explorer',
                  'في يمين الصفحة (قد تحتاج Desktop Mode) → اختر Sonbola.baby',
                  'اضغط "Generate Access Token" → وافق على الصلاحيات',
                  'انسخ التوكن الظاهر في حقل Access Token',
                ] : [
                  'Open mobile browser → go to developers.facebook.com/tools/explorer',
                  'In right panel (may need Desktop Mode) → select Sonbola.baby',
                  'Click "Generate Access Token" → accept permissions',
                  'Copy the token shown in the Access Token field',
                ]).map((s, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center flex-shrink-0 text-[10px]">{i + 1}</span>
                    <span>{s}</span>
                  </div>
                ))}
              </div>
              <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-600/80 hover:bg-amber-500 text-white text-xs font-medium transition-colors w-full justify-center">
                <ExternalLink className="w-3.5 h-3.5" />
                {ar ? 'فتح Graph API Explorer' : 'Open Graph API Explorer'}
              </a>
            </CardContent>
          </Card>

          <Card className="border-2 border-primary/40">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{ar ? 'أدخل البيانات' : 'Enter credentials'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Page ID <span className="text-red-400">*</span></label>
                  <Input value={pageId} onChange={e => setPageId(e.target.value)} placeholder="127234377026063" className="font-mono text-base" inputMode="numeric" />
                  <p className="text-[11px] text-emerald-400">{ar ? '✓ صفحة Sonbola.baby: 127234377026063' : '✓ Sonbola.baby page: 127234377026063'}</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Page Access Token <span className="text-red-400">*</span></label>
                  <textarea value={pageToken} onChange={e => setPageToken(e.target.value)} placeholder="EAABs..." rows={3}
                    className="w-full px-3 py-2 rounded-xl border border-white/15 bg-white/5 text-sm font-mono resize-none focus:outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground/50 text-base" />
                </div>
              </div>

              <Button type="button" onClick={handleManual} disabled={manualState === 'loading' || !pageId.trim() || !pageToken.trim()} size="lg" className="w-full gap-2 h-14 text-base rounded-2xl">
                {manualState === 'loading' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
                {ar ? 'ربط الصفحة' : 'Connect Page'}
              </Button>

              {manualState === 'ok' && (
                <div className={`p-3 rounded-xl border flex items-start gap-2 ${manualOk ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-amber-500/10 border-amber-500/30'}`}>
                  {manualOk ? <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" /> : <Info className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />}
                  <p className={`text-sm ${manualOk ? 'text-emerald-300' : 'text-amber-300'}`}>{manualMsg}</p>
                </div>
              )}
              {manualState === 'fail' && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-300">{manualMsg}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Webhook info */}
          <Card className="border border-white/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Globe className="w-4 h-4 text-primary" />
                {ar ? 'Webhook (مطلوب لاستقبال الرسائل)' : 'Webhook (required to receive messages)'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">Callback URL</label>
                  <div className="flex gap-2">
                    <div className="flex-1 px-3 py-2 rounded-lg bg-black/30 border border-teal-500/30 font-mono text-[10px] text-teal-300 break-all">{webhookUrl || '...'}</div>
                    <button onClick={() => copyText(webhookUrl, setCopWH)} className="px-2.5 py-1.5 rounded-lg border border-teal-500/30 text-teal-400 hover:bg-teal-500/10 flex-shrink-0">
                      {copWH ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">Verify Token</label>
                  <div className="flex gap-2">
                    <div className="flex-1 px-3 py-2 rounded-lg bg-black/30 border border-amber-500/30 font-mono text-[10px] text-amber-300 break-all">{verifyToken}</div>
                    <button onClick={() => copyText(verifyToken, setCopVT)} className="px-2.5 py-1.5 rounded-lg border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 flex-shrink-0">
                      {copVT ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {ar
                  ? 'في تطبيق Meta → Messenger → Settings → Webhooks → أدخل الرابط والتوكن'
                  : 'In Meta App → Messenger → Settings → Webhooks → Enter URL and Token'}
              </p>
              <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
                <ExternalLink className="w-3.5 h-3.5" />Meta Developer Console
              </a>
            </CardContent>
          </Card>
        </>
      )}

      {/* Currently connected */}
      {isConnected && !oauthResult?.type && (
        <Card className="border border-emerald-500/20 bg-emerald-500/5">
          <CardContent className="py-3 flex items-center gap-3">
            <Wifi className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            <div>
              <p className="font-semibold text-emerald-300 text-sm">{ar ? 'الصفحة مرتبطة' : 'Page connected'}</p>
              <p className="text-xs text-muted-foreground">ID: {settings?.facebookPageId}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ════════════════════════════════════════════════════
          INSTAGRAM SECTION — always shown below Facebook
      ════════════════════════════════════════════════════ */}
      <div className="pt-2">
        {/* Section header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-pink-500/20 to-purple-600/20 border border-pink-500/30 flex items-center justify-center">
              <Instagram className="w-5 h-5 text-pink-400" />
            </div>
            {ar ? 'ربط إنستغرام' : 'Instagram Connect'}
          </h2>
          {/* Instagram status badge */}
          {(() => {
            const igConnected = settings?.instagramWebhookActive || igState === 'ok';
            return (
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border
                ${igConnected ? 'bg-pink-500/10 border-pink-500/30 text-pink-400' : 'bg-white/5 border-white/10 text-muted-foreground'}`}>
                {igConnected
                  ? <><Link2 className="w-3.5 h-3.5" />{ar ? 'متصل' : 'Connected'}</>
                  : <><Link2Off className="w-3.5 h-3.5" />{ar ? 'غير متصل' : 'Not connected'}</>}
              </div>
            );
          })()}
        </div>

        {/* Prerequisite: Facebook must be connected first */}
        {!isConnected && (
          <div className="p-4 rounded-2xl border border-amber-500/20 bg-amber-500/5 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-300">
              {ar ? 'يجب ربط صفحة فيسبوك أولاً قبل ربط الإنستغرام.' : 'Connect your Facebook page first before linking Instagram.'}
            </p>
          </div>
        )}

        {/* Main Instagram section */}
        {isConnected && (() => {
          const igConnected = settings?.instagramWebhookActive || igState === 'ok';
          return (
            <>
              {/* ── Connected card ── */}
              {igConnected && (
                <Card className="border border-pink-500/20 bg-gradient-to-br from-pink-500/5 to-purple-600/5 mb-4">
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center">
                          <Instagram className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <p className="font-bold text-pink-300">{ar ? '✓ إنستغرام مرتبط' : '✓ Instagram connected'}</p>
                          <p className="text-xs text-muted-foreground">@sonbola.baby</p>
                        </div>
                      </div>
                      <button
                        onClick={handleInstagramDisconnect}
                        disabled={igState === 'loading'}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs transition-colors"
                      >
                        {igState === 'loading' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2Off className="w-3.5 h-3.5" />}
                        {ar ? 'فصل' : 'Disconnect'}
                      </button>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div className={`p-2 rounded-xl border text-center ${igResult?.appOk !== false ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'}`}>
                        ✓ {ar ? 'Webhook App' : 'App Webhook'}
                      </div>
                      <div className="p-2 rounded-xl border text-center border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                        ✓ {ar ? 'الصفحة مشتركة' : 'Page Subscribed'}
                      </div>
                    </div>

                    <div className="mt-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                      <p className="text-xs text-emerald-300 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {ar ? 'البوت يستقبل ويرد على رسائل إنستغرام تلقائياً.' : 'Bot is auto-replying to Instagram DMs.'}
                      </p>
                    </div>

                    {/* Re-sync button */}
                    <button
                      onClick={handleInstagramConnect}
                      disabled={igState === 'loading'}
                      className="mt-3 w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-pink-500/20 text-pink-400 hover:bg-pink-500/5 text-xs transition-colors disabled:opacity-50"
                    >
                      {igState === 'loading' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      {ar ? 'إعادة مزامنة الاشتراك' : 'Re-sync subscription'}
                    </button>
                  </CardContent>
                </Card>
              )}

              {/* Instagram Access Token field */}
              <Card className="border border-pink-500/10 bg-white/3 mb-4">
                <CardContent className="py-4 space-y-2">
                  <p className="text-xs font-semibold text-pink-300">{ar ? 'توكن إنستغرام (Instagram Token)' : 'Instagram Access Token'}</p>
                  <p className="text-xs text-muted-foreground">
                    {ar
                      ? 'التوكن المولّد من Meta → Instagram → Generate Token. ضروري لإرسال الردود.'
                      : 'Token from Meta → Instagram → Generate Token. Required to send replies.'}
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={igToken}
                      onChange={e => setIgToken(e.target.value)}
                      placeholder={ar ? 'IGAALpy...' : 'IGAALpy...'}
                      className="flex-1 text-xs bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-pink-500/40"
                    />
                    <button
                      onClick={handleIgTokenSave}
                      disabled={igTokenSaving || !igToken.trim()}
                      className="px-3 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white text-xs font-semibold transition-colors disabled:opacity-50"
                    >
                      {igTokenSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : igTokenSaved ? '✓' : ar ? 'حفظ' : 'Save'}
                    </button>
                  </div>
                  {igTokenSaved && (
                    <p className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />{ar ? 'تم حفظ التوكن' : 'Token saved'}</p>
                  )}
                </CardContent>
              </Card>

              {/* ── Connect button (not connected) ── */}
              {!igConnected && (
                <div className="space-y-3">
                  <div className="p-4 rounded-2xl border border-white/10 bg-white/3 text-sm text-muted-foreground">
                    {ar
                      ? 'اضغط الزر أدناه لربط إنستغرام @sonbola.baby تلقائياً. لا تحتاج إعادة تسجيل الدخول.'
                      : 'Press the button below to connect Instagram @sonbola.baby automatically. No re-login needed.'}
                  </div>

                  <button
                    onClick={handleInstagramConnect}
                    disabled={igState === 'loading'}
                    className="w-full h-14 rounded-2xl font-bold text-base flex items-center justify-center gap-3 transition-all
                      bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white shadow-lg shadow-pink-500/20 disabled:opacity-50"
                  >
                    {igState === 'loading'
                      ? <><Loader2 className="w-5 h-5 animate-spin" />{ar ? 'جاري الربط...' : 'Connecting...'}</>
                      : igState === 'fail'
                        ? <><RefreshCw className="w-5 h-5" />{ar ? 'إعادة المحاولة' : 'Retry'}</>
                        : <><Instagram className="w-5 h-5" />{ar ? 'ربط إنستغرام' : 'Connect Instagram'}</>}
                  </button>

                  {igState === 'fail' && (
                    <p className="text-xs text-red-300 flex items-start gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      {igMsg}
                    </p>
                  )}
                </div>
              )}
            </>
          );
        })()}
      </div>

    </div>
  );
}
