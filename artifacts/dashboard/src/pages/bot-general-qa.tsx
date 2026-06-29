import { useState, useEffect, useRef } from 'react';
import { BookOpen, Save, Loader2, Info, RotateCcw, CheckCircle2 } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

const PLACEHOLDER = `زبون: القماش شنو؟
بوت: صيني نوعية زينة، عندنا تركي وإيطالي أيضاً 😊

زبون: غالي ماريد
بوت: الأسعار ثابتة عيني، احنا موظفين هنا ما نقدر نغير 😊

زبون: التوصيل اشقد؟
بوت: 6 الف للمحافظات، 2 الى 3 أيام يوصللج 😊

زبون: عندكم محل؟
بوت: احنا بزاخو محافظة دهوك، التوصيل لكل العراق 😊

زبون: ممكن تخفيض؟
بوت: الأسعار ثابتة ما نقدر نغير عيني 😊

زبون: الملابس بيها نايلون؟
بوت: بيها نسبة نايلون تركي وصيني وإيطالي، كلها نوعيات متنوعة 😊

زبون: عندكم جملة؟
بوت: بس مفرد ماكو جملة 😊

زبون: أكو ترجيع؟
بوت: القياسات مظبوطة وندز يوميا للمحافظات، إذا ما ناسب التواصل معنا 😊`;

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export default function BotGeneralQA() {
  const { language, isRtl } = useTranslation();
  const ar = language === 'ar';
  const [text, setText] = useState('');
  const [original, setOriginal] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    apiFetch('/api/settings')
      .then(s => {
        const val = s.generalQaText ?? '';
        setText(val);
        setOriginal(val);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const isDirty = text !== original;

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({ generalQaText: text }),
      });
      setOriginal(text);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {}
    finally { setSaving(false); }
  };

  const handleReset = () => setText(original);

  const lineCount = text ? text.split('\n').length : 0;
  const pairCount = text ? (text.match(/^زبون:/gm) ?? []).length : 0;

  return (
    <div className="space-y-6 max-w-4xl" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-violet-400" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">{ar ? 'قاعدة معرفة البوت' : 'Bot Knowledge Base'}</h1>
          </div>
          <p className="text-muted-foreground text-sm">
            {ar ? 'اكتب محادثات الزبائن الشائعة — البوت يحفظها ويستخدمها ذكياً في كل محادثة' : 'Write common customer conversations — the bot saves and uses them intelligently'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isDirty && (
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 text-muted-foreground hover:text-foreground rounded-xl font-medium hover:bg-white/10 transition-colors text-sm"
            >
              <RotateCcw className="w-4 h-4" />
              {ar ? 'تراجع' : 'Undo'}
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !isDirty}
            className="flex items-center gap-2 px-5 py-2.5 bg-violet-500 text-white rounded-xl font-medium hover:bg-violet-600 transition-colors disabled:opacity-40 shadow-lg shadow-violet-500/20 text-sm"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saving ? (ar ? 'جاري الحفظ...' : 'Saving...') : saved ? (ar ? 'تم الحفظ ✓' : 'Saved ✓') : (ar ? 'حفظ' : 'Save')}
          </button>
        </div>
      </div>

      {/* Info banner */}
      <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4 flex gap-3 items-start">
        <Info className="w-5 h-5 mt-0.5 shrink-0 text-violet-400" />
        <div className="text-sm text-muted-foreground space-y-2">
          <p><span className="text-foreground font-medium">كيف يشتغل؟ </span>— البوت يقرأ هذا النص في كل محادثة ويستخدمه للرد بشكل طبيعي وذكي بدون keywords أو مطابقة حرفية.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
            <div className="rounded-lg bg-white/5 p-2.5">
              <p className="text-violet-300 font-medium text-xs mb-1">الشكل الصحيح</p>
              <pre className="text-xs text-muted-foreground leading-relaxed font-mono whitespace-pre-wrap">{"زبون: غالي ماريد\nبوت: الأسعار ثابتة عيني 😊\n\nزبون: القماش شنو؟\nبوت: صيني نوعية زينة 😊"}</pre>
            </div>
            <div className="rounded-lg bg-white/5 p-2.5">
              <p className="text-green-400 font-medium text-xs mb-1">النتيجة</p>
              <p className="text-xs text-muted-foreground">حتى لو الزبون قال "غلية" أو "مو بسعر" أو "غالي ماريد" — البوت يفهم ويرد بنفس الجواب</p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      {text && (
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-violet-400"></span>
            {pairCount} محادثة
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-400"></span>
            {lineCount} سطر
          </span>
          {isDirty && <span className="text-amber-400 text-xs">● تغييرات غير محفوظة</span>}
        </div>
      )}

      {/* Main editor */}
      <div className="relative">
        {loading ? (
          <div className="flex items-center justify-center h-80 rounded-2xl border border-white/10 bg-card/40">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={PLACEHOLDER}
            rows={32}
            dir="rtl"
            spellCheck={false}
            className="w-full bg-card/40 border border-white/10 rounded-2xl px-5 py-4 text-sm text-foreground placeholder:text-muted-foreground/40 resize-none focus:outline-none focus:ring-2 focus:ring-violet-500/40 font-mono leading-7 transition-colors hover:border-white/20"
          />
        )}
        {/* Character count */}
        {text && (
          <div className="absolute bottom-3 left-4 text-[11px] text-muted-foreground/50 pointer-events-none">
            {text.length.toLocaleString()} حرف
          </div>
        )}
      </div>

      {/* Tips */}
      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
        <p className="text-xs font-medium text-muted-foreground mb-3">نصائح لنتائج أفضل</p>
        <ul className="space-y-1.5 text-xs text-muted-foreground">
          <li className="flex items-start gap-2"><span className="text-violet-400 mt-0.5">•</span> ابدأ كل سؤال بـ <code className="bg-white/10 px-1 rounded text-violet-300">زبون:</code> وكل جواب بـ <code className="bg-white/10 px-1 rounded text-violet-300">بوت:</code></li>
          <li className="flex items-start gap-2"><span className="text-violet-400 mt-0.5">•</span> اترك سطراً فارغاً بين كل محادثة ومحادثة</li>
          <li className="flex items-start gap-2"><span className="text-violet-400 mt-0.5">•</span> اكتب السؤال بلهجات مختلفة إذا أردت: "غالي" و"غلية" و"مو بسعر" — البوت يفهمها جميعاً</li>
          <li className="flex items-start gap-2"><span className="text-violet-400 mt-0.5">•</span> يمكنك كتابة معلومات مباشرة بدون صيغة سؤال/جواب — البوت يستخدمها كمرجع</li>
        </ul>
      </div>
    </div>
  );
}
