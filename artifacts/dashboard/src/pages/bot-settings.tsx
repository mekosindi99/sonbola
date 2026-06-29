import { useEffect, useState, useCallback } from 'react';
import {
  Bot, Save, Settings2, ToggleLeft, ToggleRight, Ban,
  Activity, BarChart3, BookOpenText, Trash2, AlertTriangle,
  CheckCircle2, XCircle, Loader2, RefreshCw, Plus, X,
  Shield, Wrench, ExternalLink,
  Truck, Sparkles,
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

const ORDINALS = ['أولاً','ثانياً','ثالثاً','رابعاً','خامساً','سادساً','سابعاً','ثامناً','تاسعاً','عاشراً'];

// Delivery groups — fixed structure
const DELIVERY_GROUPS = [
  {
    key: 'iqliym',
    label: 'محافظات الإقليم',
    provinces: ['كركوك','أربيل','دهوك','حلبجة','السليمانية'],
    defaultFee: 5000,
    defaultDays: '2-3 يوم',
    color: 'emerald',
  },
  {
    key: 'zakho',
    label: 'زاخو',
    provinces: ['زاخو'],
    defaultFee: 3000,
    defaultDays: '1-2 يوم',
    color: 'sky',
  },
  {
    key: 'rest',
    label: 'باقي المحافظات',
    provinces: ['بغداد','البصرة','نينوى','الأنبار','بابل','ذي قار','واسط','النجف','كربلاء','صلاح الدين','ميسان','المثنى','القادسية','ديالى'],
    defaultFee: 6000,
    defaultDays: '2-3 يوم',
    color: 'violet',
  },
] as const;

interface WelcomeStep {
  text: string;
  imageUrl?: string | null;
}

interface Settings {
  maintenanceMode?: boolean;
  botEnabled?: boolean;
  facebookBotEnabled?: boolean;
  instagramBotEnabled?: boolean;
  blacklistKeywords?: string;
  slangMapper?: string;
  welcomeMessages?: string;
}

function useSaveField() {
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const save = useCallback(async (patch: Record<string, unknown>, key: string) => {
    setSaving(key);
    try {
      await fetch(`${BASE}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      setSaved(key);
      setTimeout(() => setSaved(null), 2000);
    } catch {
    } finally {
      setSaving(null);
    }
  }, []);

  return { saving, saved, save };
}

function Toggle({
  value, onChange, colorOn = 'bg-emerald-500', colorOff = 'bg-zinc-600',
}: { value: boolean; onChange: (v: boolean) => void; colorOn?: string; colorOff?: string }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${value ? colorOn : colorOff}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${value ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

function SectionCard({ icon: Icon, title, subtitle, children, color = 'violet' }: {
  icon: React.ComponentType<any>;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  color?: string;
}) {
  const colors: Record<string, string> = {
    violet: 'from-violet-500/20 to-purple-500/10 border-violet-500/30',
    blue: 'from-blue-500/20 to-cyan-500/10 border-blue-500/30',
    cyan: 'from-cyan-500/20 to-teal-500/10 border-cyan-500/30',
    green: 'from-emerald-500/20 to-teal-500/10 border-emerald-500/30',
    orange: 'from-orange-500/20 to-amber-500/10 border-orange-500/30',
    red: 'from-red-500/20 to-rose-500/10 border-red-500/30',
    slate: 'from-slate-700/40 to-slate-800/20 border-slate-600/30',
  };
  return (
    <div className={`rounded-2xl border bg-gradient-to-br p-6 ${colors[color] || colors.violet}`}>
      <div className="flex items-start gap-3 mb-5">
        <div className={`p-2 rounded-xl bg-white/10`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-white font-bold text-lg leading-tight">{title}</h2>
          {subtitle && <p className="text-white/50 text-sm mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

export default function BotSettings() {
  const { language, isRtl } = useTranslation();
  const ar = language === 'ar';
  const [settings, setSettings] = useState<Settings>({});
  const [loading, setLoading] = useState(true);
  const { saving, saved, save } = useSaveField();

  const [blacklistInput, setBlacklistInput] = useState('');
  const [blacklist, setBlacklist] = useState<string[]>([]);
  const [slangPairs, setSlangPairs] = useState<Array<{ slang: string; meaning: string }>>([]);
  const [slangInput, setSlangInput] = useState({ slang: '', meaning: '' });
  const [aiImageModel, setAiImageModel] = useState('gpt-4o');
  const [aiModelSaving, setAiModelSaving] = useState(false);
  const [aiModelSaved, setAiModelSaved] = useState(false);
  const [groupFees, setGroupFees] = useState<Record<string, string>>({ iqliym: '5000', zakho: '3000', rest: '6000' });
  const [groupDays, setGroupDays] = useState<Record<string, string>>({ iqliym: '2-3 يوم', zakho: '1-2 يوم', rest: '2-3 يوم' });
  const [groupProvinces, setGroupProvinces] = useState<Record<string, string[]>>({
    iqliym: ['كركوك','أربيل','دهوك','حلبجة','السليمانية'],
    zakho: ['زاخو'],
    rest: ['بغداد','البصرة','نينوى','الأنبار','بابل','ذي قار','واسط','النجف','كربلاء','صلاح الدين','ميسان','المثنى','القادسية','ديالى'],
  });
  const [addProvInput, setAddProvInput] = useState<Record<string, string>>({ iqliym: '', zakho: '', rest: '' });
  const [feesSaving, setFeesSaving] = useState(false);
  const [feesSaved, setFeesSaved] = useState(false);
  const [activityLog, setActivityLog] = useState<any[]>([]);
  const [apiStatus, setApiStatus] = useState<'checking' | 'ok' | 'error'>('checking');
  const [usageStats, setUsageStats] = useState<any>(null);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const [platformStats, setPlatformStats] = useState<{ fb: number; fbPending: number; ig: number; igPending: number } | null>(null);

  // Welcome flow state
  const DEFAULT_WELCOME_STEPS: WelcomeStep[] = [
    {
      text: 'اهلا و سهلا بيكم بصفحتنا صفحة ملابس اطفال 👗\nعيوني حتي تشوفين كل الاسعار و الاعمار\naحن سوينالكم موقع فيها كل المنشورات\nهذه خطوات الدخول الي الموقع\n\nاولا : الموقع ⬇️\nhttps://sonbola.shop/',
      imageUrl: null,
    },
    {
      text: 'ثانيا ⬇️\nرح تضيف الموديل اللي تعجبج الي السلة 🛒',
      imageUrl: null,
    },
    {
      text: 'ثالثا ⬇️\nانقر علي ايقونة السلة 🛒\nرح تشوف قائمة المعلومات المطلوبة لتكملة الحجز 📝',
      imageUrl: null,
    },
    {
      text: 'رابعا ⬇️\nمعاينة الحجز قبل الارسال ✅\nبعد المراجعة انقر ارسال وراح نتواصل معج بأقرب وقت 💚\n\nعيني لو سمحتِ احجزي من الموقع\nكل شيء مبين و مكتوب و واضح جدا 😊',
      imageUrl: null,
    },
    {
      text: 'عيني الحجز رح يروح مباشرة لموظف المخزن 🏪\nرح يتواصل يواكم علي واتساب 📱',
      imageUrl: null,
    },
  ];
  const [welcomeSteps, setWelcomeSteps] = useState<WelcomeStep[]>(DEFAULT_WELCOME_STEPS);
  const [welcomeSaving, setWelcomeSaving] = useState(false);
  const [welcomeSaved, setWelcomeSaved] = useState(false);
  const [uploadingStep, setUploadingStep] = useState<number | null>(null);


  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/settings`);
      const d: Settings = await r.json();
      setSettings(d);
      setBlacklist(d.blacklistKeywords ? JSON.parse(d.blacklistKeywords) : []);
      setSlangPairs(d.slangMapper ? JSON.parse(d.slangMapper) : []);
      if ((d as any).aiModelImage) setAiImageModel((d as any).aiModelImage);
      if ((d as any).welcomeMessages) {
        try {
          const parsed = JSON.parse((d as any).welcomeMessages);
          if (Array.isArray(parsed) && parsed.length > 0) setWelcomeSteps(parsed);
        } catch {}
      }
      try {
        const stored: Record<string, any> = (d as any).deliveryFees ? JSON.parse((d as any).deliveryFees) : {};
        const newFees: Record<string, string> = {};
        const newDays: Record<string, string> = {};
        const newProvs: Record<string, string[]> = { iqliym: [], zakho: [], rest: [] };
        for (const g of DELIVERY_GROUPS) {
          newFees[g.key] = String(stored[`__fee_${g.key}`] ?? g.defaultFee);
          newDays[g.key] = stored[`__days_${g.key}`] ?? g.defaultDays;
        }
        // Reconstruct per-group province lists from stored data
        const storedProvs = Object.keys(stored).filter(k => !k.startsWith('__'));
        if (storedProvs.length > 0) {
          // Assign each province to a group based on __group_ metadata or fee proximity
          for (const prov of storedProvs) {
            const grp = stored[`__group_${prov}`];
            if (grp && newProvs[grp]) {
              newProvs[grp].push(prov);
            } else {
              // Fallback: assign to group whose fee is closest
              const fee = Number(stored[prov]);
              const iqFee = Number(newFees.iqliym || 5000);
              const zkFee = Number(newFees.zakho || 3000);
              const rsFee = Number(newFees.rest || 6000);
              const dists = { iqliym: Math.abs(fee - iqFee), zakho: Math.abs(fee - zkFee), rest: Math.abs(fee - rsFee) };
              const best = Object.entries(dists).sort((a, b) => a[1] - b[1])[0][0];
              newProvs[best].push(prov);
            }
          }
        } else {
          // No stored data — use defaults
          for (const g of DELIVERY_GROUPS) newProvs[g.key] = [...g.provinces];
        }
        // Ensure no group is empty — use defaults if empty
        for (const g of DELIVERY_GROUPS) {
          if (newProvs[g.key].length === 0) newProvs[g.key] = [...g.provinces];
        }
        // Re-read fees using representative province (or __fee_ key)
        for (const g of DELIVERY_GROUPS) {
          if (!stored[`__fee_${g.key}`]) {
            const rep = newProvs[g.key][0];
            if (rep && stored[rep] !== undefined) newFees[g.key] = String(stored[rep]);
          }
        }
        setGroupFees(newFees);
        setGroupDays(newDays);
        setGroupProvinces(newProvs);
      } catch {
        setGroupFees({ iqliym: '5000', zakho: '3000', rest: '6000' });
        setGroupDays({ iqliym: '2-3 يوم', zakho: '1-2 يوم', rest: '2-3 يوم' });
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  const loadActivity = useCallback(async () => {
    try {
      const r = await fetch(`${BASE}/api/conversations?limit=8`);
      const d = await r.json();
      setActivityLog(Array.isArray(d?.conversations) ? d.conversations : []);
    } catch {
      setActivityLog([]);
    }
    try {
      await fetch(`${BASE}/api/settings`);
      setApiStatus('ok');
    } catch {
      setApiStatus('error');
    }
  }, []);

  const loadUsage = useCallback(async () => {
    try {
      const r = await fetch(`${BASE}/api/usage/summary`);
      if (r.ok) setUsageStats(await r.json());
    } catch {}
  }, []);

  const loadPlatformStats = useCallback(async () => {
    try {
      const r = await fetch(`${BASE}/api/bookings?source=facebook`);
      if (!r.ok) return;
      const data: Array<{ platform: string; status: string }> = await r.json();
      const fb = data.filter(b => b.platform === 'facebook');
      const ig = data.filter(b => b.platform === 'instagram');
      setPlatformStats({
        fb: fb.length,
        fbPending: fb.filter(b => b.status === 'pending').length,
        ig: ig.length,
        igPending: ig.filter(b => b.status === 'pending').length,
      });
    } catch {}
  }, []);

  useEffect(() => {
    loadSettings();
    loadActivity();
    loadUsage();
    loadPlatformStats();
    const iv = setInterval(loadActivity, 15000);
    return () => clearInterval(iv);
  }, [loadSettings, loadActivity, loadUsage, loadPlatformStats]);

  const patchSetting = async (key: string, value: unknown) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    await save({ [key]: value }, key);
  };

  const addBlacklistWord = () => {
    const w = blacklistInput.trim();
    if (!w || blacklist.includes(w)) return;
    const updated = [...blacklist, w];
    setBlacklist(updated);
    setBlacklistInput('');
    save({ blacklistKeywords: JSON.stringify(updated) }, 'blacklist');
  };
  const removeBlacklistWord = (w: string) => {
    const updated = blacklist.filter(x => x !== w);
    setBlacklist(updated);
    save({ blacklistKeywords: JSON.stringify(updated) }, 'blacklist');
  };

  const addSlangPair = () => {
    if (!slangInput.slang.trim() || !slangInput.meaning.trim()) return;
    const updated = [...slangPairs, { slang: slangInput.slang.trim(), meaning: slangInput.meaning.trim() }];
    setSlangPairs(updated);
    setSlangInput({ slang: '', meaning: '' });
    save({ slangMapper: JSON.stringify(updated) }, 'slang');
  };
  const removeSlangPair = (i: number) => {
    const updated = slangPairs.filter((_, idx) => idx !== i);
    setSlangPairs(updated);
    save({ slangMapper: JSON.stringify(updated) }, 'slang');
  };

  // ── Welcome flow helpers ──────────────────────────────────────────────────
  const updateWelcomeStep = (index: number, field: keyof WelcomeStep, value: string | null) => {
    setWelcomeSteps(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
  };

  const addWelcomeStep = () => {
    setWelcomeSteps(prev => [...prev, { text: '', imageUrl: null }]);
  };

  const removeWelcomeStep = (index: number) => {
    setWelcomeSteps(prev => prev.filter((_, i) => i !== index));
  };

  const saveWelcomeFlow = async () => {
    setWelcomeSaving(true);
    try {
      await fetch(`${BASE}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          welcomeMessages: JSON.stringify(welcomeSteps),
        }),
      });
      setWelcomeSaved(true);
      setTimeout(() => setWelcomeSaved(false), 3000);
    } catch {}
    finally { setWelcomeSaving(false); }
  };

  const uploadWelcomeImage = async (index: number, file: File) => {
    setUploadingStep(index);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch(`${BASE}/api/settings/upload-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64 }),
      });
      if (res.ok) {
        const data = await res.json();
        // Update state AND auto-save immediately so the imageUrl is never lost
        const updatedSteps = welcomeSteps.map((s, i) =>
          i === index ? { ...s, imageUrl: data.url } : s
        );
        setWelcomeSteps(updatedSteps);
        // Auto-save with the updated steps
        await fetch(`${BASE}/api/settings`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            welcomeMessages: JSON.stringify(updatedSteps),
          }),
        });
        setWelcomeSaved(true);
        setTimeout(() => setWelcomeSaved(false), 2000);
      }
    } catch {}
    finally { setUploadingStep(null); }
  };

  const AI_MODELS = [
    { value: 'gpt-4o',      label: 'GPT-4o',      desc: 'قوي — للصور والمهام المعقدة' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini', desc: 'سريع واقتصادي — للردود النصية' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo', desc: 'متوازن بين الدقة والسرعة' },
  ];

  const saveAiModels = async () => {
    setAiModelSaving(true);
    try {
      await fetch(`${BASE}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiModelImage: aiImageModel }),
      });
      setAiModelSaved(true);
      setTimeout(() => setAiModelSaved(false), 3000);
    } catch {}
    setAiModelSaving(false);
  };

  const addProvince = (groupKey: string) => {
    const name = (addProvInput[groupKey] || '').trim();
    if (!name) return;
    // Check not already in any group
    const allProvs = Object.values(groupProvinces).flat();
    if (allProvs.includes(name)) return;
    setGroupProvinces(prev => ({ ...prev, [groupKey]: [...(prev[groupKey] || []), name] }));
    setAddProvInput(prev => ({ ...prev, [groupKey]: '' }));
  };

  const removeProvince = (groupKey: string, prov: string) => {
    setGroupProvinces(prev => ({ ...prev, [groupKey]: (prev[groupKey] || []).filter(p => p !== prov) }));
  };

  const saveDeliveryFees = async () => {
    setFeesSaving(true);
    // Build feesObj: per-province fees + __days_ + __fee_ + __group_ metadata
    const feesObj: Record<string, any> = {};
    for (const g of DELIVERY_GROUPS) {
      const fee = Number(groupFees[g.key]);
      const provinces = groupProvinces[g.key] || [];
      if (!isNaN(fee) && fee > 0) {
        for (const p of provinces) {
          feesObj[p] = fee;
          feesObj[`__group_${p}`] = g.key; // store group membership
        }
      }
      feesObj[`__days_${g.key}`] = groupDays[g.key] || g.defaultDays;
      feesObj[`__fee_${g.key}`] = fee || g.defaultFee;
    }
    try {
      await fetch(`${BASE}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deliveryFees: JSON.stringify(feesObj) }),
      });
      setFeesSaved(true);
      setTimeout(() => setFeesSaved(false), 3000);
    } catch {}
    setFeesSaving(false);
  };

  const handleFactoryReset = async () => {
    setResetting(true);
    try {
      await fetch(`${BASE}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          maintenanceMode: false,
          blacklistKeywords: null,
          slangMapper: null,
          botEnabled: false,
          facebookBotEnabled: false,
          instagramBotEnabled: false,
        }),
      });
      setBlacklist([]);
      setSlangPairs([]);
      setSettings(prev => ({
        ...prev,
        maintenanceMode: false,
        botEnabled: false,
        facebookBotEnabled: false,
        instagramBotEnabled: false,
        blacklistKeywords: undefined,
        slangMapper: undefined,
      }));
      setResetConfirm(false);
      setResetDone(true);
      setTimeout(() => setResetDone(false), 4000);
    } finally {
      setResetting(false);
    }
  };

  const SaveBtn = ({ field, onClick }: { field: string; onClick: () => void }) => (
    <button
      onClick={onClick}
      disabled={saving === field}
      className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
    >
      {saving === field ? <Loader2 className="w-4 h-4 animate-spin" /> : saved === field ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
      {saved === field ? 'تم الحفظ' : 'حفظ'}
    </button>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 max-w-4xl mx-auto" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="flex items-center gap-3 mb-2">
        <div className="p-3 rounded-2xl bg-violet-600/20 border border-violet-500/30">
          <Settings2 className="w-7 h-7 text-violet-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">{ar ? 'اعدادات البوت' : 'Bot Settings'}</h1>
          <p className="text-white/50 text-sm">{ar ? 'التحكم الكامل في ذاكرة البوت وقراراته وأمانه' : 'Full control over bot memory, decisions, and security'}</p>
        </div>
      </div>

      {/* 1. Decision Logic Toggles */}
      <SectionCard icon={ToggleRight} title="مركز اتخاذ القرار" subtitle="أزرار التحكم الفورية في سلوك البوت" color="green">
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3 border border-white/10">
            <div className="flex items-center gap-3">
              <Shield className="w-4 h-4 text-blue-400" />
              <div>
                <p className="text-white text-sm font-medium">البوت العام</p>
                <p className="text-white/40 text-xs">تفعيل أو تعطيل البوت على جميع المنصات</p>
              </div>
            </div>
            <Toggle
              value={!!(settings as any).botEnabled}
              onChange={v => patchSetting('botEnabled', v)}
              colorOn="bg-blue-500"
            />
          </div>
        </div>
      </SectionCard>

      {/* Platform Bookings */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Facebook Bookings */}
        <a
          href={`${BASE}/facebook-bookings`}
          className="group relative overflow-hidden rounded-2xl border border-[#1877f2]/30 bg-gradient-to-br from-[#1877f2]/10 to-[#1877f2]/5 hover:from-[#1877f2]/20 hover:to-[#1877f2]/10 transition-all duration-200 p-5 flex flex-col gap-3"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#1877f2]/20 border border-[#1877f2]/30 flex items-center justify-center flex-shrink-0">
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="#1877f2">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
              </div>
              <div>
                <p className="text-[#6ab3ff] font-semibold text-sm">حجوزات الفيسبوك</p>
                <p className="text-white/35 text-xs">Facebook Messenger</p>
              </div>
            </div>
            <ExternalLink className="w-3.5 h-3.5 text-white/20 group-hover:text-[#6ab3ff]/60 transition-colors flex-shrink-0" />
          </div>
          <div className="flex items-end gap-4">
            <div>
              <p className="text-3xl font-bold text-white tabular-nums">
                {platformStats ? platformStats.fb.toLocaleString('en') : <span className="text-white/20 text-2xl">…</span>}
              </p>
              <p className="text-white/40 text-xs mt-0.5">إجمالي الحجوزات</p>
            </div>
            {platformStats && platformStats.fbPending > 0 && (
              <div className="mb-1">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/25 text-amber-300 text-xs font-medium">
                  {platformStats.fbPending} بانتظار
                </span>
              </div>
            )}
          </div>
        </a>

        {/* Instagram Bookings */}
        <a
          href={`${BASE}/instagram-bookings`}
          className="group relative overflow-hidden rounded-2xl border border-[#e1306c]/30 bg-gradient-to-br from-[#e1306c]/10 to-[#833ab4]/5 hover:from-[#e1306c]/20 hover:to-[#833ab4]/10 transition-all duration-200 p-5 flex flex-col gap-3"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#e1306c]/20 border border-[#e1306c]/30 flex items-center justify-center flex-shrink-0">
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="url(#igGrad)">
                  <defs>
                    <linearGradient id="igGrad" x1="0%" y1="100%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#f09433"/>
                      <stop offset="25%" stopColor="#e6683c"/>
                      <stop offset="50%" stopColor="#dc2743"/>
                      <stop offset="75%" stopColor="#cc2366"/>
                      <stop offset="100%" stopColor="#bc1888"/>
                    </linearGradient>
                  </defs>
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
                </svg>
              </div>
              <div>
                <p className="text-pink-300 font-semibold text-sm">حجوزات الانستقرام</p>
                <p className="text-white/35 text-xs">Instagram Direct</p>
              </div>
            </div>
            <ExternalLink className="w-3.5 h-3.5 text-white/20 group-hover:text-pink-400/60 transition-colors flex-shrink-0" />
          </div>
          <div className="flex items-end gap-4">
            <div>
              <p className="text-3xl font-bold text-white tabular-nums">
                {platformStats ? platformStats.ig.toLocaleString('en') : <span className="text-white/20 text-2xl">…</span>}
              </p>
              <p className="text-white/40 text-xs mt-0.5">إجمالي الحجوزات</p>
            </div>
            {platformStats && platformStats.igPending > 0 && (
              <div className="mb-1">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/25 text-amber-300 text-xs font-medium">
                  {platformStats.igPending} بانتظار
                </span>
              </div>
            )}
          </div>
        </a>
      </div>

      {/* 4. Delivery Fees */}
      <SectionCard icon={Truck} title="أسعار التوصيل" subtitle="سعر التوصيل ومدة الوصول لكل منطقة — أضف أو احذف المحافظات بحرية" color="blue">
        <div className="space-y-4 mb-4">
          {DELIVERY_GROUPS.map(g => {
            const colorMap: Record<string, { border: string; bg: string; label: string; tag: string; tagX: string; input: string; addBtn: string }> = {
              emerald: {
                border: 'border-emerald-500/30', bg: 'bg-emerald-500/5',
                label: 'text-emerald-400',
                tag: 'bg-emerald-600/20 border-emerald-500/30 text-emerald-100',
                tagX: 'hover:text-red-300 text-emerald-400',
                input: 'focus:border-emerald-500/50',
                addBtn: 'bg-emerald-700/30 border-emerald-500/30 hover:bg-emerald-700/50 text-emerald-300',
              },
              sky: {
                border: 'border-sky-500/30', bg: 'bg-sky-500/5',
                label: 'text-sky-400',
                tag: 'bg-sky-600/20 border-sky-500/30 text-sky-100',
                tagX: 'hover:text-red-300 text-sky-400',
                input: 'focus:border-sky-500/50',
                addBtn: 'bg-sky-700/30 border-sky-500/30 hover:bg-sky-700/50 text-sky-300',
              },
              violet: {
                border: 'border-violet-500/30', bg: 'bg-violet-500/5',
                label: 'text-violet-400',
                tag: 'bg-violet-600/20 border-violet-500/30 text-violet-100',
                tagX: 'hover:text-red-300 text-violet-400',
                input: 'focus:border-violet-500/50',
                addBtn: 'bg-violet-700/30 border-violet-500/30 hover:bg-violet-700/50 text-violet-300',
              },
            };
            const c = colorMap[g.color];
            const provs = groupProvinces[g.key] || [];
            return (
              <div key={g.key} className={`rounded-xl border p-4 ${c.border} ${c.bg}`}>
                {/* Header row: label + fee + days */}
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <span className={`font-bold text-sm flex-1 min-w-0`}>{
                    <span className={c.label}>{g.label}</span>
                  }</span>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <input
                      type="number" min={0} step={500}
                      value={groupFees[g.key] ?? ''}
                      onChange={e => setGroupFees(prev => ({ ...prev, [g.key]: e.target.value }))}
                      className={`w-20 bg-black/30 border border-white/10 rounded-lg text-white text-sm px-2 py-1.5 text-center focus:outline-none ${c.input}`}
                    />
                    <span className="text-white/40 text-xs">د.ع</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <input
                      type="text"
                      value={groupDays[g.key] ?? ''}
                      onChange={e => setGroupDays(prev => ({ ...prev, [g.key]: e.target.value }))}
                      placeholder="مدة التوصيل"
                      className={`w-24 bg-black/30 border border-white/10 rounded-lg text-white text-xs px-2 py-1.5 text-center focus:outline-none ${c.input}`}
                    />
                  </div>
                </div>

                {/* Province chips with delete */}
                <div className="flex flex-wrap gap-1.5 mb-3 min-h-[28px]">
                  {provs.length === 0 && (
                    <span className="text-white/30 text-xs italic">لا توجد محافظات — أضف أدناه</span>
                  )}
                  {provs.map(p => (
                    <span key={p} className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border ${c.tag}`}>
                      {p}
                      <button
                        onClick={() => removeProvince(g.key, p)}
                        className={`ml-0.5 transition-colors ${c.tagX}`}
                        title={`حذف ${p}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>

                {/* Add province input */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={addProvInput[g.key] ?? ''}
                    onChange={e => setAddProvInput(prev => ({ ...prev, [g.key]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') addProvince(g.key); }}
                    placeholder="اكتب اسم محافظة جديدة..."
                    className={`flex-1 bg-black/30 border border-white/10 rounded-lg text-white text-xs px-3 py-1.5 focus:outline-none ${c.input} placeholder:text-white/25`}
                  />
                  <button
                    onClick={() => addProvince(g.key)}
                    disabled={!(addProvInput[g.key] || '').trim()}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors disabled:opacity-40 ${c.addBtn}`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Summary count + save button */}
        <div className="flex items-center justify-between">
          <span className="text-white/40 text-xs">
            {Object.values(groupProvinces).flat().length} محافظة مسجّلة
          </span>
          <button
            onClick={saveDeliveryFees}
            disabled={feesSaving}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {feesSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : feesSaved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {feesSaved ? 'تم الحفظ ✓' : 'حفظ الأسعار'}
          </button>
        </div>
      </SectionCard>

      {/* 5. Blacklist Keywords */}
      <SectionCard icon={Ban} title="قائمة الحظر" subtitle="إذا أرسل الزبون أي كلمة من هذه القائمة، يتوقف البوت عن الرد فوراً" color="orange">
        <div className="flex gap-2 mb-3">
          <input
            value={blacklistInput}
            onChange={e => setBlacklistInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addBlacklistWord(); }}
            placeholder="اكتب الكلمة واضغط Enter أو زر الإضافة..."
            className="flex-1 bg-black/30 border border-white/10 rounded-lg text-white text-sm px-3 py-2 focus:outline-none focus:border-orange-500/50"
          />
          <button
            onClick={addBlacklistWord}
            className="px-3 py-2 bg-orange-600/40 border border-orange-500/40 hover:bg-orange-600/60 text-orange-300 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        {blacklist.length === 0 ? (
          <p className="text-white/30 text-sm text-center py-3">لا توجد كلمات محظورة حتى الآن</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {blacklist.map(w => (
              <span key={w} className="flex items-center gap-1.5 bg-orange-600/20 border border-orange-500/30 text-orange-200 text-sm px-3 py-1 rounded-full">
                {w}
                <button onClick={() => removeBlacklistWord(w)} className="text-orange-400 hover:text-orange-200">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </SectionCard>

      {/* 5. Live Activity Log */}
      <SectionCard icon={Activity} title="سجل العمليات" subtitle="آخر المحادثات وحالة الاتصال بالـ API" color="slate">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${apiStatus === 'ok' ? 'bg-emerald-500 animate-pulse' : apiStatus === 'error' ? 'bg-red-500' : 'bg-yellow-500 animate-pulse'}`} />
            <span className={`text-sm font-medium ${apiStatus === 'ok' ? 'text-emerald-400' : apiStatus === 'error' ? 'text-red-400' : 'text-yellow-400'}`}>
              {apiStatus === 'ok' ? 'API متصل ✓' : apiStatus === 'error' ? 'API غير متصل ✗' : 'جاري التحقق...'}
            </span>
          </div>
          <button onClick={loadActivity} className="text-white/40 hover:text-white transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        {activityLog.length === 0 ? (
          <p className="text-white/30 text-sm text-center py-4">لا توجد محادثات حديثة</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {activityLog.map((conv: any, i: number) => (
              <div key={i} className="flex items-center gap-3 bg-white/5 rounded-lg px-3 py-2 border border-white/5">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${conv.status === 'active' ? 'bg-emerald-400' : conv.isEscalated ? 'bg-red-400' : 'bg-zinc-500'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-white/80 text-sm truncate">{conv.lastMessage || '—'}</p>
                  <p className="text-white/30 text-xs">{conv.platform} • {conv.senderId?.slice(0, 12)}…</p>
                </div>
                {conv.hasBooking && <span className="text-xs bg-violet-500/20 text-violet-300 px-2 py-0.5 rounded-full">حجز</span>}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* 6. Token Tracker */}
      <SectionCard icon={BarChart3} title="مراقبة الاستهلاك" subtitle="متابعة صرف التوكنات والتكلفة من رصيد OpenAI" color="blue">
        {usageStats ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'اليوم', value: usageStats.today?.tokensUsed?.toLocaleString() || '0', sub: 'توكن' },
              { label: 'هذا الأسبوع', value: usageStats.week?.tokensUsed?.toLocaleString() || '0', sub: 'توكن' },
              { label: 'هذا الشهر', value: usageStats.month?.tokensUsed?.toLocaleString() || '0', sub: 'توكن' },
              { label: 'التكلفة اليوم', value: `$${(usageStats.today?.cost ?? 0).toFixed(4)}`, sub: 'دولار' },
            ].map(({ label, value, sub }) => (
              <div key={label} className="bg-blue-600/20 border border-blue-500/30 rounded-xl p-3 text-center">
                <p className="text-blue-300/60 text-xs mb-1">{label}</p>
                <p className="text-blue-200 font-bold text-lg">{value}</p>
                <p className="text-blue-300/40 text-xs">{sub}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6">
            <BarChart3 className="w-8 h-8 text-white/20 mx-auto mb-2" />
            <p className="text-white/40 text-sm">لا توجد بيانات استهلاك متاحة</p>
            <a href={`${BASE.replace('/beqolky', '')}/beqolky/usage`} className="text-blue-400 text-sm hover:underline mt-1 inline-flex items-center gap-1">
              صفحة الاستهلاك التفصيلية <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}
      </SectionCard>

      {/* 7. Local Slang Mapper */}
      <SectionCard icon={BookOpenText} title="قاموس اللهجة العراقية" subtitle="علّم البوت معنى الكلمات العراقية حتى يفهمها برمجياً" color="violet">
        <div className="grid grid-cols-2 gap-2 mb-3">
          <input
            value={slangInput.slang}
            onChange={e => setSlangInput(p => ({ ...p, slang: e.target.value }))}
            placeholder="الكلمة العراقية (مثل: اشقد)"
            className="bg-black/30 border border-white/10 rounded-lg text-white text-sm px-3 py-2 focus:outline-none focus:border-violet-500/50"
          />
          <input
            value={slangInput.meaning}
            onChange={e => setSlangInput(p => ({ ...p, meaning: e.target.value }))}
            placeholder="المعنى (مثل: كم السعر)"
            className="bg-black/30 border border-white/10 rounded-lg text-white text-sm px-3 py-2 focus:outline-none focus:border-violet-500/50"
          />
        </div>
        <button
          onClick={addSlangPair}
          className="w-full py-2 bg-violet-600/30 border border-violet-500/40 hover:bg-violet-600/50 text-violet-300 text-sm rounded-lg transition-colors flex items-center justify-center gap-2 mb-4"
        >
          <Plus className="w-4 h-4" /> إضافة للقاموس
        </button>
        {slangPairs.length === 0 ? (
          <p className="text-white/30 text-sm text-center py-2">القاموس فارغ — أضف كلمات عراقية</p>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {slangPairs.map((pair, i) => (
              <div key={i} className="flex items-center gap-3 bg-white/5 rounded-lg px-3 py-2 border border-white/5">
                <span className="text-violet-300 font-semibold text-sm">{pair.slang}</span>
                <span className="text-white/30 text-xs">←</span>
                <span className="text-white/60 text-sm flex-1">{pair.meaning}</span>
                <button onClick={() => removeSlangPair(i)} className="text-white/30 hover:text-red-400 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* 8. AI Models */}
      <SectionCard icon={Sparkles} title="موديل الذكاء الاصطناعي" subtitle="موديل تحليل الصور وتحديد المنتجات" color="violet">
        <div className="mb-4">
          {/* Image/Analysis Model */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-white/50 flex items-center gap-1.5">
              <span>🖼️</span> موديل الصور والمخزن والمهام المعقدة
            </label>
            <div className="space-y-2">
              {AI_MODELS.map(m => (
                <button
                  key={m.value}
                  onClick={() => setAiImageModel(m.value)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-right transition-all ${
                    aiImageModel === m.value
                      ? 'border-pink-500/60 bg-pink-500/15 text-white'
                      : 'border-white/10 bg-white/5 text-white/50 hover:bg-white/10'
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full shrink-0 ${aiImageModel === m.value ? 'bg-pink-400' : 'bg-white/20'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold">{m.label}</p>
                    <p className="text-[10px] opacity-60">{m.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <button
            onClick={saveAiModels}
            disabled={aiModelSaving}
            className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {aiModelSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : aiModelSaved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {aiModelSaved ? 'تم الحفظ ✓' : 'حفظ الموديلات'}
          </button>
        </div>
      </SectionCard>


      {/* 9. Factory Reset */}
      <SectionCard icon={Trash2} title="فرمتة العقل" subtitle="مسح كافة التعليمات والإعدادات المخصصة والبدء من صفر" color="red">
        {resetDone ? (
          <div className="flex items-center gap-3 bg-emerald-600/20 border border-emerald-500/30 rounded-xl p-4">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <span className="text-emerald-300">تم إعادة الضبط بنجاح — البوت عاد لإعداداته الافتراضية</span>
          </div>
        ) : !resetConfirm ? (
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <p className="text-white/60 text-sm mb-1">هذا الإجراء سيمسح:</p>
              <ul className="text-white/40 text-xs space-y-0.5 list-disc list-inside">
                <li>التعليمات المخصصة (System Prompt)</li>
                <li>قائمة الحظر وقاموس اللهجة</li>
                <li>إيقاف البوت على جميع المنصات</li>
              </ul>
            </div>
            <button
              onClick={() => setResetConfirm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-red-600/30 border border-red-500/40 hover:bg-red-600/50 text-red-300 text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
            >
              <AlertTriangle className="w-4 h-4" />
              إعادة الضبط الكاملة
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 bg-red-600/20 border border-red-500/30 rounded-lg p-3">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <p className="text-red-300 text-sm">هل أنت متأكدة؟ هذا الإجراء لا يمكن التراجع عنه!</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleFactoryReset}
                disabled={resetting}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-semibold rounded-lg transition-colors"
              >
                {resetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                نعم، امسح كل شيء
              </button>
              <button
                onClick={() => setResetConfirm(false)}
                className="flex-1 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
              >
                إلغاء
              </button>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
