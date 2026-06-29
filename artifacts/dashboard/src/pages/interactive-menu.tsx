import { useState, useEffect, useCallback } from 'react';
import {
  Zap, Save, ToggleLeft, ToggleRight,
  CheckCircle2, XCircle, Loader2, Plus, X,
  Wrench, Upload, Download, Truck, GripVertical,
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

const ORDINALS = ['أولاً', 'ثانياً', 'ثالثاً', 'رابعاً', 'خامساً', 'سادساً', 'سابعاً', 'ثامناً', 'تاسعاً', 'عاشراً'];

// ─── Types ────────────────────────────────────────────────────────────────────

interface MenuItem {
  id: number;
  title: string;
  shortTitle: string;
  response: string;
  imageUrl?: string | null;
  steps?: { text: string; imageUrl: string | null }[];
  active: boolean;
}

// ─── SectionCard ──────────────────────────────────────────────────────────────

function SectionCard({ icon: Icon, title, subtitle, children, color = 'blue' }: {
  icon: React.ComponentType<any>;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  color?: string;
}) {
  const colors: Record<string, string> = {
    blue: 'from-blue-500/20 to-cyan-500/10 border-blue-500/30',
    orange: 'from-orange-500/20 to-amber-500/10 border-orange-500/30',
    violet: 'from-violet-500/20 to-purple-500/10 border-violet-500/30',
  };
  return (
    <div className={`rounded-2xl border bg-gradient-to-br p-6 ${colors[color] || colors.blue}`}>
      <div className="flex items-start gap-3 mb-5">
        <div className="p-2 rounded-xl bg-white/10">
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

// ─── Main Component ────────────────────────────────────────────────────────────

export default function InteractiveMenu() {
  const { language, isRtl } = useTranslation();
  const ar = language === 'ar';

  // ── Bot menu state ──
  type MenuLang = 'ar' | 'ku';
  const [menuItemsLang, setMenuItemsLang] = useState<{ ar: MenuItem[]; ku: MenuItem[] }>({ ar: [], ku: [] });
  const [menuLang, setMenuLang] = useState<MenuLang>('ar');
  const [menuSaving, setMenuSaving] = useState(false);
  const [menuSaved, setMenuSaved] = useState(false);
  const [newMenuItem, setNewMenuItem] = useState<Omit<MenuItem, 'id' | 'active'>>({ title: '', shortTitle: '', response: '', imageUrl: null });
  const [newMenuItemSteps, setNewMenuItemSteps] = useState<{ text: string; imageUrl: string | null }[]>([{ text: '', imageUrl: null }]);
  const [editingMenuId, setEditingMenuId] = useState<number | null>(null);
  const [uploadingMenuItemStep, setUploadingMenuItemStep] = useState<number | null>(null);
  const [menuImportError, setMenuImportError] = useState<string | null>(null);
  const currentMenuItems = menuItemsLang[menuLang];
  const [menuLangPrompt, setMenuLangPrompt] = useState('زمانی خۆت هەڵبژێرە / اختار لغتك');
  const [menuLangPromptSaving, setMenuLangPromptSaving] = useState(false);
  const [menuLangPromptSaved, setMenuLangPromptSaved] = useState(false);
  const [menuArPrompt, setMenuArPrompt] = useState('اختار — اكتب الرقم 👇');
  const [menuKuPrompt, setMenuKuPrompt] = useState('هەڵبژێرە — كتێبە ژمارە 👇');
  const [menuPrompSaving, setMenuPrompSaving] = useState<'ar' | 'ku' | null>(null);
  const [menuPrompSaved, setMenuPrompSaved] = useState<'ar' | 'ku' | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [groupFees, setGroupFees] = useState<Record<string, string>>({ iqliym: '5000', zakho: '3000', rest: '6000' });
  const [groupDays, setGroupDays] = useState<Record<string, string>>({ iqliym: '2-3 يوم', zakho: '1-2 يوم', rest: '2-3 يوم' });
  const [loading, setLoading] = useState(true);
  const [menuFlowEnabled, setMenuFlowEnabled] = useState(false);
  const [menuFlowSaving, setMenuFlowSaving] = useState(false);

  // ── Load settings ──
  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/settings`);
      const d: any = await r.json();
      setMenuFlowEnabled(!!d.welcomeFlowEnabled);
      if (d.menuItems) {
        try {
          const parsed = JSON.parse(d.menuItems);
          if (Array.isArray(parsed)) {
            setMenuItemsLang({ ar: parsed, ku: [] });
          } else if (parsed && typeof parsed === 'object') {
            setMenuItemsLang({ ar: parsed.ar || [], ku: parsed.ku || [] });
          }
        } catch {}
      }
      if (d.menuLangPrompt) setMenuLangPrompt(d.menuLangPrompt);
      if (d.menuArPrompt) setMenuArPrompt(d.menuArPrompt);
      if (d.menuKuPrompt) setMenuKuPrompt(d.menuKuPrompt);
      try {
        const stored = d.deliveryFees ? JSON.parse(d.deliveryFees) : {};
        const f: Record<string, string> = {};
        const dy: Record<string, string> = {};
        for (const k of ['iqliym', 'zakho', 'rest']) {
          f[k] = String(stored[`__fee_${k}`] || groupFees[k]);
          dy[k] = stored[`__days_${k}`] || groupDays[k];
        }
        setGroupFees(f);
        setGroupDays(dy);
      } catch {}
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  // ── Bot menu handlers ──
  const toggleMenuFlow = async (val: boolean) => {
    setMenuFlowEnabled(val);
    setMenuFlowSaving(true);
    try {
      await fetch(`${BASE}/api/settings`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ welcomeFlowEnabled: val }),
      });
    } catch {}
    finally { setMenuFlowSaving(false); }
  };

  const saveMenuLangPrompt = async () => {
    setMenuLangPromptSaving(true);
    try {
      await fetch(`${BASE}/api/settings`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ menuLangPrompt }),
      });
      setMenuLangPromptSaved(true);
      setTimeout(() => setMenuLangPromptSaved(false), 2500);
    } catch {}
    finally { setMenuLangPromptSaving(false); }
  };

  const saveMenuNumberedPrompt = async (lang: 'ar' | 'ku') => {
    setMenuPrompSaving(lang);
    try {
      const body = lang === 'ar' ? { menuArPrompt } : { menuKuPrompt };
      await fetch(`${BASE}/api/settings`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setMenuPrompSaved(lang);
      setTimeout(() => setMenuPrompSaved(null), 2500);
    } catch {}
    finally { setMenuPrompSaving(null); }
  };

  const saveMenuItems = async (lang?: { ar: MenuItem[]; ku: MenuItem[] }) => {
    const toSave = lang ?? menuItemsLang;
    setMenuSaving(true);
    try {
      await fetch(`${BASE}/api/settings`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ menuItems: JSON.stringify(toSave) }),
      });
      setMenuSaved(true);
      setTimeout(() => setMenuSaved(false), 3000);
    } catch {}
    finally { setMenuSaving(false); }
  };

  const downloadMenuJson = () => {
    const data = JSON.stringify(menuItemsLang, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sonbola-menu-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importMenuJson = async (file: File) => {
    setMenuImportError(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      let updated: { ar: MenuItem[]; ku: MenuItem[] };
      if (parsed && Array.isArray(parsed.ar)) {
        updated = { ar: parsed.ar, ku: parsed.ku || [] };
      } else if (Array.isArray(parsed)) {
        updated = { ar: parsed, ku: [] };
      } else {
        setMenuImportError('صيغة الملف غير صحيحة — يجب أن يحتوي على { ar: [...], ku: [...] }');
        return;
      }
      setMenuItemsLang(updated);
      saveMenuItems(updated);
    } catch {
      setMenuImportError('فشل قراءة الملف — تأكد أنه ملف JSON صحيح');
    }
  };

  const uploadMenuItemStepImage = async (stepIndex: number, file: File) => {
    setUploadingMenuItemStep(stepIndex);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch(`${BASE}/api/settings/upload-image`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64 }),
      });
      if (res.ok) {
        const data = await res.json();
        setNewMenuItemSteps(prev => prev.map((s, i) => i === stepIndex ? { ...s, imageUrl: data.url } : s));
      }
    } catch {}
    finally { setUploadingMenuItemStep(null); }
  };

  const resetNewMenuItem = () => {
    setNewMenuItem({ title: '', shortTitle: '', response: '', imageUrl: null });
    setNewMenuItemSteps([{ text: '', imageUrl: null }]);
  };

  const addMenuItem = () => {
    const validSteps = newMenuItemSteps.filter(s => s.text.trim());
    if (!newMenuItem.title.trim() || validSteps.length === 0) return;
    const item: MenuItem = {
      id: Date.now(),
      title: newMenuItem.title.trim(),
      shortTitle: newMenuItem.shortTitle.trim() || newMenuItem.title.trim().slice(0, 20),
      response: validSteps[0].text.trim(),
      imageUrl: validSteps[0].imageUrl || null,
      steps: validSteps.map(s => ({ text: s.text.trim(), imageUrl: s.imageUrl })),
      active: true,
    };
    const updated = { ...menuItemsLang, [menuLang]: [...menuItemsLang[menuLang], item] };
    setMenuItemsLang(updated);
    resetNewMenuItem();
    saveMenuItems(updated);
  };

  const removeMenuItem = (id: number) => {
    const updated = { ...menuItemsLang, [menuLang]: menuItemsLang[menuLang].filter(m => m.id !== id) };
    setMenuItemsLang(updated);
    saveMenuItems(updated);
  };

  const toggleMenuItem = (id: number) => {
    const updated = { ...menuItemsLang, [menuLang]: menuItemsLang[menuLang].map(m => m.id === id ? { ...m, active: !m.active } : m) };
    setMenuItemsLang(updated);
    saveMenuItems(updated);
  };

  const handleDragStart = (idx: number) => setDragIndex(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => { e.preventDefault(); setDragOverIndex(idx); };
  const handleDrop = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === idx) { setDragIndex(null); setDragOverIndex(null); return; }
    const items = [...menuItemsLang[menuLang]];
    const [moved] = items.splice(dragIndex, 1);
    items.splice(idx, 0, moved);
    const updated = { ...menuItemsLang, [menuLang]: items };
    setMenuItemsLang(updated);
    saveMenuItems(updated);
    setDragIndex(null);
    setDragOverIndex(null);
  };
  const handleDragEnd = () => { setDragIndex(null); setDragOverIndex(null); };

  const startEditMenuItem = (item: MenuItem) => {
    setEditingMenuId(item.id);
    setNewMenuItem({ title: item.title, shortTitle: item.shortTitle, response: item.response, imageUrl: item.imageUrl || null });
    if (item.steps && item.steps.length > 0) {
      setNewMenuItemSteps(item.steps.map(s => ({ text: s.text, imageUrl: s.imageUrl })));
    } else {
      setNewMenuItemSteps([{ text: item.response, imageUrl: item.imageUrl || null }]);
    }
  };

  const saveEditMenuItem = () => {
    const validSteps = newMenuItemSteps.filter(s => s.text.trim());
    if (!editingMenuId || !newMenuItem.title.trim() || validSteps.length === 0) return;
    const updated = {
      ...menuItemsLang,
      [menuLang]: menuItemsLang[menuLang].map(m => m.id === editingMenuId ? {
        ...m,
        title: newMenuItem.title.trim(),
        shortTitle: newMenuItem.shortTitle.trim() || newMenuItem.title.trim().slice(0, 20),
        response: validSteps[0].text.trim(),
        imageUrl: validSteps[0].imageUrl || null,
        steps: validSteps.map(s => ({ text: s.text.trim(), imageUrl: s.imageUrl })),
      } : m),
    };
    setMenuItemsLang(updated);
    setEditingMenuId(null);
    resetNewMenuItem();
    saveMenuItems(updated);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto" dir={isRtl ? 'rtl' : 'ltr'}>

      {/* ══════════ القائمة التفاعلية (Bot Menu) ══════════ */}
      <SectionCard
        icon={Zap}
        title={ar ? 'القائمة التفاعلية' : 'Interactive Menu'}
        subtitle={`عربي: ${menuItemsLang.ar.filter(m => m.active).length}/20 • کوردی: ${menuItemsLang.ku.filter(m => m.active).length}/20 — الزبون يختار لغته بنفسه`}
        color="blue"
      >
        {/* Enable / Disable toggle */}
        <div className={`flex items-center justify-between rounded-xl px-4 py-3 mb-5 border ${menuFlowEnabled ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-zinc-800/50 border-white/10'}`}>
          <div>
            <p className="text-white text-sm font-semibold">
              {menuFlowEnabled ? (ar ? '✅ القائمة التفاعلية مشغّلة' : '✅ Interactive Menu Active') : (ar ? '⛔ القائمة التفاعلية متوقفة' : '⛔ Interactive Menu Stopped')}
            </p>
            <p className="text-white/40 text-xs mt-0.5">
              {menuFlowEnabled
                ? (ar ? 'البوت يرسل القائمة لكل زبون جديد تلقائياً' : 'Bot sends the menu to every new customer automatically')
                : (ar ? 'البوت لا يرسل القائمة — شغّلها بيدك متى تريد' : 'Bot does not send the menu — enable it manually when you want')}
            </p>
          </div>
          <button
            onClick={() => toggleMenuFlow(!menuFlowEnabled)}
            disabled={menuFlowSaving}
            className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors duration-300 disabled:opacity-50 ${menuFlowEnabled ? 'bg-emerald-500' : 'bg-zinc-600'}`}
          >
            {menuFlowSaving
              ? <Loader2 className="w-4 h-4 animate-spin text-white absolute left-1/2 -translate-x-1/2" />
              : <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-300 ${menuFlowEnabled ? 'translate-x-8' : 'translate-x-1'}`} />}
          </button>
        </div>

        {/* Language selection prompt */}
        <div className="rounded-xl border border-blue-500/20 bg-blue-950/30 p-4 mb-4">
          <label className="text-blue-300/80 text-xs font-medium mb-2 block">
            📝 نص رسالة اختيار اللغة (تظهر للزبون مع زرين: عربي و کوردی)
          </label>
          <div className="flex gap-2">
            <input
              value={menuLangPrompt}
              onChange={e => setMenuLangPrompt(e.target.value)}
              onBlur={saveMenuLangPrompt}
              placeholder="زمانی خۆت هەڵبژێرە / اختار لغتك"
              className="flex-1 bg-black/30 border border-white/10 rounded-lg text-white text-sm px-3 py-2 focus:outline-none focus:border-blue-500/50 placeholder:text-white/20"
            />
            <button
              onClick={saveMenuLangPrompt}
              disabled={menuLangPromptSaving}
              className="px-3 py-2 bg-blue-600/40 border border-blue-500/40 hover:bg-blue-600/60 disabled:opacity-40 text-blue-200 rounded-lg transition-colors flex items-center gap-1.5 text-sm"
            >
              {menuLangPromptSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : menuLangPromptSaved ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Save className="w-4 h-4" />}
            </button>
          </div>
          <div className="mt-3 bg-white/5 rounded-lg p-3">
            <p className="text-white/40 text-xs mb-2">معاينة ما سيراه الزبون في الماسنجر:</p>
            <div className="bg-[#1877f2]/10 border border-[#1877f2]/20 rounded-lg p-2.5 max-w-[280px]">
              <p className="text-white/80 text-sm mb-2">{menuLangPrompt || 'زمانی خۆت هەڵبژێرە / اختار لغتك'}</p>
              <div className="flex gap-1.5">
                <span className="text-xs bg-[#1877f2]/30 border border-[#1877f2]/40 text-blue-200 px-3 py-1 rounded-full">🇮🇶 عربي</span>
                <span className="text-xs bg-[#1877f2]/30 border border-[#1877f2]/40 text-blue-200 px-3 py-1 rounded-full">🏔️ کوردی</span>
              </div>
            </div>
          </div>
        </div>

        {/* Numbered menu prompts */}
        <div className="rounded-xl border border-blue-500/20 bg-blue-950/30 p-4 mb-4 space-y-3">
          <label className="text-blue-300/80 text-xs font-medium block">
            🔢 نص رسالة القائمة المرقّمة (تظهر للزبون بعد اختيار اللغة)
          </label>
          {([['ar', '🇮🇶 عربي', menuArPrompt, setMenuArPrompt], ['ku', '🏔️ کوردی', menuKuPrompt, setMenuKuPrompt]] as [string, string, string, (v: string) => void][]).map(([lang, label, val, setter]) => (
            <div key={lang}>
              <p className="text-white/40 text-xs mb-1">{label}</p>
              <div className="flex gap-2">
                <input
                  value={val}
                  onChange={e => setter(e.target.value)}
                  onBlur={() => saveMenuNumberedPrompt(lang as 'ar' | 'ku')}
                  placeholder={lang === 'ar' ? 'اختار — اكتب الرقم 👇' : 'هەڵبژێرە — كتێبە ژمارە 👇'}
                  className="flex-1 bg-black/30 border border-white/10 rounded-lg text-white text-sm px-3 py-2 focus:outline-none focus:border-blue-500/50 placeholder:text-white/20"
                />
                <button
                  onClick={() => saveMenuNumberedPrompt(lang as 'ar' | 'ku')}
                  disabled={menuPrompSaving === lang}
                  className="px-3 py-2 bg-blue-600/40 border border-blue-500/40 hover:bg-blue-600/60 disabled:opacity-40 text-blue-200 rounded-lg transition-colors flex items-center gap-1.5 text-sm"
                >
                  {menuPrompSaving === lang ? <Loader2 className="w-4 h-4 animate-spin" /> : menuPrompSaved === lang ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Save className="w-4 h-4" />}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Language tabs */}
        <p className="text-white/40 text-xs mb-2">إدارة خيارات كل لغة:</p>
        <div className="flex gap-1 mb-4 bg-white/5 rounded-xl p-1">
          {([['ar', '🇮🇶 عربي'], ['ku', '🏔️ کوردی']] as [string, string][]).map(([lang, label]) => (
            <button
              key={lang}
              onClick={() => { setMenuLang(lang as MenuLang); setEditingMenuId(null); resetNewMenuItem(); }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${menuLang === lang ? 'bg-blue-600/50 text-blue-100 shadow' : 'text-white/40 hover:text-white/70'}`}
            >
              {label}
              <span className={`mr-1.5 text-xs ${menuLang === lang ? 'text-blue-300' : 'text-white/25'}`}>
                ({menuItemsLang[lang as MenuLang].filter(m => m.active).length})
              </span>
            </button>
          ))}
        </div>

        {/* Items list */}
        {currentMenuItems.length === 0 ? (
          <div className="mb-4 rounded-xl border border-white/5 bg-white/3 p-4 text-center">
            <p className="text-white/30 text-sm">لا توجد عناصر بعد — أضف أول عنصر من النموذج أدناه</p>
          </div>
        ) : (
          <div className="mb-4 space-y-2">
            {currentMenuItems.map((item, idx) => (
              <div
                key={item.id}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={e => handleDragOver(e, idx)}
                onDrop={e => handleDrop(e, idx)}
                onDragEnd={handleDragEnd}
                className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-all ${
                  dragIndex === idx ? 'opacity-40 scale-95' :
                    dragOverIndex === idx && dragIndex !== idx ? 'border-blue-400/60 bg-blue-900/40 scale-[1.01]' :
                      item.active ? 'bg-blue-950/30 border-blue-500/25' : 'bg-white/3 border-white/8 opacity-60'
                }`}
              >
                <span className="text-white/20 hover:text-white/50 cursor-grab active:cursor-grabbing flex-shrink-0" title="اسحب لإعادة الترتيب">
                  <GripVertical className="w-4 h-4" />
                </span>
                <span className={`text-xs w-5 text-center flex-shrink-0 font-bold ${idx < 10 ? 'text-red-400/70' : 'text-blue-400/70'}`}>{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-sm font-medium truncate ${item.active ? 'text-blue-100' : 'text-white/40 line-through'}`}>
                      {item.shortTitle || item.title}
                    </span>
                    {item.shortTitle && item.title !== item.shortTitle && (
                      <span className="text-white/25 text-xs truncate hidden sm:inline">({item.title})</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {item.steps && item.steps.length > 1 ? (
                      <span className="text-white/30 text-xs">{item.steps.length} خطوات</span>
                    ) : (
                      <span className="text-white/30 text-xs truncate max-w-[200px]">
                        {(item.steps?.[0]?.text || item.response || '').slice(0, 50)}{(item.steps?.[0]?.text || item.response || '').length > 50 ? '...' : ''}
                      </span>
                    )}
                    {(item.imageUrl || item.steps?.some(s => s.imageUrl)) && (
                      <span className="text-white/25 text-xs">• 📷</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => toggleMenuItem(item.id)}
                    title={item.active ? 'إيقاف' : 'تفعيل'}
                    className={`p-1.5 rounded-lg transition-colors ${item.active ? 'text-emerald-400/70 hover:text-emerald-300 hover:bg-emerald-500/10' : 'text-white/20 hover:text-white/50 hover:bg-white/5'}`}
                  >
                    {item.active ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => startEditMenuItem(item)}
                    title="تعديل"
                    className="p-1.5 rounded-lg text-blue-400/60 hover:text-blue-300 hover:bg-blue-500/10 transition-colors"
                  >
                    <Wrench className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => removeMenuItem(item.id)}
                    title="حذف"
                    className="p-1.5 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add / Edit form */}
        <div className="rounded-xl border border-blue-500/20 bg-blue-950/20 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-blue-300/70 text-xs font-medium">
              {editingMenuId ? '✏️ تعديل عنصر' : '➕ إضافة عنصر جديد'}
            </p>
            {!editingMenuId && (
              <button
                onClick={() => {
                  const fmt = (n: string) => Number(n).toLocaleString('en') + ' د.ع';
                  const text =
                    `🚚 أسعار التوصيل لجميع المحافظات:\n\n🏔️ محافظات الإقليم (كركوك، أربيل، دهوك، حلبجة، السليمانية):\n💰 السعر: ${fmt(groupFees.iqliym)}\n⏱️ المدة: ${groupDays.iqliym}\n\n🏙️ زاخو:\n💰 السعر: ${fmt(groupFees.zakho)}\n⏱️ المدة: ${groupDays.zakho}\n\n🗺️ باقي المحافظات (بغداد، البصرة، نينوى، الأنبار...):\n💰 السعر: ${fmt(groupFees.rest)}\n⏱️ المدة: ${groupDays.rest}`;
                  setNewMenuItem(p => ({ ...p, title: 'التوصيل لجميع المحافظات', shortTitle: '📦 التوصيل' }));
                  setNewMenuItemSteps([{ text, imageUrl: null }]);
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-sky-500/10 border border-sky-500/25 hover:bg-sky-500/20 text-sky-300/80 hover:text-sky-200 text-xs rounded-lg transition-colors"
                title="يملأ النموذج بأسعار التوصيل الحالية"
              >
                <Truck className="w-3.5 h-3.5" />
                إضافة التوصيل
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="text-white/40 text-xs mb-1 block">العنوان الكامل (للمطابقة)</label>
              <input
                value={newMenuItem.title}
                onChange={e => setNewMenuItem(p => ({ ...p, title: e.target.value }))}
                placeholder="مثال: اشلون القياسات"
                className="w-full bg-black/30 border border-white/10 rounded-lg text-white text-sm px-3 py-2 focus:outline-none focus:border-blue-500/50 placeholder:text-white/20"
              />
            </div>
            <div>
              <label className="text-white/40 text-xs mb-1 block">نص الزر (max 20 حرف — يظهر في الماسنجر)</label>
              <input
                value={newMenuItem.shortTitle}
                onChange={e => setNewMenuItem(p => ({ ...p, shortTitle: e.target.value.slice(0, 20) }))}
                placeholder="مثال: القياسات"
                maxLength={20}
                className="w-full bg-black/30 border border-white/10 rounded-lg text-white text-sm px-3 py-2 focus:outline-none focus:border-blue-500/50 placeholder:text-white/20"
              />
              <p className={`text-xs mt-0.5 ${(newMenuItem.shortTitle || newMenuItem.title).slice(0, 20).length >= 18 ? 'text-amber-400' : 'text-white/25'}`}>
                {(newMenuItem.shortTitle || newMenuItem.title).slice(0, 20).length}/20 حرف
              </p>
            </div>
          </div>

          {/* Steps builder */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-white/40 text-xs">الخطوات — رسائل يرسلها البوت بالترتيب عند الضغط</label>
              <button
                onClick={() => setNewMenuItemSteps(prev => [...prev, { text: '', imageUrl: null }])}
                className="flex items-center gap-1 text-xs text-blue-400/70 hover:text-blue-300 transition-colors"
              >
                <Plus className="w-3 h-3" /> إضافة خطوة
              </button>
            </div>

            {newMenuItemSteps.map((step, idx) => (
              <div key={idx} className="rounded-lg border border-white/10 bg-black/20 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-white/40 text-xs font-medium">{ORDINALS[idx] || `الخطوة ${idx + 1}`}</span>
                  {newMenuItemSteps.length > 1 && (
                    <button
                      onClick={() => setNewMenuItemSteps(prev => prev.filter((_, i) => i !== idx))}
                      className="text-white/20 hover:text-red-400 transition-colors"
                      title="حذف الخطوة"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <textarea
                  value={step.text}
                  onChange={e => setNewMenuItemSteps(prev => prev.map((s, i) => i === idx ? { ...s, text: e.target.value } : s))}
                  placeholder="اكتب نص الرسالة..."
                  rows={3}
                  className="w-full bg-black/30 border border-white/10 rounded-lg text-white text-sm px-3 py-2 focus:outline-none focus:border-blue-500/50 placeholder:text-white/20 resize-none"
                />
                {step.imageUrl ? (
                  <div className="flex items-center gap-2">
                    <img src={step.imageUrl} alt="preview" className="w-14 h-14 object-cover rounded-lg border border-blue-500/30" />
                    <div className="flex flex-col gap-1">
                      <span className="text-blue-300/70 text-xs">تم رفع الصورة ✓</span>
                      <button
                        onClick={() => setNewMenuItemSteps(prev => prev.map((s, i) => i === idx ? { ...s, imageUrl: null } : s))}
                        className="flex items-center gap-1 text-xs text-red-400/70 hover:text-red-400 transition-colors"
                      >
                        <X className="w-3 h-3" /> حذف الصورة
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs cursor-pointer transition-colors ${uploadingMenuItemStep === idx ? 'bg-white/5 border-white/10 text-white/30' : 'bg-blue-500/10 border-blue-500/30 hover:bg-blue-500/20 text-blue-300'}`}>
                    {uploadingMenuItemStep === idx ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> جاري الرفع...</>
                    ) : (
                      <><Upload className="w-3.5 h-3.5" /> ارفع صورة (اختياري)</>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploadingMenuItemStep !== null}
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) uploadMenuItemStepImage(idx, file);
                        e.target.value = '';
                      }}
                    />
                  </label>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            {editingMenuId ? (
              <>
                <button
                  onClick={saveEditMenuItem}
                  disabled={!newMenuItem.title.trim() || !newMenuItemSteps.some(s => s.text.trim())}
                  className="flex-1 flex items-center justify-center gap-2 py-2 bg-blue-600/40 border border-blue-500/40 hover:bg-blue-600/60 disabled:opacity-40 text-blue-200 text-sm font-medium rounded-lg transition-colors"
                >
                  <Save className="w-4 h-4" />
                  حفظ التعديل
                </button>
                <button
                  onClick={() => { setEditingMenuId(null); resetNewMenuItem(); }}
                  className="px-3 py-2 bg-white/5 hover:bg-white/10 text-white/50 text-sm rounded-lg transition-colors"
                >
                  إلغاء
                </button>
              </>
            ) : (
              <button
                onClick={addMenuItem}
                disabled={!newMenuItem.title.trim() || !newMenuItemSteps.some(s => s.text.trim()) || currentMenuItems.filter(m => m.active).length >= 20}
                className="flex-1 flex items-center justify-center gap-2 py-2 bg-blue-600/40 border border-blue-500/40 hover:bg-blue-600/60 disabled:opacity-40 text-blue-200 text-sm font-medium rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                {menuLang === 'ar' ? 'إضافة للقائمة العربية' : 'زیادەکردن بۆ لیستی کوردی'}
              </button>
            )}
          </div>

          {currentMenuItems.filter(m => m.active).length >= 20 && (
            <p className="text-amber-400/70 text-xs text-center">وصلت للحد الأقصى (20 زر) — عطّل أو احذف عناصر حتى تقدر تضيف جديدة</p>
          )}
        </div>

        {/* Save indicator */}
        {(menuSaving || menuSaved) && (
          <div className={`flex items-center gap-2 text-sm mt-3 ${menuSaved ? 'text-emerald-400' : 'text-blue-400'}`}>
            {menuSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {menuSaving ? 'جاري الحفظ...' : 'تم الحفظ ✓'}
          </div>
        )}

        {/* How it works */}
        <div className="mt-4 rounded-xl border border-white/5 bg-white/3 p-3 space-y-1.5">
          <p className="text-white/40 text-xs font-medium">كيف يشتغل؟</p>
          <p className="text-white/30 text-xs">① البوت يرسل خطوات الترحيب + الأزرار في الرسالة الأخيرة</p>
          <p className="text-white/30 text-xs">② الزبون يضغط زر → الماسنجر يرسل العنوان كرسالة</p>
          <p className="text-white/30 text-xs">③ البوت يطابق العنوان ويرسل الرد المحفوظ مباشرةً بدون ذكاء اصطناعي</p>
          <p className="text-white/30 text-xs">④ الأزرار تعمل في الماسنجر (فيسبوك + إنستغرام)</p>
        </div>

        {/* Export / Import JSON */}
        <div className="mt-3 space-y-2">
          <p className="text-white/30 text-xs">نسخ احتياطي لعناصر القائمة:</p>
          <div className="flex gap-2">
            <button
              onClick={downloadMenuJson}
              className="flex-1 flex items-center justify-center gap-2 py-2 bg-white/5 border border-white/10 hover:bg-white/8 hover:border-white/20 text-white/50 hover:text-white/80 text-xs rounded-lg transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              تنزيل JSON
            </button>
            <label className="flex-1 flex items-center justify-center gap-2 py-2 bg-white/5 border border-white/10 hover:bg-white/8 hover:border-white/20 text-white/50 hover:text-white/80 text-xs rounded-lg transition-colors cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              رفع JSON
              <input
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) importMenuJson(file);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
          {menuImportError && (
            <p className="text-red-400/70 text-xs flex items-center gap-1">
              <XCircle className="w-3.5 h-3.5 flex-shrink-0" /> {menuImportError}
            </p>
          )}
        </div>
      </SectionCard>

    </div>
  );
}
