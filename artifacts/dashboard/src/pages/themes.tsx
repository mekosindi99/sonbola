import React, { useEffect, useState } from 'react';
import { Palette, Check, Trash2, Edit3, Plus, RefreshCw, Download, Upload, X, Wand2, Eye, Grid2X2, LayoutGrid } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

interface ThemeConfig {
  pageBg: string;
  headerBg: string;
  headerBorder: string;
  heroBg: string;
  heroText: string;
  primaryColor: string;
  primaryText: string;
  accentColor: string;
  accentText: string;
  cardBg: string;
  cardBorder: string;
  cardRadius: number;
  fontFamily: string;
  badgeSaleBg: string;
  badgeSaleText: string;
}

interface Theme {
  id: number;
  name: string;
  slug: string;
  isActive: boolean;
  isBuiltin: boolean;
  config: ThemeConfig;
  createdAt: string;
}

const DEFAULT_CONFIG: ThemeConfig = {
  pageBg: '#f7f8fa',
  headerBg: '#ffffff',
  headerBorder: '#e5e7eb',
  heroBg: 'linear-gradient(135deg,#ff6b9d 0%,#ff9a6c 100%)',
  heroText: '#ffffff',
  primaryColor: '#25d366',
  primaryText: '#ffffff',
  accentColor: '#ff6b9d',
  accentText: '#ffffff',
  cardBg: '#ffffff',
  cardBorder: '#f0f0f0',
  cardRadius: 16,
  fontFamily: "'Segoe UI', Tahoma, sans-serif",
  badgeSaleBg: '#ef4444',
  badgeSaleText: '#ffffff',
};

// ── Mini Storefront Preview ────────────────────────────────────────────────────

function MiniPreview({ config }: { config: ThemeConfig }) {
  return (
    <div
      style={{
        width: '100%',
        aspectRatio: '9/12',
        borderRadius: 12,
        overflow: 'hidden',
        background: config.pageBg,
        fontFamily: config.fontFamily,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
      }}
    >
      {/* Header */}
      <div style={{
        background: config.headerBg,
        borderBottom: `1px solid ${config.headerBorder}`,
        padding: '5px 8px',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        flexShrink: 0,
      }}>
        <div style={{ width: 16, height: 16, borderRadius: 4, background: config.primaryColor }} />
        <div style={{ flex: 1, height: 4, borderRadius: 2, background: config.headerBorder }} />
        <div style={{ width: 18, height: 6, borderRadius: 3, background: config.primaryColor, opacity: 0.7 }} />
      </div>

      {/* Hero Banner */}
      <div style={{
        background: config.heroBg,
        height: 38,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        padding: '0 8px',
        gap: 6,
      }}>
        <div style={{ width: 22, height: 22, borderRadius: 6, background: 'rgba(255,255,255,0.3)' }} />
        <div style={{ flex: 1 }}>
          <div style={{ width: '60%', height: 5, borderRadius: 2, background: config.heroText, opacity: 0.9, marginBottom: 3 }} />
          <div style={{ width: '40%', height: 3, borderRadius: 2, background: config.heroText, opacity: 0.6 }} />
        </div>
      </div>

      {/* Filter chips */}
      <div style={{ padding: '4px 6px', display: 'flex', gap: 3, background: config.pageBg, flexShrink: 0 }}>
        {[config.primaryColor, config.accentColor, '#e5e7eb'].map((c, i) => (
          <div key={i} style={{ height: 8, width: i === 0 ? 28 : 20, borderRadius: 4, background: i < 2 ? c : config.cardBorder, opacity: i === 0 ? 1 : 0.7 }} />
        ))}
      </div>

      {/* Product grid */}
      <div style={{ flex: 1, padding: '0 5px 5px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{
            background: config.cardBg,
            borderRadius: config.cardRadius * 0.5,
            border: `1px solid ${config.cardBorder}`,
            padding: 4,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            position: 'relative',
            overflow: 'hidden',
          }}>
            {/* Product image placeholder */}
            <div style={{
              width: '100%',
              aspectRatio: '1',
              borderRadius: Math.max(config.cardRadius * 0.4, 4),
              background: `linear-gradient(135deg, ${config.accentColor}33, ${config.primaryColor}22)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <div style={{ width: '50%', height: '50%', borderRadius: '50%', background: config.primaryColor, opacity: 0.3 }} />
            </div>
            {/* Sale badge */}
            {i % 3 === 0 && (
              <div style={{
                position: 'absolute',
                top: 3,
                left: 3,
                background: config.badgeSaleBg,
                color: config.badgeSaleText,
                fontSize: 5,
                fontWeight: 700,
                padding: '1px 3px',
                borderRadius: 3,
              }}>
                تخفيض
              </div>
            )}
            {/* Price */}
            <div style={{ height: 4, width: '60%', borderRadius: 2, background: config.primaryColor, marginTop: 1 }} />
            {/* Button */}
            <div style={{
              height: 8,
              borderRadius: 4,
              background: config.primaryColor,
              opacity: 0.85,
              marginTop: 1,
            }} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Color Field ────────────────────────────────────────────────────────────────

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const isGradient = value.includes('gradient') || value.includes('linear') || value.includes('radial');
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-gray-500">{label}</label>
      {isGradient ? (
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full h-9 rounded-lg border border-gray-200 px-2 text-xs font-mono focus:outline-none focus:border-purple-400"
          placeholder="linear-gradient(...)"
        />
      ) : (
        <div className="flex gap-2 items-center">
          <input
            type="color"
            value={value.startsWith('#') ? value : '#888888'}
            onChange={e => onChange(e.target.value)}
            className="w-9 h-9 rounded-lg cursor-pointer border-0 p-0.5 bg-transparent"
          />
          <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            className="flex-1 h-9 rounded-lg border border-gray-200 px-2 text-xs font-mono focus:outline-none focus:border-purple-400"
          />
        </div>
      )}
    </div>
  );
}

// ── Edit Modal ─────────────────────────────────────────────────────────────────

function EditModal({
  theme,
  onSave,
  onClose,
}: {
  theme: Theme | null;
  onSave: (name: string, slug: string, config: ThemeConfig) => void;
  onClose: () => void;
}) {
  const { isRtl } = useTranslation();
  const isNew = !theme;
  const [name, setName] = useState(theme?.name ?? '');
  const [slug, setSlug] = useState(theme?.slug ?? '');
  const [config, setConfig] = useState<ThemeConfig>(theme?.config ?? DEFAULT_CONFIG);
  const [activeTab, setActiveTab] = useState<'general' | 'colors' | 'hero' | 'cards'>('general');

  const set = (key: keyof ThemeConfig, val: string | number) =>
    setConfig(c => ({ ...c, [key]: val }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }}>
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" dir={isRtl ? 'rtl' : 'ltr'}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Palette className="w-5 h-5 text-purple-500" />
            {isNew ? 'ثيم مخصص جديد' : `تعديل: ${theme.name}`}
          </h2>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Left: form */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {/* Tabs */}
            <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
              {(['general', 'colors', 'hero', 'cards'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === tab ? 'bg-white shadow text-purple-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  {tab === 'general' ? 'عام' : tab === 'colors' ? 'ألوان' : tab === 'hero' ? 'البانر' : 'البطاقات'}
                </button>
              ))}
            </div>

            {activeTab === 'general' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">اسم الثيم</label>
                  <input value={name} onChange={e => setName(e.target.value)} placeholder="مثال: وردي ناعم 🌸" className="w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:border-purple-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">المعرّف (slug)</label>
                  <input value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))} placeholder="soft-pink" className="w-full h-9 rounded-lg border border-gray-200 px-3 text-sm font-mono focus:outline-none focus:border-purple-400" dir="ltr" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">خلفية الصفحة</label>
                  <ColorField label="" value={config.pageBg} onChange={v => set('pageBg', v)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">الخط</label>
                  <select value={config.fontFamily} onChange={e => set('fontFamily', e.target.value)} className="w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:border-purple-400">
                    <option value="'Segoe UI', Tahoma, sans-serif">Segoe UI</option>
                    <option value="'Cairo', sans-serif">Cairo</option>
                    <option value="'Tajawal', sans-serif">Tajawal</option>
                    <option value="'Poppins', sans-serif">Poppins</option>
                    <option value="Georgia, serif">Georgia</option>
                    <option value="monospace">Monospace</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">انحناء البطاقات (px)</label>
                  <input type="range" min={0} max={32} value={config.cardRadius} onChange={e => set('cardRadius', parseInt(e.target.value))} className="w-full" />
                  <span className="text-xs text-gray-400">{config.cardRadius}px</span>
                </div>
              </div>
            )}

            {activeTab === 'colors' && (
              <div className="space-y-3">
                <ColorField label="اللون الرئيسي (الأزرار والشارات)" value={config.primaryColor} onChange={v => set('primaryColor', v)} />
                <ColorField label="النص على اللون الرئيسي" value={config.primaryText} onChange={v => set('primaryText', v)} />
                <ColorField label="لون التأكيد (accent)" value={config.accentColor} onChange={v => set('accentColor', v)} />
                <ColorField label="النص على التأكيد" value={config.accentText} onChange={v => set('accentText', v)} />
                <ColorField label="الهيدر (خلفية)" value={config.headerBg} onChange={v => set('headerBg', v)} />
                <ColorField label="الهيدر (الحدود)" value={config.headerBorder} onChange={v => set('headerBorder', v)} />
              </div>
            )}

            {activeTab === 'hero' && (
              <div className="space-y-3">
                <ColorField label="خلفية البانر (gradient أو لون)" value={config.heroBg} onChange={v => set('heroBg', v)} />
                <ColorField label="نص البانر" value={config.heroText} onChange={v => set('heroText', v)} />
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-700">
                  💡 يمكنك كتابة gradient مثل:<br />
                  <code className="font-mono">linear-gradient(135deg,#ff6b9d 0%,#ff9a6c 100%)</code>
                </div>
              </div>
            )}

            {activeTab === 'cards' && (
              <div className="space-y-3">
                <ColorField label="خلفية البطاقة" value={config.cardBg} onChange={v => set('cardBg', v)} />
                <ColorField label="حدود البطاقة" value={config.cardBorder} onChange={v => set('cardBorder', v)} />
                <ColorField label="شارة التخفيض (خلفية)" value={config.badgeSaleBg} onChange={v => set('badgeSaleBg', v)} />
                <ColorField label="شارة التخفيض (نص)" value={config.badgeSaleText} onChange={v => set('badgeSaleText', v)} />
              </div>
            )}
          </div>

          {/* Right: live preview */}
          <div className="w-40 flex-shrink-0 bg-gray-50 border-r border-gray-100 p-3 flex flex-col items-center gap-2">
            <p className="text-xs font-semibold text-gray-400 flex items-center gap-1"><Eye className="w-3 h-3" /> معاينة</p>
            <MiniPreview config={config} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
          <button
            onClick={() => onSave(name, slug, config)}
            disabled={!name.trim() || !slug.trim()}
            className="flex-1 h-10 rounded-xl font-bold text-sm text-white transition-all active:scale-95 disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#7c3aed,#a855f7)' }}
          >
            <Check className="w-4 h-4 inline ml-2" />
            {isNew ? 'إنشاء الثيم' : 'حفظ التغييرات'}
          </button>
          <button onClick={onClose} className="px-5 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold text-sm transition-colors">
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Import JSON Modal ──────────────────────────────────────────────────────────

function ImportModal({ onImport, onClose }: { onImport: (t: { name: string; slug: string; config: ThemeConfig }) => void; onClose: () => void }) {
  const { isRtl } = useTranslation();
  const [json, setJson] = useState('');
  const [err, setErr] = useState('');

  const handle = () => {
    try {
      const parsed = JSON.parse(json);
      if (!parsed.name || !parsed.slug || !parsed.config) throw new Error('الحقول المطلوبة: name, slug, config');
      onImport(parsed);
    } catch (e: any) {
      setErr(e.message || 'JSON غير صحيح');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6" dir={isRtl ? 'rtl' : 'ltr'}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2"><Upload className="w-5 h-5 text-purple-500" /> استيراد ثيم</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center"><X className="w-4 h-4 text-gray-500" /></button>
        </div>
        <p className="text-sm text-gray-500 mb-3">الصق JSON الخاص بالثيم هنا:</p>
        <textarea
          value={json}
          onChange={e => { setJson(e.target.value); setErr(''); }}
          rows={8}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs font-mono focus:outline-none focus:border-purple-400 resize-none"
          placeholder={'{\n  "name": "اسم الثيم",\n  "slug": "theme-slug",\n  "config": { ... }\n}'}
          dir="ltr"
        />
        {err && <p className="text-xs text-red-500 mt-1">{err}</p>}
        <div className="flex gap-3 mt-4">
          <button onClick={handle} disabled={!json.trim()} className="flex-1 h-10 rounded-xl font-bold text-sm text-white disabled:opacity-50" style={{ background: 'linear-gradient(135deg,#7c3aed,#a855f7)' }}>
            <Check className="w-4 h-4 inline ml-2" />استيراد
          </button>
          <button onClick={onClose} className="px-5 h-10 rounded-xl bg-gray-100 text-gray-600 font-semibold text-sm">إلغاء</button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function ThemesPage() {
  const { language, isRtl } = useTranslation();
  const ar = language === 'ar';
  const [themes, setThemes] = useState<Theme[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [editTarget, setEditTarget] = useState<Theme | 'new' | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [toast, setToast] = useState('');
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [gridLayout, setGridLayout] = useState<'2' | '3' | 'explorer'>('2');
  const [gridSaving, setGridSaving] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/beqolky/themes`);
      const data = await r.json();
      setThemes(Array.isArray(data) ? data : []);
    } catch { }
    setLoading(false);
  };

  useEffect(() => {
    load();
    fetch(`${BASE}/api/storefront/grid-layout`)
      .then(r => r.json())
      .then(d => { if (d.layout === '2' || d.layout === '3' || d.layout === 'explorer') setGridLayout(d.layout); })
      .catch(() => {});
  }, []);

  const saveGridLayout = async (val: '2' | '3' | 'explorer') => {
    setGridLayout(val);
    setGridSaving(true);
    const labels: Record<string, string> = { '2': 'عمودين', '3': '3 أعمدة', 'explorer': 'Explorer' };
    try {
      await fetch(`${BASE}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storefrontGridLayout: val }),
      });
      showToast(`✅ تم تغيير الشبكة إلى ${labels[val]}`);
    } catch { showToast('❌ حدث خطأ'); }
    setGridSaving(false);
  };

  const seedThemes = async () => {
    setSeeding(true);
    try {
      const r = await fetch(`${BASE}/api/beqolky/themes/seed`, { method: 'POST' });
      const data = await r.json();
      setThemes(Array.isArray(data) ? data : []);
      showToast('✅ تم تحميل الثيمات الجاهزة');
    } catch { showToast('❌ حدث خطأ'); }
    setSeeding(false);
  };

  const activate = async (id: number) => {
    await fetch(`${BASE}/api/beqolky/themes/${id}/activate`, { method: 'POST' });
    setThemes(prev => prev.map(t => ({ ...t, isActive: t.id === id })));
    showToast('✅ تم تفعيل الثيم');
  };

  const deactivate = async () => {
    await fetch(`${BASE}/api/beqolky/themes/deactivate`, { method: 'POST' });
    setThemes(prev => prev.map(t => ({ ...t, isActive: false })));
    showToast('✅ تم إيقاف تفعيل جميع الثيمات (الثيم الافتراضي)');
  };

  const handleSave = async (name: string, slug: string, config: ThemeConfig) => {
    if (editTarget === 'new') {
      try {
        const r = await fetch(`${BASE}/api/beqolky/themes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, slug, config }),
        });
        const data = await r.json();
        if (data.error) { showToast('❌ ' + data.error); return; }
        setThemes(prev => [...prev, data]);
        showToast('✅ تم إنشاء الثيم');
      } catch { showToast('❌ حدث خطأ'); }
    } else if (editTarget) {
      try {
        const r = await fetch(`${BASE}/api/beqolky/themes/${editTarget.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, slug, config }),
        });
        const data = await r.json();
        setThemes(prev => prev.map(t => t.id === data.id ? data : t));
        showToast('✅ تم حفظ التغييرات');
      } catch { showToast('❌ حدث خطأ'); }
    }
    setEditTarget(null);
  };

  const handleImport = async (parsed: { name: string; slug: string; config: ThemeConfig }) => {
    try {
      const r = await fetch(`${BASE}/api/beqolky/themes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });
      const data = await r.json();
      if (data.error) { showToast('❌ ' + data.error); return; }
      setThemes(prev => [...prev, data]);
      showToast('✅ تم استيراد الثيم');
    } catch { showToast('❌ حدث خطأ'); }
    setShowImport(false);
  };

  const handleDelete = async (id: number) => {
    await fetch(`${BASE}/api/beqolky/themes/${id}`, { method: 'DELETE' });
    setThemes(prev => prev.filter(t => t.id !== id));
    setDeleteId(null);
    showToast('🗑️ تم حذف الثيم');
  };

  const exportTheme = (t: Theme) => {
    const payload = JSON.stringify({ name: t.name, slug: t.slug, config: t.config }, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${t.slug}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('📥 تم تصدير الثيم');
  };

  const activeTheme = themes.find(t => t.isActive);

  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] bg-gray-900 text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-2xl">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Palette className="w-6 h-6 text-purple-500" />
            {ar ? 'ثيمات المتجر' : 'Store Themes'}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {ar ? 'اختر ثيم جذاب لمتجرك أو أنشئ ثيمك المخصص' : 'Choose an attractive theme or create your own'}
            {activeTheme && <span className="mr-2 text-purple-600 font-semibold">• المُفعَّل: {activeTheme.name}</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {activeTheme && (
            <button
              onClick={deactivate}
              className="flex items-center gap-2 px-4 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-semibold transition-colors"
            >
              <X className="w-4 h-4" /> إيقاف الثيم
            </button>
          )}
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 px-4 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-semibold transition-colors"
          >
            <Upload className="w-4 h-4" /> استيراد
          </button>
          {themes.length === 0 && (
            <button
              onClick={seedThemes}
              disabled={seeding}
              className="flex items-center gap-2 px-4 h-9 rounded-xl text-white text-sm font-bold transition-all active:scale-95 disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,#7c3aed,#a855f7)' }}
            >
              {seeding ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
              تحميل الثيمات العالمية
            </button>
          )}
          <button
            onClick={() => setEditTarget('new')}
            className="flex items-center gap-2 px-4 h-9 rounded-xl text-white text-sm font-bold transition-all active:scale-95"
            style={{ background: 'linear-gradient(135deg,#7c3aed,#a855f7)' }}
          >
            <Plus className="w-4 h-4" /> ثيم مخصص
          </button>
        </div>
      </div>

      {/* Reload builtin themes if some exist */}
      {themes.length > 0 && !themes.some(t => t.isBuiltin) && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-purple-50 border border-purple-200">
          <Wand2 className="w-5 h-5 text-purple-500 flex-shrink-0" />
          <p className="text-sm text-purple-700 flex-1">لا توجد ثيمات جاهزة — اضغط لتحميل 15 ثيم عالمي جاهز</p>
          <button onClick={seedThemes} disabled={seeding} className="px-4 h-8 rounded-xl bg-purple-600 text-white text-sm font-bold disabled:opacity-60">
            {seeding ? '...' : 'تحميل الثيمات'}
          </button>
        </div>
      )}

      {/* ── Grid Layout Control ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-purple-200 bg-gradient-to-br from-purple-50 to-pink-50 p-5">
        <div className="flex items-center gap-2 mb-4">
          <LayoutGrid className="w-5 h-5 text-purple-500" />
          <h2 className="font-bold text-gray-800 text-base">شكل عرض المنتجات في المتجر</h2>
          {gridSaving && <RefreshCw className="w-3 h-3 text-purple-400 animate-spin" />}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            {
              value: '2',
              label: 'عمودين',
              desc: 'بطاقات أكبر وأوضح',
              icon: (
                <div className="grid grid-cols-2 gap-1 w-12 h-10">
                  {[0,1,2,3].map(i => <div key={i} className="rounded bg-current opacity-60" />)}
                </div>
              ),
            },
            {
              value: '3',
              label: 'إنستغرام',
              desc: 'صور مربعة 3 أعمدة',
              icon: (
                <div className="grid grid-cols-3 gap-0.5 w-12 h-10">
                  {[0,1,2,3,4,5].map(i => <div key={i} className="bg-current opacity-60" />)}
                </div>
              ),
            },
            {
              value: 'explorer',
              label: 'Explorer',
              desc: 'صور كبيرة Masonry',
              icon: (
                <div className="flex gap-0.5 w-12 h-10">
                  <div className="flex flex-col gap-0.5 flex-1">
                    <div className="bg-current opacity-60 rounded-sm" style={{ flex: 2 }} />
                    <div className="bg-current opacity-40 rounded-sm" style={{ flex: 1 }} />
                  </div>
                  <div className="flex flex-col gap-0.5 flex-1">
                    <div className="bg-current opacity-40 rounded-sm" style={{ flex: 1 }} />
                    <div className="bg-current opacity-60 rounded-sm" style={{ flex: 2 }} />
                  </div>
                  <div className="flex flex-col gap-0.5 flex-1">
                    <div className="bg-current opacity-60 rounded-sm" style={{ flex: 1.5 }} />
                    <div className="bg-current opacity-40 rounded-sm" style={{ flex: 1 }} />
                  </div>
                </div>
              ),
            },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => saveGridLayout(opt.value as '2' | '3' | 'explorer')}
              className={`relative flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${
                gridLayout === opt.value
                  ? 'border-purple-500 bg-purple-600 text-white shadow-lg shadow-purple-200'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-purple-300 hover:bg-purple-50'
              }`}
            >
              {gridLayout === opt.value && (
                <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-white/30 flex items-center justify-center">
                  <Check className="w-3 h-3" />
                </div>
              )}
              {opt.icon}
              <span className="font-bold text-sm">{opt.label}</span>
              <span className={`text-xs ${gridLayout === opt.value ? 'text-purple-200' : 'text-gray-400'}`}>{opt.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Reload button when themes exist */}
      {themes.length > 0 && (
        <button
          onClick={seedThemes}
          disabled={seeding}
          className="flex items-center gap-2 text-xs text-gray-400 hover:text-purple-500 transition-colors"
        >
          <RefreshCw className={`w-3 h-3 ${seeding ? 'animate-spin' : ''}`} />
          تحديث الثيمات الافتراضية (إضافة الجديدة فقط)
        </button>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="w-8 h-8 text-purple-400 animate-spin" />
        </div>
      )}

      {/* Empty */}
      {!loading && themes.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="w-16 h-16 rounded-2xl bg-purple-100 flex items-center justify-center">
            <Palette className="w-8 h-8 text-purple-400" />
          </div>
          <p className="text-gray-500 font-medium">لا توجد ثيمات بعد</p>
          <button
            onClick={seedThemes}
            disabled={seeding}
            className="flex items-center gap-2 px-6 h-10 rounded-xl text-white text-sm font-bold"
            style={{ background: 'linear-gradient(135deg,#7c3aed,#a855f7)' }}
          >
            {seeding ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            تحميل 15 ثيم عالمي جاهز
          </button>
        </div>
      )}

      {/* Themes Grid */}
      {!loading && themes.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {themes.map(t => (
            <div
              key={t.id}
              className={`relative rounded-2xl border-2 overflow-hidden transition-all group ${t.isActive ? 'border-purple-500 shadow-lg shadow-purple-200' : 'border-gray-200 hover:border-purple-300'}`}
            >
              {/* Active badge */}
              {t.isActive && (
                <div className="absolute top-2 right-2 z-10 w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center shadow">
                  <Check className="w-3.5 h-3.5 text-white" />
                </div>
              )}

              {/* Builtin badge */}
              {t.isBuiltin && (
                <div className="absolute top-2 left-2 z-10 px-1.5 py-0.5 rounded bg-black/30 backdrop-blur text-white text-[9px] font-bold">
                  جاهز
                </div>
              )}

              {/* Preview */}
              <div className="p-2 cursor-pointer" onClick={() => setPreviewId(previewId === t.id ? null : t.id)}>
                <MiniPreview config={t.config} />
              </div>

              {/* Name */}
              <div className="px-3 pb-2">
                <p className="text-xs font-bold text-gray-800 truncate">{t.name}</p>
              </div>

              {/* Actions */}
              <div className="px-2 pb-2 flex gap-1">
                {t.isActive ? (
                  <button
                    onClick={deactivate}
                    className="flex-1 h-7 rounded-lg text-[11px] font-bold transition-all bg-purple-600 text-white"
                  >
                    ✓ مُفعَّل
                  </button>
                ) : (
                  <button
                    onClick={() => activate(t.id)}
                    className="flex-1 h-7 rounded-lg text-[11px] font-bold transition-all bg-gray-100 hover:bg-purple-600 hover:text-white text-gray-600"
                  >
                    تفعيل
                  </button>
                )}
                <button
                  onClick={() => exportTheme(t)}
                  className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-blue-100 flex items-center justify-center transition-colors"
                  title="تصدير"
                >
                  <Download className="w-3 h-3 text-gray-500 hover:text-blue-600" />
                </button>
                {!t.isBuiltin && (
                  <>
                    <button
                      onClick={() => setEditTarget(t)}
                      className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-amber-100 flex items-center justify-center transition-colors"
                      title="تعديل"
                    >
                      <Edit3 className="w-3 h-3 text-gray-500" />
                    </button>
                    <button
                      onClick={() => setDeleteId(t.id)}
                      className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-red-100 flex items-center justify-center transition-colors"
                      title="حذف"
                    >
                      <Trash2 className="w-3 h-3 text-gray-500 hover:text-red-500" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirm */}
      {deleteId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }}>
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 text-center" dir={isRtl ? 'rtl' : 'ltr'}>
            <div className="w-14 h-14 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-7 h-7 text-red-500" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">حذف الثيم</h3>
            <p className="text-sm text-gray-500 mb-6">هل أنت متأكد من حذف هذا الثيم؟ لا يمكن التراجع.</p>
            <div className="flex gap-3">
              <button onClick={() => handleDelete(deleteId)} className="flex-1 h-10 rounded-xl bg-red-500 text-white font-bold text-sm">حذف</button>
              <button onClick={() => setDeleteId(null)} className="flex-1 h-10 rounded-xl bg-gray-100 text-gray-600 font-semibold text-sm">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit / New Modal */}
      {editTarget !== null && (
        <EditModal
          theme={editTarget === 'new' ? null : editTarget}
          onSave={handleSave}
          onClose={() => setEditTarget(null)}
        />
      )}

      {/* Import Modal */}
      {showImport && (
        <ImportModal onImport={handleImport} onClose={() => setShowImport(false)} />
      )}
    </div>
  );
}
