import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '@/lib/i18n';
import { useGetSettings, useUpdateSettings } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle, Button, Input } from '@/components/ui-custom';
import { Save, Bot, Key, PhoneCall, Loader2, Download, Upload, CheckCircle2, AlertCircle, Bell, RefreshCw, Lock, Eye, EyeOff, Copy, ShieldCheck, Trash2, Zap, Clock, ArrowDown } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

// ── TickerSection ──────────────────────────────────────────────────────────
interface TickerMsg { id: string; text: string; active: boolean; }
const TICKER_COLOR_DEFAULTS = { bg: '#f59e0b', text: '#ffffff' };
const NOTES_COLOR_DEFAULTS  = { bg: '#eff6ff', text: '#1e40af' };

function TickerSection() {
  const [msgs, setMsgs] = useState<TickerMsg[]>([]);
  const [newText, setNewText] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [colors, setColors] = useState(TICKER_COLOR_DEFAULTS);

  useEffect(() => {
    fetch(`${BASE}/api/settings`)
      .then(r => r.json())
      .then(d => {
        try { setMsgs(d.tickerMessages ? JSON.parse(d.tickerMessages) : []); } catch { setMsgs([]); }
        try { if (d.tickerColors) setColors({ ...TICKER_COLOR_DEFAULTS, ...JSON.parse(d.tickerColors) }); } catch {}
      })
      .catch(() => {});
  }, []);

  const save = async (updated: TickerMsg[]) => {
    setSaving(true);
    try {
      await fetch(`${BASE}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickerMessages: JSON.stringify(updated), tickerColors: JSON.stringify(colors) }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally { setSaving(false); }
  };

  const saveColors = async (c: typeof colors) => {
    setColors(c);
    await fetch(`${BASE}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tickerColors: JSON.stringify(c) }),
    }).catch(() => {});
  };

  const addMsg = () => {
    const trimmed = newText.trim();
    if (!trimmed) return;
    const updated = [...msgs, { id: Date.now().toString(), text: trimmed, active: true }];
    setMsgs(updated);
    setNewText('');
    save(updated);
  };

  const toggleActive = (id: string) => {
    const updated = msgs.map(m => m.id === id ? { ...m, active: !m.active } : m);
    setMsgs(updated);
    save(updated);
  };

  const deleteMsg = (id: string) => {
    const updated = msgs.filter(m => m.id !== id);
    setMsgs(updated);
    save(updated);
  };

  const activeCount = msgs.filter(m => m.active).length;

  return (
    <Card className="relative overflow-hidden border-0 shadow-xl bg-white/5 backdrop-blur-xl">
      <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 via-transparent to-orange-500/5 pointer-events-none" />
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Bell className="w-5 h-5 text-amber-400" />
          شريط الأخبار والتنبيهات
          {activeCount > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full font-normal" style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }}>
              {activeCount} نشط
            </span>
          )}
        </CardTitle>
        <p className="text-sm text-muted-foreground">يظهر شريط متحرك أعلى المتجر يعرض رسائلك المختصرة</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <style>{`@keyframes tickerScroll { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }`}</style>

        {/* Color pickers */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">🎨 ألوان شريط الأخبار</p>
          {([
            { key: 'bg' as const, label: 'لون الخلفية', def: TICKER_COLOR_DEFAULTS.bg },
            { key: 'text' as const, label: 'لون الكتابة', def: TICKER_COLOR_DEFAULTS.text },
          ]).map(({ key, label, def }) => (
            <div key={key} className="flex items-center gap-3">
              <span className="text-sm flex-1">{label}</span>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg border border-white/20 overflow-hidden cursor-pointer relative" style={{ background: colors[key] }}>
                  <input type="color" value={colors[key]} onChange={e => saveColors({ ...colors, [key]: e.target.value })} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                </div>
                <span className="text-xs font-mono text-muted-foreground">{colors[key]}</span>
                <button type="button" onClick={() => saveColors({ ...colors, [key]: def })} className="text-xs text-muted-foreground hover:text-white px-1.5 py-0.5 rounded border border-white/10 hover:border-white/25 transition-colors" title="إعادة ضبط">↺</button>
              </div>
            </div>
          ))}
        </div>

        {/* Live preview */}
        {activeCount > 0 && (
          <div className="rounded-xl overflow-hidden border border-amber-500/20">
            <div className="flex items-center gap-0 h-9 overflow-hidden" style={{ background: colors.bg }}>
              <div className="flex-shrink-0 px-3 flex items-center gap-1.5 h-full border-l h-full" style={{ borderColor: `${colors.text}30`, background: 'rgba(0,0,0,0.12)' }}>
                <span className="text-xs font-bold tracking-wide" style={{ color: colors.text }}>📢 إشعارات</span>
              </div>
              <div className="flex-1 overflow-hidden">
                <div className="whitespace-nowrap text-xs font-medium" style={{ animation: 'tickerScroll 20s linear infinite', display: 'inline-block', paddingRight: '40px', color: colors.text }}>
                  {msgs.filter(m => m.active).map(m => m.text).join('  ·  🌟  ·  ')}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Message list */}
        <div className="space-y-2">
          {msgs.length === 0 && (
            <div className="text-center py-6 text-muted-foreground text-sm">
              لا توجد رسائل. أضف رسالتك الأولى!
            </div>
          )}
          {msgs.map((m) => (
            <div key={m.id} className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${m.active ? 'border-amber-500/20 bg-amber-500/5' : 'border-white/5 bg-white/2 opacity-60'}`}>
              <button
                type="button"
                onClick={() => toggleActive(m.id)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none ${m.active ? 'bg-amber-500' : 'bg-gray-600'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${m.active ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
              <p className="flex-1 text-sm" dir="rtl">{m.text}</p>
              <button
                type="button"
                onClick={() => deleteMsg(m.id)}
                className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-red-500/20 transition-colors group flex-shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5 text-muted-foreground group-hover:text-red-400" />
              </button>
            </div>
          ))}
        </div>

        {/* Add new */}
        <div className="flex gap-2">
          <input
            type="text"
            value={newText}
            onChange={e => setNewText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addMsg()}
            placeholder="اكتب رسالة جديدة واضغط Enter أو +"
            className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 bg-white/5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all"
            dir="rtl"
            maxLength={120}
          />
          <button
            type="button"
            onClick={addMsg}
            disabled={!newText.trim() || saving}
            className="px-4 py-2.5 rounded-xl font-bold text-sm transition-all disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#f59e0b 0%,#d97706 100%)', color: '#fff' }}
          >
            {saving ? '...' : '+'}
          </button>
        </div>

        {saved && (
          <p className="text-xs text-green-400 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> تم الحفظ تلقائياً
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ── StorefrontNotesSection ─────────────────────────────────────────────────
function StorefrontNotesSection() {
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [colors, setColors] = useState(NOTES_COLOR_DEFAULTS);

  useEffect(() => {
    fetch(`${BASE}/api/settings`)
      .then(r => r.json())
      .then(d => {
        setNotes(d.storefrontNotes ?? '');
        try { if (d.notesColors) setColors({ ...NOTES_COLOR_DEFAULTS, ...JSON.parse(d.notesColors) }); } catch {}
      })
      .catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await fetch(`${BASE}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storefrontNotes: notes, notesColors: JSON.stringify(colors) }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally { setSaving(false); }
  };

  const saveColors = async (c: typeof colors) => {
    setColors(c);
    await fetch(`${BASE}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notesColors: JSON.stringify(c) }),
    }).catch(() => {});
  };

  return (
    <Card className="relative overflow-hidden border-0 shadow-xl bg-white/5 backdrop-blur-xl">
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-transparent to-indigo-500/5 pointer-events-none" />
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <span className="text-blue-400">📝</span>
          ملاحظات المتجر
        </CardTitle>
        <p className="text-sm text-muted-foreground">تظهر لكل زبائن المتجر أسفل شريط الأخبار — استخدمها لأوقات العمل أو تنبيهات مؤقتة</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
          placeholder="مثال: نعمل من 10 صباحاً حتى 10 مساءً · الجمعة إجازة"
          className="w-full px-4 py-3 rounded-xl border border-white/10 bg-white/5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all resize-none"
          dir="rtl"
          maxLength={300}
        />

        {/* Color pickers */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">🎨 ألوان بوكس الملاحظة</p>
          {([
            { key: 'bg' as const, label: 'لون الخلفية', def: NOTES_COLOR_DEFAULTS.bg },
            { key: 'text' as const, label: 'لون الكتابة', def: NOTES_COLOR_DEFAULTS.text },
          ]).map(({ key, label, def }) => (
            <div key={key} className="flex items-center gap-3">
              <span className="text-sm flex-1">{label}</span>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg border border-white/20 overflow-hidden cursor-pointer relative" style={{ background: colors[key] }}>
                  <input type="color" value={colors[key]} onChange={e => saveColors({ ...colors, [key]: e.target.value })} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                </div>
                <span className="text-xs font-mono text-muted-foreground">{colors[key]}</span>
                <button type="button" onClick={() => saveColors({ ...colors, [key]: def })} className="text-xs text-muted-foreground hover:text-white px-1.5 py-0.5 rounded border border-white/10 hover:border-white/25 transition-colors" title="إعادة ضبط">↺</button>
              </div>
            </div>
          ))}
          {/* Preview */}
          {notes && (
            <div className="mt-2 flex items-start gap-2 rounded-xl px-3 py-2 text-sm font-medium" style={{ background: colors.bg, color: colors.text }}>
              <span className="text-base flex-shrink-0">📝</span>
              <span className="leading-relaxed text-xs">{notes}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{notes.length}/300</span>
          <div className="flex items-center gap-3">
            {saved && (
              <span className="flex items-center gap-1 text-xs text-green-400">
                <CheckCircle2 className="w-3.5 h-3.5" /> تم الحفظ
              </span>
            )}
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="px-5 py-2 rounded-xl font-bold text-sm transition-all disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)', color: '#fff' }}
            >
              {saving ? '...' : 'حفظ'}
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── TutorialVideoSection ───────────────────────────────────────────────────
function TutorialVideoSection() {
  const [url, setUrl] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`${BASE}/api/settings`)
      .then(r => r.json())
      .then((d: any) => {
        if (d.tutorialVideoUrl) setUrl(d.tutorialVideoUrl);
        setEnabled(!!d.tutorialVideoEnabled);
      })
      .catch(() => {});
  }, []);

  const patch = async (fields: Record<string, unknown>) => {
    setSaving(true);
    try {
      await fetch(`${BASE}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally { setSaving(false); }
  };

  const toggleEnabled = async (v: boolean) => {
    setEnabled(v);
    await patch({ tutorialVideoEnabled: v });
  };

  return (
    <Card className="relative overflow-hidden border-0 shadow-xl bg-white/5 backdrop-blur-xl">
      <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 via-transparent to-amber-500/5 pointer-events-none" />
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <span className="text-orange-400">🎬</span>
            فيديو تعليمي للزبائن
          </CardTitle>
          {/* Enable/Disable toggle */}
          <button
            type="button"
            onClick={() => toggleEnabled(!enabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none ${enabled ? 'bg-orange-500' : 'bg-gray-600'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          ارفعي الفيديو على صفحتك بالفيسبوك، ثم انسخي رابط المنشور وضعيه هنا — يُرسل تلقائياً لكل زبون عند بداية المحادثة
        </p>
      </CardHeader>
      <CardContent className={`space-y-3 transition-opacity ${enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
        <input
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://www.facebook.com/reel/..."
          dir="ltr"
          className="w-full px-4 py-2.5 rounded-xl border border-white/10 bg-white/5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all"
        />
        {url && (
          <p className="text-xs text-muted-foreground truncate" dir="ltr">{url}</p>
        )}
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">اتركيه فارغاً إذا لا تريدين إرسال فيديو</p>
          <div className="flex items-center gap-3">
            {saved && (
              <span className="flex items-center gap-1 text-xs text-green-400">
                <CheckCircle2 className="w-3.5 h-3.5" /> تم الحفظ
              </span>
            )}
            <button
              type="button"
              onClick={() => patch({ tutorialVideoUrl: url })}
              disabled={saving}
              className="px-5 py-2 rounded-xl font-bold text-sm transition-all disabled:opacity-50 flex items-center gap-2"
              style={{ background: 'linear-gradient(135deg,#f97316,#ea580c)', color: '#fff' }}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? '...' : 'حفظ'}
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── TutorialImagesSection ──────────────────────────────────────────────────
interface TutorialStep { text: string; images: string[]; }

function TutorialImagesSection() {
  const [steps, setSteps] = useState<TutorialStep[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null); // "stepIdx"
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    fetch(`${BASE}/api/settings`)
      .then(r => r.json())
      .then((d: any) => {
        try {
          if (d.tutorialImages) {
            const parsed = JSON.parse(d.tutorialImages);
            if (Array.isArray(parsed)) {
              if (typeof parsed[0] === 'string') {
                // oldest format: string[]
                setSteps(parsed.map((url: string) => ({ text: '', images: [url] })));
              } else if (parsed[0] && 'imageUrl' in parsed[0]) {
                // previous format: {text, imageUrl}[]
                setSteps(parsed.map((s: any) => ({ text: s.text || '', images: s.imageUrl ? [s.imageUrl] : [] })));
              } else {
                // current format: {text, images}[]
                setSteps(parsed.map((s: any) => ({ text: s.text || '', images: Array.isArray(s.images) ? s.images : [] })));
              }
            }
          }
        } catch {}
        setEnabled(!!d.tutorialImagesEnabled);
      })
      .catch(() => {});
  }, []);

  const persist = async (s: TutorialStep[]) => {
    setSaving(true);
    try {
      await fetch(`${BASE}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tutorialImages: JSON.stringify(s) }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally { setSaving(false); }
  };

  const toggleEnabled = async (v: boolean) => {
    setEnabled(v);
    setSaving(true);
    try {
      await fetch(`${BASE}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tutorialImagesEnabled: v }),
      });
    } finally { setSaving(false); }
  };

  const addStep = () => {
    const updated = [...steps, { text: '', images: [] }];
    setSteps(updated);
  };

  const updateText = (idx: number, text: string) => {
    setSteps(prev => prev.map((s, i) => i === idx ? { ...s, text } : s));
  };

  const saveAll = async (s?: TutorialStep[]) => {
    await persist(s ?? steps);
  };

  const removeStep = async (idx: number) => {
    const updated = steps.filter((_, i) => i !== idx);
    setSteps(updated);
    await persist(updated);
  };

  const moveUp = async (idx: number) => {
    if (idx === 0) return;
    const updated = [...steps];
    [updated[idx - 1], updated[idx]] = [updated[idx], updated[idx - 1]];
    setSteps(updated);
    await persist(updated);
  };

  const moveDown = async (idx: number) => {
    if (idx === steps.length - 1) return;
    const updated = [...steps];
    [updated[idx], updated[idx + 1]] = [updated[idx + 1], updated[idx]];
    setSteps(updated);
    await persist(updated);
  };

  const uploadImage = async (stepIdx: number, file: File) => {
    const key = `${stepIdx}`;
    setUploadingKey(key);
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
      const data = await res.json();
      if (data.url) {
        const updated = steps.map((s, i) => i === stepIdx ? { ...s, images: [...s.images, data.url] } : s);
        setSteps(updated);
        await persist(updated);
      }
    } finally { setUploadingKey(null); }
  };

  const removeImage = async (stepIdx: number, imgIdx: number) => {
    const updated = steps.map((s, i) =>
      i === stepIdx ? { ...s, images: s.images.filter((_, j) => j !== imgIdx) } : s
    );
    setSteps(updated);
    await persist(updated);
  };

  return (
    <Card className="relative overflow-hidden border-0 shadow-xl bg-white/5 backdrop-blur-xl">
      <div className="absolute inset-0 bg-gradient-to-br from-violet-500/10 via-transparent to-purple-500/5 pointer-events-none" />
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <span className="text-violet-400">🖼️</span>
            رسائل تعليمية للزبائن
            {steps.length > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full font-normal bg-violet-500/15 text-violet-300">
                {steps.length} رسالة
              </span>
            )}
          </CardTitle>
          <button
            type="button"
            onClick={() => toggleEnabled(!enabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none ${enabled ? 'bg-violet-500' : 'bg-gray-600'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          كل رسالة: نص فوق + صورة تحت — تُرسل للزبون واحدة بعد الأخرى عند بداية المحادثة
        </p>
      </CardHeader>

      <CardContent className={`space-y-3 transition-opacity ${enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>

        {steps.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-3">لا توجد رسائل — اضغطي "إضافة رسالة"</p>
        )}

        {steps.map((step, idx) => (
          <div key={idx} className="rounded-2xl border border-violet-500/20 bg-white/3 overflow-hidden">

            {/* ── Header bar ── */}
            <div className="flex items-center justify-between px-3 py-2 bg-violet-500/10 border-b border-violet-500/15">
              <span className="text-xs font-bold text-violet-300 tracking-wide">رسالة {idx + 1}</span>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => moveUp(idx)} disabled={idx === 0}
                  className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-white/10 disabled:opacity-20 text-xs text-white/50">↑</button>
                <button type="button" onClick={() => moveDown(idx)} disabled={idx === steps.length - 1}
                  className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-white/10 disabled:opacity-20 text-xs text-white/50">↓</button>
                <button type="button" onClick={() => removeStep(idx)}
                  className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-red-500/20 group">
                  <Trash2 className="w-3 h-3 text-white/30 group-hover:text-red-400" />
                </button>
              </div>
            </div>

            {/* ── النص ── */}
            <div className="px-3 pt-3 pb-2">
              <p className="text-[10px] font-semibold text-violet-400/70 uppercase tracking-widest mb-1.5">📝 النص</p>
              <textarea
                value={step.text}
                onChange={e => updateText(idx, e.target.value)}
                onBlur={() => saveAll()}
                placeholder="اكتبي النص هنا... (اتركيه فارغاً للصورة فقط)"
                rows={2}
                dir="rtl"
                className="w-full px-3 py-2 rounded-xl border border-white/10 bg-black/25 text-sm text-white/85 placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-violet-500/50 resize-none"
              />
            </div>

            {/* ── فاصل ── */}
            <div className="mx-3 border-t border-white/5" />

            {/* ── الصور (شبكة 2×n) ── */}
            <div className="px-3 pb-3 pt-2">
              <p className="text-[10px] font-semibold text-violet-400/70 uppercase tracking-widest mb-2">🖼️ الصور</p>

              {/* Hidden file input per step */}
              <input
                ref={el => { fileRefs.current[`${idx}`] = el; }}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={async e => {
                  if (!e.target.files) return;
                  for (const file of Array.from(e.target.files)) {
                    await uploadImage(idx, file);
                  }
                  e.target.value = '';
                }}
              />

              {/* 2-column image grid */}
              {step.images.length > 0 && (
                <div className="grid grid-cols-2 gap-2 mb-2">
                  {step.images.map((url, imgIdx) => (
                    <div key={url + imgIdx} className="relative group rounded-xl overflow-hidden border border-white/10 aspect-[9/16]">
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeImage(idx, imgIdx)}
                        className="absolute top-1 left-1 w-6 h-6 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/80"
                      >
                        <Trash2 className="w-3 h-3 text-white" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add images button */}
              <button
                type="button"
                onClick={() => fileRefs.current[`${idx}`]?.click()}
                disabled={uploadingKey === `${idx}`}
                className="w-full py-2 rounded-xl border border-dashed border-violet-500/25 hover:border-violet-500/50 bg-violet-500/5 hover:bg-violet-500/10 transition-all text-xs text-violet-400/80 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {uploadingKey === `${idx}`
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> جاري الرفع...</>
                  : <><span>📷</span> {step.images.length > 0 ? 'إضافة صور أخرى' : 'إضافة صور (اختياري)'}</>}
              </button>
            </div>
          </div>
        ))}

        {/* Add message button */}
        <button
          type="button"
          onClick={addStep}
          className="w-full py-2.5 rounded-xl border-2 border-dashed border-violet-500/30 hover:border-violet-500/60 bg-violet-500/5 hover:bg-violet-500/10 transition-all text-sm text-violet-300 flex items-center justify-center gap-2"
        >
          <span className="text-base">+</span> إضافة رسالة
        </button>

        {(saving || saved) && (
          <p className={`text-xs flex items-center gap-1 ${saved ? 'text-green-400' : 'text-muted-foreground'}`}>
            {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> جاري الحفظ...</>
              : <><CheckCircle2 className="w-3.5 h-3.5" /> تم الحفظ</>}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ── ButtonAnimationSection ─────────────────────────────────────────────────
type BtnAnim = 'static' | 'neon-trace' | 'glass-shimmer' | 'pulse';
interface BtnAnimations { cart: BtnAnim; chat: BtnAnim; whatsapp: BtnAnim; fab: BtnAnim; cartColor?: string; chatColor?: string; }

const ANIM_CHIPS: { value: BtnAnim; label: string; icon: string }[] = [
  { value: 'static',        label: 'ثابت',       icon: '⬜' },
  { value: 'neon-trace',    label: 'أفعى',        icon: '🐍' },
  { value: 'glass-shimmer', label: 'زجاج',        icon: '✨' },
  { value: 'pulse',         label: 'نبضة',        icon: '💚' },
];

const BTN_DEFS: { key: keyof BtnAnimations; label: string; icon: string; bg: string; neonColor: string; radius: number }[] = [
  { key: 'cart',     label: 'زر السلة',    icon: '🛒', bg: '#22c55e',                                    neonColor: '#4ade80', radius: 11 },
  { key: 'chat',     label: 'زر الدردشة', icon: '💬', bg: '#1877f2',                                    neonColor: '#60a5fa', radius: 11 },
  { key: 'whatsapp', label: 'زر واتساب',  icon: '📱', bg: 'linear-gradient(135deg,#128c7e,#25d366)',    neonColor: '#ffd700', radius: 16 },
  { key: 'fab',      label: 'الزر الدائري العائم', icon: '💬', bg: 'linear-gradient(135deg,#1877f2,#0d65d9)',    neonColor: '#ff2d78', radius: 28 },
];

function PreviewSnakeColored({ children, color, radius }: { children: React.ReactNode; color: string; radius: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [sz, setSz] = useState<{w:number;h:number}|null>(null);
  const id = useRef(`ps${Math.random().toString(36).slice(2,6)}`).current;
  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const m = () => setSz({ w: el.offsetWidth, h: el.offsetHeight });
    m();
    const ro = new ResizeObserver(m);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const r = radius;
  const perim = sz ? 2*(sz.w-2*r+sz.h-2*r)+2*Math.PI*r : 0;
  const snakeLen = perim * 0.28;
  const pad = 1.5;
  return (
    <div ref={ref} style={{ position:'relative', display:'inline-block', width:'100%' }}>
      {sz && perim > 0 && (
        <>
          <style>{`@keyframes ${id}{from{stroke-dashoffset:0}to{stroke-dashoffset:-${perim}}}`}</style>
          <svg style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none',overflow:'visible',zIndex:2}} viewBox={`0 0 ${sz.w} ${sz.h}`}>
            <rect x={pad} y={pad} width={sz.w-2*pad} height={sz.h-2*pad} rx={r} ry={r} fill="none" stroke={color} strokeWidth={2.5} strokeDasharray={`${snakeLen} ${perim-snakeLen}`} strokeDashoffset={0} style={{animation:`${id} 2.5s linear infinite`,filter:`drop-shadow(0 0 3px ${color}) drop-shadow(0 0 6px ${color})`}} />
          </svg>
        </>
      )}
      {children}
    </div>
  );
}

const DEFAULT_ANIMS: BtnAnimations = { cart: 'static', chat: 'static', whatsapp: 'neon-trace', fab: 'neon-trace', cartColor: '#22c55e', chatColor: '#1877f2' };

function ButtonAnimationSection() {
  const [anims, setAnims] = useState<BtnAnimations>(DEFAULT_ANIMS);
  const [focused, setFocused] = useState<keyof BtnAnimations>('whatsapp');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`${BASE}/api/settings`)
      .then(r => r.json())
      .then((d: any) => {
        if (d.btnAnimations) {
          try { setAnims({ ...DEFAULT_ANIMS, ...JSON.parse(d.btnAnimations) }); } catch {}
        } else if (d.btnAnimationType) {
          setAnims({ ...DEFAULT_ANIMS, whatsapp: d.btnAnimationType as BtnAnim });
        }
      })
      .catch(() => {});
  }, []);

  const setAnim = (key: keyof BtnAnimations, val: BtnAnim) => {
    setAnims(prev => ({ ...prev, [key]: val }));
    setFocused(key);
  };

  const save = async () => {
    setSaving(true);
    try {
      await fetch(`${BASE}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ btnAnimations: JSON.stringify(anims), btnAnimationType: anims.whatsapp }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally { setSaving(false); }
  };

  const BTN_COLORS: { key: 'cartColor' | 'chatColor'; label: string; icon: string; default: string }[] = [
    { key: 'cartColor', label: 'لون زر السلة', icon: '🛒', default: '#22c55e' },
    { key: 'chatColor', label: 'لون زر الدردشة', icon: '💬', default: '#1877f2' },
  ];

  const focusedDef = BTN_DEFS.find(b => b.key === focused)!;
  const focusedAnim = anims[focused];

  const previewBtn = () => {
    // FAB: render as circular button (matches storefront appearance)
    if (focused === 'fab') {
      const fabInner = (
        <div className="flex justify-center">
          <button
            type="button"
            className={`w-14 h-14 rounded-full text-white flex items-center justify-center pointer-events-none${focusedAnim === 'glass-shimmer' ? ' btn-glass-shimmer' : focusedAnim === 'pulse' ? ' btn-pulse' : ''}`}
            style={{ background: focusedDef.bg, boxShadow: '0 4px 20px rgba(24,119,242,0.45)' }}
          >
            <span style={{fontSize:24}}>💬</span>
          </button>
        </div>
      );
      if (focusedAnim === 'neon-trace') {
        return (
          <div className="flex justify-center">
            <div className="relative inline-flex">
              {/* Custom circular neon ring */}
              <svg style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none',overflow:'visible',zIndex:2}}>
                <style>{`.fab-ring{animation:fabRing 2.5s linear infinite}@keyframes fabRing{from{stroke-dashoffset:0}to{stroke-dashoffset:-176}}`}</style>
                <circle cx="28" cy="28" r="27" fill="none" stroke={focusedDef.neonColor} strokeWidth="2.5"
                  strokeDasharray="50 126" strokeDashoffset="0"
                  className="fab-ring"
                  style={{filter:`drop-shadow(0 0 3px ${focusedDef.neonColor}) drop-shadow(0 0 6px ${focusedDef.neonColor})`}} />
              </svg>
              <button
                type="button"
                className={`w-14 h-14 rounded-full text-white flex items-center justify-center pointer-events-none`}
                style={{ background: focusedDef.bg, boxShadow: '0 4px 20px rgba(24,119,242,0.45)' }}
              >
                <span style={{fontSize:24}}>💬</span>
              </button>
            </div>
          </div>
        );
      }
      return fabInner;
    }

    const inner = (
      <button
        type="button"
        className={`w-full h-[52px] text-white font-extrabold text-sm flex items-center justify-center gap-2 px-4 pointer-events-none${focusedAnim === 'glass-shimmer' ? ' btn-glass-shimmer' : focusedAnim === 'pulse' ? ' btn-pulse' : ''}`}
        style={{ background: focusedDef.bg, borderRadius: focusedDef.radius, boxShadow: '0 4px 18px rgba(0,0,0,0.25)' }}
      >
        <span style={{fontSize:18}}>{focusedDef.icon}</span>
        <span>{focusedDef.label}</span>
      </button>
    );
    if (focusedAnim === 'neon-trace') {
      return <PreviewSnakeColored color={focusedDef.neonColor} radius={focusedDef.radius}>{inner}</PreviewSnakeColored>;
    }
    return inner;
  };

  return (
    <Card className="relative overflow-hidden border-0 shadow-xl bg-white/5 backdrop-blur-xl">
      <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/10 via-transparent to-green-500/5 pointer-events-none" />
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <span style={{fontSize:20}}>🎨</span>
          نمط أزرار المتجر
        </CardTitle>
        <p className="text-sm text-muted-foreground">اختر حركة كل زر بشكل منفصل</p>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* Per-button rows */}
        {BTN_DEFS.map(btn => (
          <div
            key={btn.key}
            onClick={() => setFocused(btn.key)}
            className={`rounded-2xl border-2 p-3 transition-all cursor-pointer ${focused === btn.key ? 'border-yellow-400/60 bg-yellow-500/10' : 'border-white/10 bg-white/5 hover:border-white/20'}`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span style={{fontSize:16}}>{btn.icon}</span>
              <span className="text-sm font-bold">{btn.label}</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {ANIM_CHIPS.map(chip => (
                <button
                  key={chip.value}
                  type="button"
                  onClick={e => { e.stopPropagation(); setAnim(btn.key, chip.value); }}
                  className={`flex flex-col items-center gap-0.5 py-2 px-1 rounded-xl border text-xs font-semibold transition-all ${anims[btn.key] === chip.value ? 'border-yellow-400/80 bg-yellow-500/20 text-yellow-300' : 'border-white/10 bg-white/5 text-muted-foreground hover:border-white/25'}`}
                >
                  <span style={{fontSize:14}}>{chip.icon}</span>
                  <span style={{fontSize:10}}>{chip.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* Button Colors */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">🎨 ألوان أزرار المنتجات</p>
          {BTN_COLORS.map(({ key, label, icon, default: def }) => (
            <div key={key} className="flex items-center gap-3">
              <span className="text-sm flex-1">{icon} {label}</span>
              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded-lg border border-white/20 overflow-hidden cursor-pointer relative"
                  style={{ background: anims[key] ?? def }}
                  title={label}
                >
                  <input
                    type="color"
                    value={anims[key] ?? def}
                    onChange={e => setAnims(prev => ({ ...prev, [key]: e.target.value }))}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                </div>
                <span className="text-xs font-mono text-muted-foreground">{anims[key] ?? def}</span>
                <button
                  type="button"
                  onClick={() => setAnims(prev => ({ ...prev, [key]: def }))}
                  className="text-xs text-muted-foreground hover:text-white transition-colors px-1.5 py-0.5 rounded border border-white/10 hover:border-white/25"
                  title="إعادة ضبط"
                >↺</button>
              </div>
            </div>
          ))}
        </div>

        {/* Live preview */}
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest text-center">معاينة — {focusedDef.label}</p>
          <div className="px-2">{previewBtn()}</div>
          <p className="text-[11px] text-muted-foreground text-center">
            {ANIM_CHIPS.find(c => c.value === focusedAnim)?.icon} {ANIM_CHIPS.find(c => c.value === focusedAnim)?.label}
          </p>
        </div>

        {/* Save */}
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all active:scale-95 disabled:opacity-60"
          style={{ background:'linear-gradient(135deg,#d97706,#f59e0b)' }}
        >
          {saving
            ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> جارٍ الحفظ...</span>
            : saved ? '✅ تم الحفظ!' : '💾 حفظ الأنماط'}
        </button>
      </CardContent>
    </Card>
  );
}

// ─── PWA Arrow Section ────────────────────────────────────────────────────────
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

const PWA_DEFAULTS: PwaArrowCfg = {
  enabled: true, color: '#22c55e', size: 90, duration: 3, animation: 'bounce-down',
};

const ANIM_OPTIONS: { value: PwaArrowAnim; label: string; emoji: string }[] = [
  { value: 'bounce-down', label: 'يرتد من الأعلى',   emoji: '⬇️' },
  { value: 'slide-right', label: 'يدخل من اليسار',   emoji: '➡️' },
  { value: 'slide-left',  label: 'يدخل من اليمين',   emoji: '⬅️' },
  { value: 'swing',       label: 'يتأرجح',           emoji: '🔄' },
  { value: 'shake-h',     label: 'يهتز يمين يسار',   emoji: '↔️' },
  { value: 'shake-v',     label: 'يهتز فوق تحت',     emoji: '↕️' },
  { value: 'pulse-glow',  label: 'ينبض بتوهج',       emoji: '✨' },
  { value: 'spin-drop',   label: 'يدور ثم ينزل',     emoji: '🌀' },
  { value: 'rubber',      label: 'مطاط',              emoji: '🟢' },
  { value: 'flash',       label: 'يومض',              emoji: '⚡' },
];

// ── FooterSection ──────────────────────────────────────────────────────────
type FooterSocial = { enabled: boolean; url: string };
type FooterSettings = {
  enabled: boolean;
  aboutText: string;
  bgColor: string;
  textColor: string;
  socials: {
    facebook:  FooterSocial;
    instagram: FooterSocial;
    tiktok:    FooterSocial;
    whatsapp:  FooterSocial;
    telegram:  FooterSocial;
    snapchat:  FooterSocial;
    youtube:   FooterSocial;
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

const SOCIAL_META: { key: keyof FooterSettings['socials']; label: string; placeholder: string; color: string; iconPath: string }[] = [
  { key: 'facebook',  label: 'Facebook',  placeholder: 'https://facebook.com/...',  color: '#1877f2', iconPath: '<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>' },
  { key: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/...', color: '#e1306c', iconPath: '<rect x="2" y="2" width="20" height="20" rx="5" ry="5" fill="none" stroke="white" stroke-width="2"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" fill="none" stroke="white" stroke-width="2"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" stroke="white" stroke-width="2" stroke-linecap="round"/>' },
  { key: 'tiktok',    label: 'TikTok',   placeholder: 'https://tiktok.com/@...',   color: '#010101', iconPath: '<path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.87a8.19 8.19 0 0 0 4.78 1.52V7a4.85 4.85 0 0 1-1.01-.31z"/>' },
  { key: 'whatsapp',  label: 'WhatsApp', placeholder: 'https://wa.me/...',         color: '#25d366', iconPath: '<path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>' },
  { key: 'telegram',  label: 'Telegram', placeholder: 'https://t.me/...',          color: '#0088cc', iconPath: '<path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248-1.97 9.289c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L6.12 14.53l-2.96-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.696.956z"/>' },
  { key: 'snapchat',  label: 'Snapchat', placeholder: 'https://snapchat.com/...',  color: '#FFFC00', iconPath: '<path fill="#000" d="M12.206.793c.99 0 4.347.276 5.93 3.821.529 1.193.403 3.219.333 4.616-.031.62.084.846.232.846.218 0 .63-.181 1.02-.338.196-.075.39-.139.592-.139.388 0 .894.2.894.71 0 .522-.822.923-1.078 1.032-.05.022-.122.064-.198.113-.602.366-1.344.817-1.206 1.754.193 1.281 2.037 2.764 3.115 3.544.46.33.605.467.605.607 0 .15-.122.288-.354.288h-.028l-.02.001c-.37.037-1.01.12-1.72.421-.453.195-.607.52-.607.743 0 .1-.001.209-.003.315-.008.373-.018.739-.024 1.088-.012.69-.118.864-.507.864-.212 0-.519-.113-.82-.236-.527-.213-1.108-.448-1.89-.448-.422 0-.773.042-1.197.104-.503.074-1.07.151-1.887.151-.818 0-1.38-.077-1.879-.151-.427-.063-.775-.104-1.197-.104-.783 0-1.363.235-1.89.448-.302.123-.608.236-.82.236-.389 0-.495-.174-.507-.864-.006-.35-.016-.715-.024-1.088-.002-.106-.003-.215-.003-.315 0-.223-.155-.547-.607-.743-.71-.301-1.35-.384-1.72-.421l-.02-.001h-.029c-.23 0-.352-.138-.352-.288 0-.14.144-.277.604-.607 1.078-.78 2.922-2.263 3.115-3.544.138-.937-.604-1.388-1.206-1.754-.076-.049-.148-.091-.198-.113-.256-.109-1.078-.51-1.078-1.032 0-.51.506-.71.894-.71.202 0 .396.064.592.139.39.157.802.338 1.02.338.148 0 .263-.226.232-.846-.07-1.397-.196-3.423.333-4.616C7.856 1.069 11.213.793 12.206.793z"/>' },
  { key: 'youtube',   label: 'YouTube',  placeholder: 'https://youtube.com/...',   color: '#FF0000', iconPath: '<path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>' },
];

function FooterSection() {
  const [cfg, setCfg] = useState<FooterSettings>(FOOTER_DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`${BASE}/api/storefront/footer`)
      .then(r => r.json())
      .then((d: Partial<FooterSettings>) => setCfg({
        ...FOOTER_DEFAULTS,
        ...d,
        socials: { ...FOOTER_DEFAULTS.socials, ...(d.socials ?? {}) },
      }))
      .catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await fetch(`${BASE}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ footerSettings: JSON.stringify(cfg) }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally { setSaving(false); }
  };

  const setSocial = (key: keyof FooterSettings['socials'], patch: Partial<FooterSocial>) =>
    setCfg(c => ({ ...c, socials: { ...c.socials, [key]: { ...c.socials[key], ...patch } } }));

  return (
    <Card className="relative overflow-hidden border-0 shadow-xl bg-white/5 backdrop-blur-xl">
      <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-transparent to-pink-500/5 pointer-events-none" />
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <span className="text-xl">🌐</span>
          تذييل المتجر (Footer)
        </CardTitle>
        <p className="text-sm text-muted-foreground">يظهر في أسفل صفحة المتجر — روابط التواصل الاجتماعي ونبذة عن المتجر</p>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Enable toggle */}
        <div className="flex items-center justify-between p-4 rounded-xl border border-white/10 bg-white/5">
          <div>
            <p className="font-medium text-sm">تفعيل التذييل</p>
            <p className="text-xs text-muted-foreground mt-0.5">إظهار أو إخفاء قسم التذييل بالكامل</p>
          </div>
          <button
            type="button"
            onClick={() => setCfg(c => ({ ...c, enabled: !c.enabled }))}
            className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors duration-200 ${cfg.enabled ? 'bg-green-500' : 'bg-gray-600'}`}
          >
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-200 ${cfg.enabled ? 'translate-x-8' : 'translate-x-1'}`} />
          </button>
        </div>

        {/* Colors */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 rounded-xl border border-white/10 bg-white/5 space-y-2">
            <p className="text-sm font-medium">لون الخلفية</p>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={cfg.bgColor}
                onChange={e => setCfg(c => ({ ...c, bgColor: e.target.value }))}
                className="w-12 h-10 rounded-lg cursor-pointer border-0 bg-transparent"
              />
              <span className="text-xs text-muted-foreground font-mono">{cfg.bgColor}</span>
            </div>
          </div>
          <div className="p-4 rounded-xl border border-white/10 bg-white/5 space-y-2">
            <p className="text-sm font-medium">لون النص</p>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={cfg.textColor}
                onChange={e => setCfg(c => ({ ...c, textColor: e.target.value }))}
                className="w-12 h-10 rounded-lg cursor-pointer border-0 bg-transparent"
              />
              <span className="text-xs text-muted-foreground font-mono">{cfg.textColor}</span>
            </div>
          </div>
        </div>

        {/* About text */}
        <div className="p-4 rounded-xl border border-white/10 bg-white/5 space-y-2">
          <p className="text-sm font-medium">نبذة عن المتجر</p>
          <textarea
            rows={3}
            value={cfg.aboutText}
            onChange={e => setCfg(c => ({ ...c, aboutText: e.target.value }))}
            placeholder="اكتب وصفاً قصيراً عن متجر سنبلة..."
            className="w-full bg-transparent border border-white/10 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500/50 text-right"
            dir="rtl"
          />
        </div>

        {/* Social links */}
        <div className="space-y-3">
          <p className="text-sm font-semibold">روابط التواصل الاجتماعي</p>
          {SOCIAL_META.map(({ key, label, placeholder, color }) => (
            <div key={key} className="flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-white/5">
              <button
                type="button"
                onClick={() => setSocial(key, { enabled: !cfg.socials[key].enabled })}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-200`}
                style={{ background: cfg.socials[key].enabled ? color : '#4b5563' }}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform duration-200 ${cfg.socials[key].enabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
              <span className="text-sm font-medium w-20 flex-shrink-0">{label}</span>
              <Input
                value={cfg.socials[key].url}
                onChange={e => setSocial(key, { url: e.target.value })}
                placeholder={placeholder}
                dir="ltr"
                className="flex-1 text-xs h-8"
                disabled={!cfg.socials[key].enabled}
              />
            </div>
          ))}
        </div>

        {/* Preview */}
        {cfg.enabled && (
          <div className="rounded-xl overflow-hidden border border-white/10">
            <p className="text-xs text-muted-foreground px-3 py-1.5 bg-white/5 border-b border-white/10">معاينة التذييل</p>
            <div dir="rtl" style={{ background: cfg.bgColor, color: cfg.textColor }} className="px-5 py-6 text-center">
              {cfg.aboutText && <p className="text-xs mb-3 opacity-80 whitespace-pre-line">{cfg.aboutText}</p>}
              <div className="flex flex-wrap justify-center gap-3 mb-3">
                {SOCIAL_META.filter(s => cfg.socials[s.key].enabled && cfg.socials[s.key].url).map(s => (
                  <div key={s.key} className="flex flex-col items-center gap-1">
                    <span className="w-10 h-10 rounded-xl flex items-center justify-center shadow" style={{ background: s.color }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="white" dangerouslySetInnerHTML={{ __html: s.iconPath }} />
                    </span>
                    <span className="text-xs opacity-60" style={{ color: cfg.textColor }}>{s.label}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs opacity-40">سنبلة © {new Date().getFullYear()}</p>
            </div>
          </div>
        )}

        {/* Save */}
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${saved ? 'bg-green-600 text-white' : 'bg-purple-600 hover:bg-purple-500 text-white'}`}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saved ? 'تم الحفظ!' : 'حفظ التذييل'}
        </button>
      </CardContent>
    </Card>
  );
}

function PwaArrowSection() {
  const [cfg, setCfg] = useState<PwaArrowCfg>(PWA_DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [preview, setPreview] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch(`${BASE}/api/storefront/pwa-arrow`)
      .then(r => r.json())
      .then((d: Partial<PwaArrowCfg>) => setCfg({ ...PWA_DEFAULTS, ...d }))
      .catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await fetch(`${BASE}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pwaArrowSettings: JSON.stringify(cfg) }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally { setSaving(false); }
  };

  const showPreview = () => {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    setPreview(false);
    requestAnimationFrame(() => {
      setPreview(true);
      setPreviewKey(k => k + 1);
      previewTimerRef.current = setTimeout(() => setPreview(false), cfg.duration * 1000);
    });
  };

  const PWA_ARROW_KF = `
    @keyframes s-bounce-down { 0%{transform:translateY(-60px) scale(.8);opacity:0} 55%{transform:translateY(12px) scale(1.05);opacity:1} 75%{transform:translateY(-8px) scale(.97)} 100%{transform:translateY(0) scale(1);opacity:1} }
    @keyframes s-slide-right { 0%{transform:translateX(-120px) rotate(-15deg);opacity:0} 70%{transform:translateX(10px) rotate(3deg);opacity:1} 100%{transform:translateX(0) rotate(0);opacity:1} }
    @keyframes s-slide-left  { 0%{transform:translateX(120px) rotate(15deg);opacity:0} 70%{transform:translateX(-10px) rotate(-3deg);opacity:1} 100%{transform:translateX(0) rotate(0);opacity:1} }
    @keyframes s-swing       { 0%{transform:rotate(-30deg);opacity:0} 20%{transform:rotate(25deg);opacity:1} 40%{transform:rotate(-18deg)} 60%{transform:rotate(12deg)} 80%{transform:rotate(-6deg)} 100%{transform:rotate(0deg);opacity:1} }
    @keyframes s-shake-h     { 0%,100%{transform:translateX(0)} 10%,30%,50%,70%,90%{transform:translateX(-14px)} 20%,40%,60%,80%{transform:translateX(14px)} }
    @keyframes s-shake-v     { 0%,100%{transform:translateY(0)} 10%,30%,50%,70%,90%{transform:translateY(-12px)} 20%,40%,60%,80%{transform:translateY(12px)} }
    @keyframes s-pulse-glow  { 0%,100%{transform:scale(1)} 50%{transform:scale(1.2);filter:drop-shadow(0 0 14px currentColor)} }
    @keyframes s-spin-drop   { 0%{transform:translateY(-80px) rotate(-360deg);opacity:0} 60%{transform:translateY(8px) rotate(10deg);opacity:1} 100%{transform:translateY(0) rotate(0);opacity:1} }
    @keyframes s-rubber      { 0%,100%{transform:scaleX(1) scaleY(1)} 30%{transform:scaleX(1.25) scaleY(.75)} 40%{transform:scaleX(.75) scaleY(1.25)} 55%{transform:scaleX(1.15) scaleY(.85)} 70%{transform:scaleX(.95) scaleY(1.05)} }
    @keyframes s-flash       { 0%,50%,100%{opacity:1} 25%,75%{opacity:0} }
  `;

  const animCssMap: Record<PwaArrowAnim, string> = {
    'bounce-down': 's-bounce-down 0.9s both',
    'slide-right': 's-slide-right 0.7s both',
    'slide-left':  's-slide-left  0.7s both',
    'swing':       's-swing       0.9s both',
    'shake-h':     's-shake-h     0.8s ease infinite',
    'shake-v':     's-shake-v     0.8s ease infinite',
    'pulse-glow':  's-pulse-glow  1.2s ease-in-out infinite',
    'spin-drop':   's-spin-drop   0.9s both',
    'rubber':      's-rubber      0.9s ease infinite',
    'flash':       's-flash       1s linear infinite',
  };

  return (
    <Card className="relative overflow-hidden border-0 shadow-xl bg-white/5 backdrop-blur-xl">
      <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 via-transparent to-teal-500/5 pointer-events-none" />
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <ArrowDown className="w-5 h-5 text-green-400" />
          سهم تثبيت التطبيق
        </CardTitle>
        <p className="text-sm text-muted-foreground">يظهر للزبائن الذين لم يثبتوا التطبيق على شاشتهم الرئيسية</p>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Enable toggle */}
        <div className="flex items-center justify-between p-4 rounded-xl border border-white/10 bg-white/5">
          <div>
            <p className="font-medium text-sm">تشغيل السهم</p>
            <p className="text-xs text-muted-foreground mt-0.5">يظهر في كل زيارة للزبون غير المثبِّت</p>
          </div>
          <button
            type="button"
            onClick={() => setCfg(c => ({ ...c, enabled: !c.enabled }))}
            className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors duration-200 ${cfg.enabled ? 'bg-green-500' : 'bg-gray-600'}`}
          >
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-200 ${cfg.enabled ? 'translate-x-8' : 'translate-x-1'}`} />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Color */}
          <div className="p-4 rounded-xl border border-white/10 bg-white/5 space-y-3">
            <p className="text-sm font-medium">لون السهم</p>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={cfg.color}
                onChange={e => setCfg(c => ({ ...c, color: e.target.value }))}
                className="w-12 h-10 rounded-lg cursor-pointer border-0 bg-transparent"
              />
              <Input
                value={cfg.color}
                onChange={e => setCfg(c => ({ ...c, color: e.target.value }))}
                className="font-mono text-sm flex-1"
                dir="ltr"
              />
            </div>
            <div style={{
              width: 48, height: 48,
              background: cfg.color,
              borderRadius: '50%',
              boxShadow: `0 4px 20px ${cfg.color}80`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M12 4v13m0 0l-5-5m5 5l5-5M4 20h16" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>

          {/* Size */}
          <div className="p-4 rounded-xl border border-white/10 bg-white/5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">حجم السهم</p>
              <span className="text-sm font-bold text-green-400">{cfg.size}px</span>
            </div>
            <input
              type="range" min={40} max={200} step={5}
              value={cfg.size}
              onChange={e => setCfg(c => ({ ...c, size: Number(e.target.value) }))}
              className="w-full accent-green-500"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>صغير 40px</span><span>كبير 200px</span>
            </div>
          </div>
        </div>

        {/* Duration */}
        <div className="p-4 rounded-xl border border-white/10 bg-white/5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium flex items-center gap-1.5"><Clock className="w-4 h-4 text-muted-foreground" /> مدة الظهور</p>
            <span className="text-sm font-bold text-green-400">{cfg.duration} ثانية</span>
          </div>
          <input
            type="range" min={1} max={15} step={0.5}
            value={cfg.duration}
            onChange={e => setCfg(c => ({ ...c, duration: Number(e.target.value) }))}
            className="w-full accent-green-500"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>1 ثانية</span><span>15 ثانية</span>
          </div>
        </div>

        {/* Animation selector */}
        <div className="p-4 rounded-xl border border-white/10 bg-white/5 space-y-3">
          <p className="text-sm font-medium flex items-center gap-1.5"><Zap className="w-4 h-4 text-muted-foreground" /> نوع الحركة</p>
          <div className="grid grid-cols-2 gap-2">
            {ANIM_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setCfg(c => ({ ...c, animation: opt.value }))}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium border transition-all text-right ${
                  cfg.animation === opt.value
                    ? 'border-green-500 bg-green-500/15 text-green-400'
                    : 'border-white/10 bg-white/5 hover:bg-white/10 text-foreground'
                }`}
              >
                <span className="text-base">{opt.emoji}</span>
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Preview box */}
        <div className="p-4 rounded-xl border border-white/10 bg-black/20 relative overflow-hidden" style={{ minHeight: 140 }}>
          <p className="text-xs text-muted-foreground mb-3">معاينة السهم</p>
          <style>{PWA_ARROW_KF}</style>
          <div className="flex items-center justify-center" style={{ minHeight: 90 }}>
            {preview ? (
              <div key={previewKey} className="flex flex-col items-center gap-2">
                <svg
                  width={Math.min(cfg.size, 80)}
                  height={Math.min(cfg.size, 80)}
                  viewBox="0 0 24 24"
                  fill="none"
                  style={{ animation: animCssMap[cfg.animation], color: cfg.color, filter: `drop-shadow(0 4px 12px ${cfg.color}80)` }}
                >
                  <path d="M12 4v13m0 0l-5-5m5 5l5-5M4 20h16" stroke={cfg.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span style={{ background: cfg.color, color: '#fff', padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, animation: animCssMap[cfg.animation] }}>
                  أضف سنبلة لشاشتك الرئيسية 📲
                </span>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center">اضغط «معاينة» لترى السهم</p>
            )}
          </div>
          <button
            type="button"
            onClick={showPreview}
            className="absolute top-3 left-3 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-500/20 border border-green-500/40 text-green-400 hover:bg-green-500/30 transition-colors"
          >
            ◀ معاينة
          </button>
        </div>

        {/* Save button */}
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-all bg-green-600 hover:bg-green-700 disabled:opacity-60"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saved ? 'تم الحفظ ✓' : saving ? 'جاري الحفظ...' : 'حفظ إعدادات السهم'}
        </button>
      </CardContent>
    </Card>
  );
}

function InstallBannerSection() {
  const [enabled, setEnabled] = useState(true);
  const [message, setMessage] = useState('أضف سنبلة لشاشتك الرئيسية حتى لا تضيع الموقع! 📲');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`${BASE}/api/storefront/install-banner`)
      .then(r => r.json())
      .then(d => {
        setEnabled(d.enabled ?? true);
        setMessage(d.message || 'أضف سنبلة لشاشتك الرئيسية حتى لا تضيع الموقع! 📲');
      })
      .catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await fetch(`${BASE}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ installBannerEnabled: enabled, installBannerMessage: message }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally { setSaving(false); }
  };

  return (
    <Card className="relative overflow-hidden border-0 shadow-xl bg-white/5 backdrop-blur-xl">
      <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 via-transparent to-emerald-500/5 pointer-events-none" />
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Bell className="w-5 h-5 text-green-400" />
          تنبيه تثبيت التطبيق
        </CardTitle>
        <p className="text-sm text-muted-foreground">يظهر للمستخدم بعد 15 ثانية من فتح الموقع</p>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Toggle */}
        <div className="flex items-center justify-between p-4 rounded-xl border border-white/10 bg-white/5">
          <div>
            <p className="font-medium text-sm">تشغيل التنبيه</p>
            <p className="text-xs text-muted-foreground mt-0.5">عند الإيقاف لن يظهر التنبيه لأي زائر</p>
          </div>
          <button
            type="button"
            onClick={() => setEnabled(e => !e)}
            className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors duration-200 focus:outline-none ${enabled ? 'bg-green-500' : 'bg-gray-600'}`}
          >
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-200 ${enabled ? 'translate-x-8' : 'translate-x-1'}`} />
          </button>
        </div>

        {/* Message */}
        <div>
          <label className="block text-sm font-medium mb-2">رسالة التنبيه</label>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            rows={3}
            maxLength={200}
            className="w-full px-4 py-3 rounded-xl border border-white/10 bg-white/5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all"
            placeholder="اكتب نص التنبيه هنا..."
            dir="rtl"
          />
          <p className="text-xs text-muted-foreground mt-1 text-left">{message.length}/200</p>
        </div>

        {/* Preview */}
        <div className="p-3 rounded-xl border border-dashed border-green-500/30 bg-green-500/5">
          <p className="text-xs text-green-400 font-medium mb-2">معاينة التنبيه:</p>
          <div className="flex items-center gap-3 p-3 bg-white rounded-xl shadow-lg text-right" dir="rtl">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-xl flex-shrink-0">📲</div>
            <p className="text-sm text-gray-800 font-medium flex-1">{message || 'نص التنبيه...'}</p>
            <button className="text-xs text-green-600 font-bold whitespace-nowrap flex-shrink-0">تثبيت</button>
          </div>
        </div>

        <Button type="button" onClick={save} isLoading={saving} className={`w-full sm:w-auto gap-2 ${saved ? 'bg-green-600 hover:bg-green-700' : ''}`}>
          {saved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saved ? 'تم الحفظ!' : 'حفظ إعدادات التنبيه'}
        </Button>
      </CardContent>
    </Card>
  );
}



export default function Settings() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useGetSettings();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [exportState, setExportState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [importState, setImportState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [importMessage, setImportMessage] = useState('');
  const [reloadState, setReloadState] = useState<'idle' | 'loading'>('idle');
  const [pushTitle, setPushTitle] = useState('');
  const [pushBody, setPushBody] = useState('');
  const [pushUrl, setPushUrl] = useState('');
  const [pushState, setPushState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [pushResult, setPushResult] = useState<{ sent: number; failed: number } | null>(null);
  const [pushSubCount, setPushSubCount] = useState<number | null>(null);
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwState, setPwState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [pwError, setPwError] = useState('');
  const [showPwCurrent, setShowPwCurrent] = useState(false);
  const [showPwNew, setShowPwNew] = useState(false);
  const [showPwConfirm, setShowPwConfirm] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const [showRecoveryKey, setShowRecoveryKey] = useState(false);
  const [regenState, setRegenState] = useState<'idle' | 'loading'>('idle');
  const [copied, setCopied] = useState(false);

  const fetchRecoveryKey = async () => {
    const res = await fetch(`${BASE}/api/beqolky/recovery-key`);
    const data = await res.json();
    setRecoveryKey(data.recoveryKey);
    setShowRecoveryKey(true);
  };

  const regenRecoveryKey = async () => {
    setRegenState('loading');
    const res = await fetch(`${BASE}/api/beqolky/regenerate-recovery-key`, { method: 'POST' });
    const data = await res.json();
    if (data.recoveryKey) setRecoveryKey(data.recoveryKey);
    setRegenState('idle');
  };

  const copyKey = () => {
    if (recoveryKey) {
      navigator.clipboard.writeText(recoveryKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleChangePassword = async () => {
    setPwError('');
    if (pwNew !== pwConfirm) { setPwError('كلمة المرور الجديدة غير متطابقة'); return; }
    if (pwNew.length < 6) { setPwError('يجب أن تكون 6 أحرف على الأقل'); return; }
    setPwState('loading');
    try {
      const res = await fetch(`${BASE}/api/beqolky/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: pwCurrent, newPassword: pwNew }),
      });
      const data = await res.json();
      if (!res.ok) { setPwError(data.error || 'خطأ'); setPwState('error'); return; }
      setPwState('done');
      setPwCurrent(''); setPwNew(''); setPwConfirm('');
      setTimeout(() => setPwState('idle'), 3000);
    } catch {
      setPwState('error');
      setPwError('حدث خطأ، حاول مجدداً');
    }
  };

  const { register, handleSubmit, reset, watch } = useForm({
    defaultValues: settings || {}
  });

  useEffect(() => {
    if (settings) {
      reset(settings);
    }
  }, [settings, reset]);

  const [savedSuccess, setSavedSuccess] = useState(false);

  const { mutate: updateSettings, isPending } = useUpdateSettings({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['/api/settings'] });
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 3000);
      }
    }
  });

  const onSubmit = (data: any) => {
    updateSettings({ 
      data: {
        facebookPageId: data.facebookPageId,
        instagramAccountId: data.instagramAccountId,
        metaAccessToken: data.metaAccessToken,
        webhookVerifyToken: data.webhookVerifyToken,
        twilioAccountSid: data.twilioAccountSid,
        twilioAuthToken: data.twilioAuthToken,
        twilioFromNumber: data.twilioFromNumber,
        whatsappAdminNumber: data.whatsappAdminNumber,
        viberApiKey: data.viberApiKey,
        telegramBotToken: data.telegramBotToken,
        telegramChatId: data.telegramChatId,
        smtpUser: data.smtpUser,
        smtpPass: data.smtpPass,
        recoveryEmail: data.recoveryEmail,
        googleClientId: data.googleClientId,
        jwtSecret: data.jwtSecret,
      } 
    });
  };

  const handleExport = async () => {
    setExportState('loading');
    try {
      const res = await fetch(`${BASE}/api/beqolky/export`);
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `business-suite-backup-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExportState('done');
      setTimeout(() => setExportState('idle'), 3000);
    } catch {
      setExportState('error');
      setTimeout(() => setExportState('idle'), 3000);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportState('loading');
    setImportMessage('');
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const res = await fetch(`${BASE}/api/beqolky/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(json),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Import failed');
      const r = data.results;
      setImportMessage(
        `Restored: ${r.settings ?? '-'} | ${r.inventory ?? '-'} | ${r.savedReplies ?? '-'} | ${r.trainingNotes ?? '-'}`
      );
      setImportState('done');
      queryClient.invalidateQueries();
      setTimeout(() => setImportState('idle'), 5000);
    } catch (err: any) {
      setImportMessage(err?.message ?? 'Import failed');
      setImportState('error');
      setTimeout(() => setImportState('idle'), 5000);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  useEffect(() => {
    fetch('/api/push/subscribers')
      .then(r => r.json())
      .then(d => setPushSubCount(d.count ?? null))
      .catch(() => {});
  }, []);

  const handleSendPush = async () => {
    if (!pushTitle.trim() || !pushBody.trim()) return;
    setPushState('loading');
    setPushResult(null);
    try {
      const res = await fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: pushTitle.trim(), body: pushBody.trim(), url: pushUrl.trim() || '/' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل الإرسال');
      setPushResult({ sent: data.sent, failed: data.failed });
      setPushState('done');
      setPushTitle('');
      setPushBody('');
      setPushUrl('');
      setTimeout(() => setPushState('idle'), 4000);
    } catch {
      setPushState('error');
      setTimeout(() => setPushState('idle'), 3000);
    }
  };

  const handleForceReload = async () => {
    setReloadState('loading');
    try {
      // 1. Clear React Query cache
      await queryClient.resetQueries();
      await queryClient.invalidateQueries();
      // 2. Unregister all service workers
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
      // 3. Clear all browser caches
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map(k => caches.delete(k)));
      // 4. Reset version flag so auto-clear runs again on next load
      localStorage.removeItem('cache-version');
    } catch (_) {}
    // 5. Hard reload bypassing browser HTTP cache
    setTimeout(() => {
      window.location.href = window.location.origin + '/?_=' + Date.now();
    }, 400);
  };

  if (isLoading) return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  /* ── Token expiry helpers ── */
  const tokenExpiry = (settings as any)?.tokenExpiresAt as number | null | undefined;
  const now = Math.floor(Date.now() / 1000);
  const daysLeft = tokenExpiry ? Math.floor((tokenExpiry - now) / 86400) : null;
  const expiryDate = tokenExpiry ? new Date(tokenExpiry * 1000) : null;
  const expiryBanner = (() => {
    if (!tokenExpiry || !expiryDate) return { level: 'none', color: 'gray' };
    if (daysLeft! < 0) return { level: 'error', color: 'red' };
    if (daysLeft! <= 7) return { level: 'critical', color: 'red' };
    if (daysLeft! <= 20) return { level: 'warning', color: 'amber' };
    return { level: 'ok', color: 'emerald' };
  })();

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-24">
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-2">{t('settings')}</h1>
        <p className="text-muted-foreground">Configure the core behavior of your AI assistant.</p>
      </div>

      {/* ── Facebook Token Expiry Notification ──────────────────────── */}
      <div className={`rounded-2xl border p-4 flex items-start gap-4
        ${expiryBanner.color === 'red'
          ? 'bg-red-500/10 border-red-500/40'
          : expiryBanner.color === 'amber'
          ? 'bg-amber-500/10 border-amber-500/40'
          : expiryBanner.color === 'gray'
          ? 'bg-muted/20 border-white/10'
          : 'bg-emerald-500/10 border-emerald-500/30'}`}>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0
          ${expiryBanner.color === 'red' ? 'bg-red-500/20' : expiryBanner.color === 'amber' ? 'bg-amber-500/20' : expiryBanner.color === 'gray' ? 'bg-muted/30' : 'bg-emerald-500/20'}`}>
          {expiryBanner.level === 'ok'
            ? <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            : expiryBanner.level === 'none'
            ? <Bell className="w-5 h-5 text-muted-foreground" />
            : <Bell className={`w-5 h-5 ${expiryBanner.color === 'red' ? 'text-red-400 animate-pulse' : 'text-amber-400'}`} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`font-bold text-sm mb-0.5
            ${expiryBanner.color === 'red' ? 'text-red-300' : expiryBanner.color === 'amber' ? 'text-amber-300' : expiryBanner.color === 'gray' ? 'text-muted-foreground' : 'text-emerald-300'}`}>
            {expiryBanner.level === 'none'
              ? '⚙️ توكن فيسبوك — غير مضبوط'
              : expiryBanner.level === 'error'
              ? '⛔ توكن فيسبوك منتهي الصلاحية!'
              : expiryBanner.level === 'critical'
              ? `🚨 التوكن ينتهي خلال ${daysLeft} يوم — جدّده الآن`
              : expiryBanner.level === 'warning'
              ? `⚠️ التوكن ينتهي خلال ${daysLeft} يوم`
              : `✅ توكن فيسبوك صالح — ${daysLeft} يوم متبقي`}
          </p>
          <p className="text-xs text-muted-foreground">
            {expiryBanner.level === 'none'
              ? 'اذهب لصفحة ربط فيسبوك لإضافة التوكن وتفعيل البوت.'
              : expiryBanner.level === 'error'
              ? 'البوت توقف عن العمل. اذهب لصفحة فيسبوك وجدّد التوكن فوراً.'
              : `تاريخ الانتهاء: ${expiryDate!.toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} — ${expiryDate!.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}`}
          </p>
        </div>
        <a href={`${BASE}/beqolky/facebook-connect`}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold flex-shrink-0 transition-colors
            ${expiryBanner.color === 'red'
              ? 'bg-red-500/20 hover:bg-red-500/30 text-red-300'
              : expiryBanner.color === 'amber'
              ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300'
              : expiryBanner.color === 'gray'
              ? 'bg-muted/40 hover:bg-muted/60 text-muted-foreground'
              : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300'}`}>
          <RefreshCw className="w-3.5 h-3.5" />
          {expiryBanner.level === 'none' ? 'ربط الآن' : expiryBanner.level === 'ok' ? 'تجديد مبكر' : 'جدّد الآن'}
        </a>
      </div>

      {/* ── Porkbun Domain Expiry Reminder ────────────────────────────── */}
      {(() => {
        const REPLIT_EXPIRY = new Date('2028-03-30'); // Porkbun domain expiry
        const today = new Date();
        const msLeft = REPLIT_EXPIRY.getTime() - today.getTime();
        const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
        const isExpired = daysLeft <= 0;
        const isCritical = daysLeft > 0 && daysLeft <= 7;
        const isWarning = daysLeft > 7 && daysLeft <= 30;
        const isOk = daysLeft > 30;
        const color = isExpired || isCritical ? 'red' : isWarning ? 'amber' : 'emerald';
        const expiryStr = REPLIT_EXPIRY.toLocaleDateString('ar-IQ', { year: 'numeric', month: 'long', day: 'numeric' });
        return (
          <div className={`rounded-2xl border p-4 flex items-start gap-4
            ${color === 'red' ? 'bg-red-500/10 border-red-500/40'
              : color === 'amber' ? 'bg-amber-500/10 border-amber-500/40'
              : 'bg-emerald-500/10 border-emerald-500/30'}`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0
              ${color === 'red' ? 'bg-red-500/20' : color === 'amber' ? 'bg-amber-500/20' : 'bg-emerald-500/20'}`}>
              {isOk
                ? <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                : <Bell className={`w-5 h-5 ${color === 'red' ? 'text-red-400 animate-pulse' : 'text-amber-400'}`} />}
            </div>
            <div className="flex-1 min-w-0" dir="rtl">
              <p className={`font-bold text-sm mb-0.5
                ${color === 'red' ? 'text-red-300' : color === 'amber' ? 'text-amber-300' : 'text-emerald-300'}`}>
                {isExpired
                  ? '⛔ انتهى اشتراك Porkbun (الدومين)!'
                  : isCritical
                  ? `🚨 دومين Porkbun ينتهي خلال ${daysLeft} يوم — جدّده الآن`
                  : isWarning
                  ? `⚠️ دومين Porkbun ينتهي خلال ${daysLeft} يوم`
                  : `✅ دومين Porkbun ساري — ${daysLeft} يوم متبقي`}
              </p>
              <p className="text-xs text-muted-foreground">
                تاريخ انتهاء الاشتراك: {expiryStr}
                {isWarning || isCritical ? ' — يُرجى التجديد قبل انقطاع الخدمة' : ''}
              </p>
            </div>
            <a href="https://porkbun.com/account/domainExpiration" target="_blank" rel="noopener noreferrer"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold flex-shrink-0 transition-colors
                ${color === 'red' ? 'bg-red-500/20 hover:bg-red-500/30 text-red-300'
                  : color === 'amber' ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300'
                  : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300'}`}>
              <RefreshCw className="w-3.5 h-3.5" />
              {isOk ? 'تجديد مبكر' : 'جدّد الآن'}
            </a>
          </div>
        );
      })()}

      {/* ── Push Notifications ────────────────────────────────────────── */}
      <Card className="border border-violet-500/30 bg-violet-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-violet-400">
            <Bell className="w-5 h-5" /> إشعارات الجوال (Push)
            {pushSubCount !== null && (
              <span className="text-xs font-normal text-muted-foreground bg-muted/30 px-2 py-0.5 rounded-full">
                {pushSubCount} مشترك
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3" dir="rtl">
          <p className="text-sm text-muted-foreground">
            أرسل إشعاراً فورياً لكل الزبائن الذين ثبّتوا التطبيق على جوالاتهم.
          </p>
          <div className="space-y-2">
            <Input
              value={pushTitle}
              onChange={e => setPushTitle(e.target.value)}
              placeholder="عنوان الإشعار — مثال: عرض اليوم 🔥"
              className="text-right"
              dir="rtl"
            />
            <Input
              value={pushBody}
              onChange={e => setPushBody(e.target.value)}
              placeholder="نص الإشعار — مثال: خصم 20% على كل الملابس الصيفية"
              className="text-right"
              dir="rtl"
            />
            <Input
              value={pushUrl}
              onChange={e => setPushUrl(e.target.value)}
              placeholder="رابط عند الضغط (اختياري) — مثال: /"
              dir="ltr"
            />
          </div>
          {pushResult && pushState === 'done' && (
            <p className="text-xs text-emerald-400">
              ✅ أُرسل الإشعار إلى {pushResult.sent} جهاز{pushResult.failed > 0 ? ` (${pushResult.failed} فشل)` : ''}
            </p>
          )}
          {pushState === 'error' && (
            <p className="text-xs text-red-400">⛔ فشل الإرسال. حاول مرة أخرى.</p>
          )}
          <Button
            type="button"
            onClick={handleSendPush}
            disabled={pushState === 'loading' || !pushTitle.trim() || !pushBody.trim()}
            className="gap-2 bg-violet-600 hover:bg-violet-500 text-white w-full"
          >
            {pushState === 'loading' ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> جاري الإرسال...</>
            ) : pushState === 'done' ? (
              <><CheckCircle2 className="w-4 h-4" /> تم الإرسال!</>
            ) : (
              <><Bell className="w-4 h-4" /> إرسال الإشعار للجميع</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* ── Force Reload ──────────────────────────────────────────────── */}
      <Card className="border border-orange-500/30 bg-orange-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-orange-400">
            <RefreshCw className="w-5 h-5" /> إعادة تحميل قسري
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            إذا ظهرت لك البيانات فارغة (ردود محفوظة، مخزون، حجوزات) بعد فتح التطبيق المنشور، اضغط هذا الزر لمسح الكاش وإعادة تحميل كل البيانات من جديد.
          </p>
          <Button
            type="button"
            onClick={handleForceReload}
            disabled={reloadState === 'loading'}
            className="gap-2 bg-orange-600 hover:bg-orange-500 text-white w-full"
          >
            {reloadState === 'loading' ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> جاري التحميل...</>
            ) : (
              <><RefreshCw className="w-4 h-4" /> مسح الكاش وإعادة التحميل</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* ── Backup & Restore ──────────────────────────────────────────── */}
      <Card className="border border-blue-500/30 bg-blue-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-400">
            <Download className="w-5 h-5" /> نسخ احتياطي واستعادة
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            إذا فقدت بياناتك بعد النشر (ردود محفوظة، مخزون، إعدادات)، استخدم هذه الأدوات: <strong className="text-foreground">صدّر</strong> من بيئة التطوير ثم <strong className="text-foreground">استورد</strong> في التطبيق المنشور.
          </p>
          <div className="flex flex-wrap gap-3 items-center">
            {/* Export */}
            <Button
              type="button"
              onClick={handleExport}
              disabled={exportState === 'loading'}
              className="gap-2 bg-blue-600 hover:bg-blue-500 text-white"
            >
              {exportState === 'loading' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : exportState === 'done' ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : exportState === 'error' ? (
                <AlertCircle className="w-4 h-4" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {exportState === 'done' ? 'تم التصدير!' : exportState === 'error' ? 'خطأ' : 'تصدير نسخة احتياطية (.json)'}
            </Button>

            {/* Import */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImportFile}
            />
            <Button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={importState === 'loading'}
              className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              {importState === 'loading' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : importState === 'done' ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : importState === 'error' ? (
                <AlertCircle className="w-4 h-4" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              {importState === 'done' ? 'تم الاستيراد!' : importState === 'error' ? 'فشل' : 'استيراد نسخة احتياطية (.json)'}
            </Button>
          </div>
          {importMessage && (
            <p className={`text-xs mt-1 ${importState === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>
              {importMessage}
            </p>
          )}
          <p className="text-xs text-muted-foreground/70 border-t border-white/5 pt-3">
            الخطوات: افتح التطبيق في بيئة التطوير ← اضغط "تصدير" ← احفظ الملف ← افتح التطبيق المنشور ← اذهب للإعدادات ← اضغط "استيراد".
          </p>
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">

        {/* Info: Bot toggles moved to Dashboard */}
        <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-500/20 flex items-center justify-center shrink-0">
            <Bot className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <p className="font-semibold text-sm text-blue-300">تحكم البوت موجود في الداشبورد</p>
            <p className="text-xs text-muted-foreground">مفاتيح تشغيل Facebook وInstagram متاحة فقط من صفحة الداشبورد الرئيسية.</p>
          </div>
          <a href="/dashboard" className="mr-auto shrink-0 text-xs font-semibold px-3 py-1.5 rounded-xl bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 transition-colors">
            الداشبورد
          </a>
        </div>

        {/* API Integration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Key className="text-amber-400 w-5 h-5"/> {t('metaIntegration')}</CardTitle>
          </CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">{t('pageId')}</label>
              <Input {...register('facebookPageId')} placeholder="e.g., 1029384756..." />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">{t('igAccountId')}</label>
              <Input {...register('instagramAccountId')} placeholder="e.g., 178414..." />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">{t('accessToken')}</label>
              <Input type="password" {...register('metaAccessToken')} placeholder="EAAG..." />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Webhook Verify Token</label>
              <Input {...register('webhookVerifyToken')} placeholder="Your secret token string" />
            </div>
          </CardContent>
        </Card>

        {/* Twilio WhatsApp Alerts (item 7) */}
        <Card className="border-t-4 border-t-emerald-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PhoneCall className="text-emerald-400 w-5 h-5" />
              تنبيهات WhatsApp — Twilio
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              أدخل بيانات Twilio لتلقي تنبيهات واتساب عند وصول حجز جديد أو انتهاء صلاحية التوكن.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Twilio Account SID</label>
                <Input {...register('twilioAccountSid')} placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" className="font-mono text-sm" />
                <p className="text-xs text-muted-foreground">من console.twilio.com</p>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Twilio Auth Token</label>
                <Input type="password" {...register('twilioAuthToken')} placeholder="••••••••••••••••••••••••••••••••" className="font-mono text-sm" />
                <p className="text-xs text-muted-foreground">Auth Token السري</p>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Twilio من رقم (whatsapp:+1...)</label>
                <Input {...register('twilioFromNumber')} placeholder="whatsapp:+14155238886" className="font-mono text-sm" />
                <p className="text-xs text-muted-foreground">رقم WhatsApp Sandbox أو المعتمد من Twilio</p>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">{t('whatsappAdmin')} (واتساب الأدمن)</label>
                <Input {...register('whatsappAdminNumber')} placeholder="+9660501234567" className="font-mono text-sm" />
                <p className="text-xs text-muted-foreground">الرقم الذي سيستلم التنبيهات — بدون whatsapp: prefix</p>
              </div>
            </div>
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-semibold text-emerald-400">متى يتم الإرسال؟</p>
              <p>✅ عند تأكيد حجز جديد (الاسم + الهاتف + المحافظة + العنوان)</p>
              <p>⚠️ عندما يتبقى 7 أيام أو أقل على انتهاء صلاحية توكن Meta</p>
              <p>🔄 عند تصعيد محادثة للأدمن</p>
            </div>
          </CardContent>
        </Card>


        {/* Telegram Notifications */}
        <Card className="border-t-4 border-t-blue-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="text-xl">✈️</span>
              تنبيهات Telegram
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              احصل على تنبيه Telegram فوري عند كل حجز جديد مؤكد — مع رابط الصور والفاتورة.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 text-xs text-muted-foreground space-y-1 mb-2">
              <p className="font-semibold text-blue-400">طريقة التفعيل:</p>
              <p>1. افتح Telegram وابحث عن <strong>@BotFather</strong></p>
              <p>2. أرسل: <code className="bg-black/20 px-1 rounded">/newbot</code> واتبع التعليمات — ستحصل على <strong>Bot Token</strong></p>
              <p>3. ابدأ محادثة مع البوت الجديد، ثم افتح: <code className="bg-black/20 px-1 rounded">@userinfobot</code> لتحصل على <strong>Chat ID</strong> الخاص بك</p>
              <p>4. ضع التوكن والـ Chat ID أدناه ثم احفظ</p>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Bot Token</label>
              <Input {...register('telegramBotToken')} placeholder="123456789:AAXXXXXXXXXXXXXXXXXXXXXXXX" className="font-mono text-sm" />
              <p className="text-xs text-muted-foreground">التوكن الذي يعطيك إياه BotFather</p>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Chat ID (رقم حسابك)</label>
              <Input {...register('telegramChatId')} placeholder="123456789" className="font-mono text-sm" />
              <p className="text-xs text-muted-foreground">رقم الـ Chat ID الخاص بك — من @userinfobot</p>
            </div>
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-semibold text-blue-400">محتوى الرسالة عند كل حجز:</p>
              <p>👤 اسم الزبون + 📞 هاتفه + 🏙️ عنوانه</p>
              <p>🛍️ قائمة المنتجات مع الأسعار + 💰 المجموع الكلي</p>
              <p>📸 روابط صور المنتجات + 🧾 رابط الفاتورة</p>
              <p className="text-blue-400/80 mt-1">✅ يُعلَّم الحجز كـ "مقروء" في Meta فور إرسال الإشعار</p>
            </div>
          </CardContent>
        </Card>

        {/* Recovery Email Settings */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              📧 إعدادات البريد الإلكتروني (للاسترداد)
            </CardTitle>
            <p className="text-xs text-muted-foreground">اختياري — يُستخدم فقط عند نسيان كلمة المرور. يجب أن يكون Gmail مع "كلمة مرور التطبيق".</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">حساب Gmail المرسِل</label>
              <Input type="email" {...register('smtpUser')} placeholder="example@gmail.com" dir="ltr" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">كلمة مرور التطبيق (App Password)</label>
              <Input type="password" {...register('smtpPass')} placeholder="xxxx xxxx xxxx xxxx" dir="ltr" />
              <p className="text-xs text-muted-foreground mt-1">احصل عليها من: <span className="font-mono text-primary/80">myaccount.google.com → الأمان → كلمات مرور التطبيقات</span></p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">البريد المستقبِل لرموز الاسترداد</label>
              <Input type="email" {...register('recoveryEmail')} placeholder="your@email.com" dir="ltr" />
            </div>
          </CardContent>
        </Card>

        {/* Recovery Key */}
        <Card className="glass-card border-amber-500/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="w-4 h-4 text-amber-400" /> رمز الاسترداد الطارئ
            </CardTitle>
            <p className="text-xs text-muted-foreground">إذا نسيت كلمة المرور ولم يعمل الواتساب أو الإيميل — استخدم هذا الرمز لاسترداد الحساب. <span className="text-amber-400 font-medium">احتفظ به في مكان آمن.</span></p>
          </CardHeader>
          <CardContent className="space-y-3">
            {!showRecoveryKey ? (
              <Button type="button" variant="outline" onClick={fetchRecoveryKey} className="gap-2">
                <Eye className="w-4 h-4" /> إظهار الرمز الطارئ
              </Button>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
                  <span className="font-mono font-bold text-lg text-amber-300 flex-1 tracking-widest">{recoveryKey || '...'}</span>
                  <button type="button" onClick={copyKey} className="text-muted-foreground hover:text-amber-300 transition-colors" title="نسخ">
                    {copied ? <CheckCircle2 size={16} className="text-green-400" /> : <Copy size={16} />}
                  </button>
                </div>
                <p className="text-xs text-amber-400/80">⚠️ هذا الرمز للاستخدام مرة واحدة فقط — يتجدد تلقائياً بعد الاستخدام.</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  isLoading={regenState === 'loading'}
                  onClick={regenRecoveryKey}
                  className="gap-1.5 text-xs"
                >
                  <RefreshCw className="w-3 h-3" /> توليد رمز جديد
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Customer Account Settings */}
        <Card className="glass-card border-blue-500/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="text-base">👤</span> إعدادات حسابات الزبائن
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              تفعيل تسجيل الدخول بـ Google للزبائن في المتجر. احصل على Client ID من{' '}
              <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">Google Cloud Console</a>.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Google Client ID (اختياري)</label>
              <Input
                {...register('googleClientId')}
                placeholder="xxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com"
                dir="ltr"
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground mt-1">اتركه فارغاً لإخفاء زر تسجيل الدخول بـ Google</p>
            </div>
          </CardContent>
        </Card>

        {/* Admin Password */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Lock className="w-4 h-4" /> تغيير كلمة مرور الإدارة
            </CardTitle>
            <p className="text-xs text-muted-foreground">كلمة المرور الافتراضية هي <span className="font-mono font-bold">sonbola2026</span>. يُنصح بتغييرها فوراً.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">كلمة المرور الحالية</label>
              <div className="relative">
                <Input type={showPwCurrent ? 'text' : 'password'} value={pwCurrent} onChange={e => setPwCurrent(e.target.value)} placeholder="••••••••" className="pl-10" dir="ltr" />
                <button type="button" onClick={() => setShowPwCurrent(v => !v)} className="absolute top-1/2 -translate-y-1/2 left-3 text-muted-foreground hover:text-foreground transition-colors">
                  {showPwCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">كلمة المرور الجديدة</label>
              <div className="relative">
                <Input type={showPwNew ? 'text' : 'password'} value={pwNew} onChange={e => setPwNew(e.target.value)} placeholder="6 أحرف على الأقل" className="pl-10" dir="ltr" />
                <button type="button" onClick={() => setShowPwNew(v => !v)} className="absolute top-1/2 -translate-y-1/2 left-3 text-muted-foreground hover:text-foreground transition-colors">
                  {showPwNew ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">تأكيد كلمة المرور الجديدة</label>
              <div className="relative">
                <Input type={showPwConfirm ? 'text' : 'password'} value={pwConfirm} onChange={e => setPwConfirm(e.target.value)} placeholder="••••••••" className="pl-10" dir="ltr" />
                <button type="button" onClick={() => setShowPwConfirm(v => !v)} className="absolute top-1/2 -translate-y-1/2 left-3 text-muted-foreground hover:text-foreground transition-colors">
                  {showPwConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            {pwError && (
              <p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{pwError}</p>
            )}
            {pwState === 'done' && (
              <p className="text-xs text-green-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />تم تغيير كلمة المرور بنجاح</p>
            )}
            <Button
              type="button"
              onClick={handleChangePassword}
              isLoading={pwState === 'loading'}
              className="w-full sm:w-auto"
              variant="outline"
            >
              <Lock className="w-4 h-4 mr-2" /> حفظ كلمة المرور
            </Button>
          </CardContent>
        </Card>

        {/* ── Tutorial Video ───────────────────────────────────────────────────── */}
        <TutorialVideoSection />

        {/* ── Tutorial Images ──────────────────────────────────────────────────── */}
        <TutorialImagesSection />

        {/* ── Button Animation ─────────────────────────────────────────────────── */}
        <ButtonAnimationSection />

        {/* ── Ticker ───────────────────────────────────────────────────────────── */}
        <TickerSection />

        {/* ── Storefront Notes ──────────────────────────────────────────────────── */}
        <StorefrontNotesSection />

        {/* ── Install Banner ───────────────────────────────────────────────────── */}
        <InstallBannerSection />

        {/* ── PWA Install Arrow ──────────────────────────────────────────────── */}
        <PwaArrowSection />

        {/* ── Footer ───────────────────────────────────────────────────────────── */}
        <FooterSection />


        {/* Floating Action Bar */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-xl border-t border-white/10 flex justify-end z-40">
          <div className="max-w-7xl mx-auto w-full flex items-center justify-end gap-4 px-4 md:px-8">
            {savedSuccess && (
              <span className="flex items-center gap-2 text-green-400 text-sm font-medium animate-fade-in">
                <CheckCircle2 className="w-4 h-4" /> تم الحفظ بنجاح ✓
              </span>
            )}
            <Button type="submit" size="lg" isLoading={isPending} className={`w-full md:w-auto px-12 rounded-full gap-2 text-lg transition-all ${savedSuccess ? 'bg-green-600 hover:bg-green-700' : ''}`}>
              {savedSuccess ? <CheckCircle2 className="w-5 h-5" /> : <Save className="w-5 h-5" />}
              {savedSuccess ? 'تم الحفظ!' : t('save')}
            </Button>
          </div>
        </div>

      </form>
    </div>
  );
}
