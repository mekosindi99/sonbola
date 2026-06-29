import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Brain, Loader2, CheckCircle2, Trash2, Edit3, Save,
  AlertCircle, X, Plus, Images, ChevronRight, ChevronLeft, GripVertical,
  ExternalLink, DollarSign, Zap, RefreshCw, MessageSquare, Sparkles,
  GitMerge, Star, Users, ChevronDown
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts?.headers || {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

interface UploadedImage {
  id: string;
  file: File;
  preview: string;
  base64: string;
  status: 'pending' | 'analyzing' | 'done' | 'error';
  errorMsg?: string;
}

interface Note {
  id: string;
  text: string;
  editing: boolean;
  sourceImg?: number;
}

type LearnStatus = 'new' | 'enhances' | 'duplicate';
interface LearnedAlgorithm {
  algorithm: string;
  status: LearnStatus;
  selected: boolean;
}

interface BotUsageData {
  thisMonth: { costUsd: number; tokens: number; botReplies: number; imageCalls: number };
  allTime:   { costUsd: number; tokens: number };
}

interface TrainingUsageData {
  thisMonth: { imagesAnalyzed: number; notesExtracted: number; costUsd: number; inputTokens: number; outputTokens: number };
  allTime:   { imagesAnalyzed: number; notesExtracted: number; costUsd: number };
  perImage:  { estimatedCostUsd: number; model: string };
}

export default function BotTraining() {
  const { language, isRtl } = useTranslation();
  const ar = language === 'ar';
  const [activeTab, setActiveTab] = useState<'images' | 'learn'>('images');

  // ── Learn-from-conversations state ──
  const [learnSource, setLearnSource] = useState<'bookings' | 'all'>('bookings');
  const [learnLimit, setLearnLimit] = useState(20);
  const [learning, setLearning] = useState(false);
  const [learnResult, setLearnResult] = useState<{
    algorithms: LearnedAlgorithm[];
    conversationsAnalyzed: number;
    skippedAlreadyAnalyzed: number;
  } | null>(null);
  const [learnError, setLearnError] = useState<string | null>(null);
  const [convHistory, setConvHistory] = useState<{
    total: number;
    totalAlgorithms: number;
    history: Array<{ conversationId: string; senderName: string; platform: string; algorithmsExtracted: number; analyzedAt: string }>;
  } | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistoryList, setShowHistoryList] = useState(false);

  // ── Image-upload state ──
  const [dropZoneActive, setDropZoneActive] = useState(false);
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState('');
  const [notes, setNotes] = useState<Note[]>(() => {
    try {
      const saved = sessionStorage.getItem('bot_training_notes');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [recovered, setRecovered] = useState(() => {
    try {
      const saved = sessionStorage.getItem('bot_training_notes');
      const parsed = saved ? JSON.parse(saved) : [];
      return parsed.length > 0;
    } catch { return false; }
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveResult, setSaveResult] = useState<{ totalCount: number; addedCount: number; mergedCount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [botUsage, setBotUsage] = useState<BotUsageData | null>(null);
  const [trainUsage, setTrainUsage] = useState<TrainingUsageData | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);

  const fetchUsage = useCallback(async () => {
    setUsageLoading(true);
    try {
      const [bot, train] = await Promise.all([
        apiFetch('/api/usage'),
        apiFetch('/api/bot-training/usage'),
      ]);
      setBotUsage(bot);
      setTrainUsage(train);
    } catch { /* silent */ } finally {
      setUsageLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsage(); }, [fetchUsage]);

  // Persist notes to sessionStorage on every change
  useEffect(() => {
    try {
      if (notes.length > 0) {
        sessionStorage.setItem('bot_training_notes', JSON.stringify(notes));
      } else {
        sessionStorage.removeItem('bot_training_notes');
      }
    } catch { /* storage full — ignore */ }
  }, [notes]);

  // Drag-to-reorder state
  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  /* ── File handling ── */
  const addFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (arr.length === 0) { setError('يرجى اختيار صور فقط (JPG، PNG، WebP)'); return; }
    setError(null);
    setSaved(false);
    const newImgs: UploadedImage[] = await Promise.all(
      arr.map(async (file) => {
        const b64 = await fileToBase64(file);
        return { id: `img-${Date.now()}-${Math.random()}`, file, preview: b64, base64: b64, status: 'pending' as const };
      })
    );
    setImages(prev => [...prev, ...newImgs]);
  }, []);

  const onDropZone = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDropZoneActive(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) addFiles(e.target.files);
    e.target.value = '';
  };

  const removeImage = (id: string) => setImages(prev => prev.filter(img => img.id !== id));

  /* ── Reorder helpers ── */
  const moveImage = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= images.length) return;
    setImages(prev => {
      const arr = [...prev];
      const [moved] = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, moved);
      return arr;
    });
  };

  // HTML5 drag-to-reorder handlers on thumbnails
  const onThumbDragStart = (e: React.DragEvent, idx: number) => {
    dragIndexRef.current = idx;
    e.dataTransfer.effectAllowed = 'move';
    // use a transparent image so native ghost doesn't show
    const ghost = document.createElement('div');
    ghost.style.opacity = '0';
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    setTimeout(() => document.body.removeChild(ghost), 0);
  };

  const onThumbDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(idx);
  };

  const onThumbDrop = (e: React.DragEvent, toIdx: number) => {
    e.preventDefault();
    e.stopPropagation(); // don't bubble to file drop zone
    const fromIdx = dragIndexRef.current;
    if (fromIdx !== null && fromIdx !== toIdx) moveImage(fromIdx, toIdx);
    dragIndexRef.current = null;
    setDragOverIndex(null);
  };

  const onThumbDragEnd = () => {
    dragIndexRef.current = null;
    setDragOverIndex(null);
  };

  /* ── Analysis ── */
  const analyze = async () => {
    const pending = images.filter(img => img.status === 'pending');
    if (pending.length === 0) return;
    setAnalyzing(true);
    setError(null);
    setNotes([]);
    setSaved(false);
    const allNotes: Note[] = [];

    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      if (img.status !== 'pending') continue;
      setAnalyzeProgress(`جاري تحليل الصورة ${i + 1} من ${images.length}...`);
      setImages(prev => prev.map(im => im.id === img.id ? { ...im, status: 'analyzing' } : im));

      try {
        const data = await apiFetch('/api/bot-training/analyze', {
          method: 'POST',
          body: JSON.stringify({ imageBase64: img.base64 }),
        });
        const extracted: Note[] = (data.notes || []).map((text: string, j: number) => ({
          id: `note-${Date.now()}-${i}-${j}`,
          text,
          editing: false,
          sourceImg: i + 1,
        }));
        allNotes.push(...extracted);
        setImages(prev => prev.map(im => im.id === img.id ? { ...im, status: 'done' } : im));
      } catch (err: any) {
        setImages(prev => prev.map(im => im.id === img.id ? { ...im, status: 'error', errorMsg: err.message } : im));
      }
    }

    setAnalyzeProgress('');
    setAnalyzing(false);
    if (allNotes.length === 0) {
      setError('لم يتمكن البوت من استخراج أي خوارزميات، جرب صور أوضح');
    } else {
      setNotes(allNotes);
    }
  };

  /* ── Notes ── */
  const deleteNote = (id: string) => setNotes(prev => prev.filter(n => n.id !== id));
  const toggleEdit = (id: string) => setNotes(prev => prev.map(n => n.id === id ? { ...n, editing: !n.editing } : n));
  const updateText = (id: string, text: string) => setNotes(prev => prev.map(n => n.id === id ? { ...n, text } : n));
  const addNote = () => setNotes(prev => [...prev, { id: `note-${Date.now()}`, text: '', editing: true }]);

  const saveNotes = async () => {
    const validNotes = notes.filter(n => n.text.trim());
    if (validNotes.length === 0) { setError('لا توجد خوارزميات للحفظ'); return; }
    setSaving(true);
    setError(null);
    try {
      const result = await apiFetch('/api/bot-training/save', {
        method: 'POST',
        body: JSON.stringify({ notes: validNotes.map(n => n.text.trim()) }),
      });
      sessionStorage.removeItem('bot_training_notes');
      setSaveResult(result);
      setSaved(true);
      setRecovered(false);
      setTimeout(() => { setImages([]); setNotes([]); setSaved(false); setSaveResult(null); }, 4000);
    } catch (err: any) {
      setError(err.message || 'حدث خطأ أثناء الحفظ');
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    sessionStorage.removeItem('bot_training_notes');
    setImages([]); setNotes([]); setError(null);
    setSaved(false); setAnalyzing(false); setAnalyzeProgress('');
    setRecovered(false);
  };

  const pendingCount = images.filter(i => i.status === 'pending').length;

  /* ── Learn from conversations ── */
  const fetchConvHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const data = await apiFetch('/api/bot-training/conv-history');
      setConvHistory(data);
    } catch { /* silent */ } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'learn') fetchConvHistory();
  }, [activeTab, fetchConvHistory]);

  const resetConvHistory = async () => {
    if (!window.confirm('هل تريد إعادة ضبط سجل المحادثات؟ سيسمح هذا بإعادة تحليل نفس المحادثات.')) return;
    try {
      await apiFetch('/api/bot-training/conv-history', { method: 'DELETE' });
      setConvHistory({ total: 0, totalAlgorithms: 0, history: [] });
    } catch (err: any) {
      setLearnError(err.message || 'حدث خطأ');
    }
  };

  const startLearning = async () => {
    setLearning(true);
    setLearnError(null);
    setLearnResult(null);
    try {
      const data = await apiFetch('/api/bot-training/learn', {
        method: 'POST',
        body: JSON.stringify({ source: learnSource, limit: learnLimit }),
      });
      const algorithms: LearnedAlgorithm[] = (data.compared as Array<{ algorithm: string; status: LearnStatus }>)
        .map(c => ({ algorithm: c.algorithm, status: c.status, selected: c.status !== 'duplicate' }));
      setLearnResult({
        algorithms,
        conversationsAnalyzed: data.conversationsAnalyzed,
        skippedAlreadyAnalyzed: data.skippedAlreadyAnalyzed ?? 0,
      });
      // Refresh history after analysis
      fetchConvHistory();
    } catch (err: any) {
      setLearnError(err.message || 'حدث خطأ أثناء التحليل');
    } finally {
      setLearning(false);
    }
  };

  const toggleLearnAlg = (idx: number) => {
    if (!learnResult) return;
    setLearnResult(prev => ({
      ...prev!,
      algorithms: prev!.algorithms.map((a, i) => i === idx ? { ...a, selected: !a.selected } : a),
    }));
  };

  const sendLearnedToReview = () => {
    if (!learnResult) return;
    const selected = learnResult.algorithms.filter(a => a.selected);
    if (selected.length === 0) return;
    const newNotes: Note[] = selected.map(a => ({
      id: `note-${Date.now()}-${Math.random()}`,
      text: a.algorithm,
      editing: false,
    }));
    setNotes(prev => [...prev, ...newNotes]);
    setLearnResult(null);
    setActiveTab('images');
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6" dir={isRtl ? 'rtl' : 'ltr'}>

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-purple-100 rounded-xl">
          <Brain className="w-7 h-7 text-purple-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{ar ? 'تدريب البوت' : 'Bot Training'}</h1>
          <p className="text-sm text-gray-500">{ar ? 'علّم البوت من الصور أو من المحادثات الحقيقية' : 'Teach the bot from images or real conversations'}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-gray-100 p-1 rounded-xl gap-1">
        <button
          onClick={() => setActiveTab('images')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'images'
              ? 'bg-white text-purple-700 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Images className="w-4 h-4" />
          {ar ? 'رفع صور المحادثات' : 'Upload Conversation Images'}
        </button>
        <button
          onClick={() => setActiveTab('learn')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'learn'
              ? 'bg-white text-blue-700 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          {ar ? 'تعلم من المحادثات' : 'Learn from Conversations'}
        </button>
      </div>

      {/* Recovery banner — shown when notes restored from session */}
      {recovered && notes.length > 0 && !saved && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <span className="text-xl">⚠️</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">تم استعادة {notes.length} خوارزمية من جلسة سابقة</p>
            <p className="text-xs text-amber-600 mt-0.5">الصفحة انحدّثت قبل الحفظ — خوارزمياتك لا تزال موجودة، احفظها الآن</p>
          </div>
          <button
            onClick={() => setRecovered(false)}
            className="text-amber-400 hover:text-amber-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Billing widget */}
      <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-gray-600" />
            <span className="text-sm font-bold text-gray-700">فاتورة OpenAI — هذا الشهر</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchUsage}
              disabled={usageLoading}
              className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-500 transition-colors"
              title="تحديث"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${usageLoading ? 'animate-spin' : ''}`} />
            </button>
            <a
              href="https://platform.openai.com/usage"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-violet-600 hover:text-violet-800 font-medium bg-white border border-violet-200 px-2.5 py-1.5 rounded-lg transition-colors hover:bg-violet-50"
            >
              <ExternalLink className="w-3 h-3" />
              موقع OpenAI
            </a>
          </div>
        </div>

        {usageLoading ? (
          <div className="flex items-center gap-2 text-gray-400 text-sm p-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>جاري تحميل البيانات...</span>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">

            {/* Row 1 — Bot (website/social) */}
            <div className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
                <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">البوت — الموقع والسوشيال ميديا</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center">
                  <p className="text-xs text-gray-400 mb-0.5">تكلفة الشهر</p>
                  <p className="text-lg font-bold text-blue-600">
                    {botUsage ? `$${botUsage.thisMonth.costUsd.toFixed(3)}` : '—'}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-400 mb-0.5">إجمالي الكل</p>
                  <p className="text-lg font-bold text-gray-600">
                    {botUsage ? `$${botUsage.allTime.costUsd.toFixed(3)}` : '—'}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-400 mb-0.5">ردود البوت</p>
                  <p className="text-lg font-bold text-gray-700">
                    {botUsage ? botUsage.thisMonth.botReplies.toLocaleString() : '—'}
                  </p>
                </div>
              </div>
            </div>

            {/* Row 2 — Training images */}
            <div className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shrink-0" />
                <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">تدريب البوت — تحليل الصور</span>
                {trainUsage && (
                  <span className="text-xs text-gray-400 mr-auto">
                    ~${trainUsage.perImage.estimatedCostUsd.toFixed(4)} / صورة
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center">
                  <p className="text-xs text-gray-400 mb-0.5">تكلفة الشهر</p>
                  <p className="text-lg font-bold text-purple-600">
                    {trainUsage ? `$${trainUsage.thisMonth.costUsd.toFixed(4)}` : '—'}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-400 mb-0.5">إجمالي الكل</p>
                  <p className="text-lg font-bold text-gray-600">
                    {trainUsage ? `$${trainUsage.allTime.costUsd.toFixed(4)}` : '—'}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-400 mb-0.5">صور محللة</p>
                  <p className="text-lg font-bold text-gray-700 flex items-center justify-center gap-1">
                    <Zap className="w-3.5 h-3.5 text-yellow-500" />
                    {trainUsage ? trainUsage.thisMonth.imagesAnalyzed : '—'}
                  </p>
                </div>
              </div>
            </div>

            {/* Row 3 — Total combined */}
            <div className="px-4 py-3 bg-gray-50 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500">المجموع الكلي هذا الشهر</span>
              <span className="text-base font-bold text-gray-800">
                {botUsage && trainUsage
                  ? `$${(botUsage.thisMonth.costUsd + trainUsage.thisMonth.costUsd).toFixed(4)}`
                  : '—'
                }
              </span>
            </div>

          </div>
        )}
      </div>

      {/* ── Learn-from-conversations tab ── */}
      {activeTab === 'learn' && (
        <div className="space-y-5">

          {/* Conv history stats panel */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-bold text-gray-700">سجل المحادثات المحللة</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={fetchConvHistory}
                  disabled={historyLoading}
                  className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-500 transition-colors"
                  title="تحديث"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${historyLoading ? 'animate-spin' : ''}`} />
                </button>
                {convHistory && convHistory.total > 0 && (
                  <button
                    onClick={resetConvHistory}
                    className="text-xs text-red-400 hover:text-red-600 border border-red-200 px-2 py-1 rounded-lg transition-colors"
                    title="إعادة ضبط السجل"
                  >
                    إعادة ضبط
                  </button>
                )}
              </div>
            </div>

            {historyLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
              </div>
            ) : convHistory ? (
              <div>
                {/* Summary counters */}
                <div className="grid grid-cols-2 divide-x divide-x-reverse divide-gray-100">
                  <div className="px-5 py-4 text-center">
                    <p className="text-2xl font-bold text-blue-600">{convHistory.total}</p>
                    <p className="text-xs text-gray-500 mt-1">حساب تم تحليله</p>
                  </div>
                  <div className="px-5 py-4 text-center">
                    <p className="text-2xl font-bold text-purple-600">{convHistory.totalAlgorithms}</p>
                    <p className="text-xs text-gray-500 mt-1">خوارزمية مستخرجة</p>
                  </div>
                </div>

                {/* Expandable history list */}
                {convHistory.history.length > 0 && (
                  <div className="border-t border-gray-100">
                    <button
                      onClick={() => setShowHistoryList(v => !v)}
                      className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      <span className="font-medium">عرض تفاصيل الحسابات ({convHistory.history.length})</span>
                      <ChevronDown className={`w-4 h-4 transition-transform ${showHistoryList ? 'rotate-180' : ''}`} />
                    </button>
                    {showHistoryList && (
                      <div className="max-h-48 overflow-y-auto divide-y divide-gray-50 border-t border-gray-100">
                        {convHistory.history.map((h, idx) => (
                          <div key={h.conversationId} className="flex items-center gap-3 px-4 py-2.5">
                            <span className="text-xs text-gray-400 w-5 shrink-0">{idx + 1}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-700 truncate">{h.senderName}</p>
                              <p className="text-xs text-gray-400">
                                {h.platform === 'instagram' ? '📸 إنستغرام' : '📘 فيسبوك'} •{' '}
                                {new Date(h.analyzedAt).toLocaleDateString('ar-IQ')}
                              </p>
                            </div>
                            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-semibold shrink-0">
                              {h.algorithmsExtracted} خوارزمية
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {convHistory.total === 0 && (
                  <p className="text-center text-sm text-gray-400 py-4">لم يتم تحليل أي محادثات بعد</p>
                )}
              </div>
            ) : null}
          </div>

          {/* Source + Limit controls */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4 shadow-sm">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-blue-600" />
              اختر مصدر المحادثات
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setLearnSource('bookings')}
                className={`flex flex-col items-center gap-2 p-3.5 rounded-xl border-2 transition-all text-sm font-medium ${
                  learnSource === 'bookings'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                <Star className="w-5 h-5" />
                <span>محادثات فيها حجوزات</span>
                <span className="text-xs font-normal opacity-70">الأكثر فائدة للتعلم</span>
              </button>
              <button
                onClick={() => setLearnSource('all')}
                className={`flex flex-col items-center gap-2 p-3.5 rounded-xl border-2 transition-all text-sm font-medium ${
                  learnSource === 'all'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                <Users className="w-5 h-5" />
                <span>كل المحادثات الأخيرة</span>
                <span className="text-xs font-normal opacity-70">شامل أكثر</span>
              </button>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600 shrink-0">عدد المحادثات:</span>
              <div className="flex gap-2">
                {[10, 20, 50, 100, 200].map(n => (
                  <button
                    key={n}
                    onClick={() => setLearnLimit(n)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-all ${
                      learnLimit === n
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'border-gray-200 text-gray-600 hover:border-blue-300'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={startLearning}
              disabled={learning}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold py-3.5 rounded-xl transition-colors"
            >
              {learning ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> جاري تحليل المحادثات...</>
              ) : (
                <><Sparkles className="w-5 h-5" /> ابدأ التحليل واستخرج الخوارزميات</>
              )}
            </button>
          </div>

          {/* Learn error */}
          {learnError && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">
              <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
              <p className="text-sm">{learnError}</p>
            </div>
          )}

          {/* Results */}
          {learnResult && learnResult.algorithms.length > 0 && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-gray-800">نتائج التحليل</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    تم تحليل <strong>{learnResult.conversationsAnalyzed}</strong> محادثة جديدة
                    {learnResult.skippedAlreadyAnalyzed > 0 && (
                      <span className="text-amber-600"> • تجاوز {learnResult.skippedAlreadyAnalyzed} محللة مسبقاً</span>
                    )}
                  </p>
                </div>
                <div className="flex gap-2 text-xs">
                  <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full font-semibold">
                    ✨ {learnResult.algorithms.filter(a => a.status === 'new').length} جديدة
                  </span>
                  <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-semibold">
                    🔗 {learnResult.algorithms.filter(a => a.status === 'enhances').length} تعزز
                  </span>
                  <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-full font-semibold">
                    ♻️ {learnResult.algorithms.filter(a => a.status === 'duplicate').length} مكررة
                  </span>
                </div>
              </div>

              {/* Algorithm cards */}
              <div className="space-y-2">
                {learnResult.algorithms.map((alg, idx) => (
                  <div
                    key={idx}
                    onClick={() => toggleLearnAlg(idx)}
                    className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                      alg.selected
                        ? 'border-blue-400 bg-blue-50'
                        : 'border-gray-200 bg-white opacity-60'
                    }`}
                  >
                    <div className={`mt-0.5 w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-all ${
                      alg.selected ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                    }`}>
                      {alg.selected && <CheckCircle2 className="w-3 h-3 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 leading-relaxed">{alg.algorithm}</p>
                      <div className="mt-1.5">
                        {alg.status === 'new' && (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">✨ جديدة كلياً</span>
                        )}
                        {alg.status === 'enhances' && (
                          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">🔗 تعزز موجودة</span>
                        )}
                        {alg.status === 'duplicate' && (
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">♻️ موجودة بالفعل</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Send to review button */}
              <button
                onClick={sendLearnedToReview}
                disabled={learnResult.algorithms.filter(a => a.selected).length === 0}
                className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-bold py-3.5 rounded-xl transition-colors shadow-md"
              >
                <GitMerge className="w-5 h-5" />
                أضف {learnResult.algorithms.filter(a => a.selected).length} خوارزمية للمراجعة والحفظ
              </button>
            </div>
          )}

          {learnResult && learnResult.algorithms.length === 0 && (
            <div className="text-center py-10 text-gray-500">
              <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">لم يتم استخراج خوارزميات</p>
              <p className="text-sm mt-1">جرب زيادة عدد المحادثات أو اختر "كل المحادثات"</p>
            </div>
          )}
        </div>
      )}

      {/* Drop zone */}
      {activeTab === 'images' && notes.length === 0 && !saved && (
        <div
          onDragOver={e => { e.preventDefault(); if (dragIndexRef.current === null) setDropZoneActive(true); }}
          onDragLeave={() => setDropZoneActive(false)}
          onDrop={e => { if (dragIndexRef.current !== null) return; onDropZone(e); }}
          onClick={() => fileInputRef.current?.click()}
          className={`
            border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-200
            ${dropZoneActive
              ? 'border-purple-500 bg-purple-50 scale-[1.01]'
              : images.length > 0
                ? 'border-gray-200 bg-gray-50 hover:border-purple-300 hover:bg-purple-50'
                : 'border-gray-300 bg-gray-50 hover:border-purple-400 hover:bg-purple-50'
            }
          `}
        >
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={onFileChange} />
          <div className="flex flex-col items-center gap-3">
            <div className={`p-3 rounded-full transition-colors ${dropZoneActive ? 'bg-purple-200' : images.length > 0 ? 'bg-purple-100' : 'bg-gray-200'}`}>
              <Images className={`w-9 h-9 ${dropZoneActive || images.length > 0 ? 'text-purple-500' : 'text-gray-400'}`} />
            </div>
            {images.length === 0 ? (
              <div>
                <p className="text-base font-semibold text-gray-700">ارفع صور المحادثات أو الحجوزات</p>
                <p className="text-sm text-gray-400 mt-1">اسحب وأفلت عدة صور أو اضغط للاختيار • JPG، PNG، WebP</p>
              </div>
            ) : (
              <div>
                <p className="text-sm font-semibold text-purple-600">إضافة المزيد من الصور</p>
                <p className="text-xs text-gray-400 mt-0.5">اضغط أو اسحب لإضافة صور إضافية</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Images grid with reorder */}
      {activeTab === 'images' && images.length > 0 && notes.length === 0 && !saved && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-semibold text-gray-700">
                {images.length} {images.length === 1 ? 'صورة' : 'صور'}
              </span>
              {images.length > 1 && (
                <p className="text-xs text-gray-400 mt-0.5">اسحب الصور لترتيبها، أو استخدم الأسهم — الترقيم = ترتيب التحليل</p>
              )}
            </div>
            {!analyzing && (
              <button onClick={reset} className="text-xs text-red-400 hover:text-red-600 transition-colors">
                حذف الكل
              </button>
            )}
          </div>

          {/* Thumbnails list — vertical for easy reordering */}
          <div className="space-y-2">
            {images.map((img, idx) => (
              <div
                key={img.id}
                draggable={!analyzing && img.status !== 'analyzing'}
                onDragStart={e => onThumbDragStart(e, idx)}
                onDragOver={e => onThumbDragOver(e, idx)}
                onDrop={e => onThumbDrop(e, idx)}
                onDragEnd={onThumbDragEnd}
                className={`
                  flex items-center gap-3 bg-white border rounded-xl p-2 transition-all
                  ${dragOverIndex === idx && dragIndexRef.current !== idx
                    ? 'border-purple-500 bg-purple-50 shadow-md scale-[1.01]'
                    : 'border-gray-200 hover:border-gray-300'
                  }
                  ${img.status === 'analyzing' ? 'opacity-80' : ''}
                `}
              >
                {/* Drag handle + order number */}
                <div className="flex flex-col items-center gap-0.5 cursor-grab active:cursor-grabbing px-1 select-none">
                  <GripVertical className="w-4 h-4 text-gray-300" />
                  <span className="text-xs font-bold text-purple-600 bg-purple-100 rounded-full w-5 h-5 flex items-center justify-center leading-none">
                    {idx + 1}
                  </span>
                </div>

                {/* Thumbnail */}
                <div className="relative w-16 h-16 shrink-0 rounded-lg overflow-hidden border border-gray-100 bg-gray-50">
                  <img src={img.preview} alt={`صورة ${idx + 1}`} className="w-full h-full object-cover" />
                  {img.status === 'analyzing' && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <Loader2 className="w-5 h-5 text-white animate-spin" />
                    </div>
                  )}
                  {img.status === 'done' && (
                    <div className="absolute inset-0 bg-green-600/40 flex items-center justify-center">
                      <CheckCircle2 className="w-6 h-6 text-white" />
                    </div>
                  )}
                  {img.status === 'error' && (
                    <div className="absolute inset-0 bg-red-500/40 flex items-center justify-center">
                      <AlertCircle className="w-6 h-6 text-white" />
                    </div>
                  )}
                </div>

                {/* File name + status */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700 truncate">{img.file.name}</p>
                  <p className="text-xs mt-0.5">
                    {img.status === 'pending' && <span className="text-gray-400">في الانتظار</span>}
                    {img.status === 'analyzing' && <span className="text-purple-500 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> جاري التحليل...</span>}
                    {img.status === 'done' && <span className="text-green-600">✓ تم التحليل</span>}
                    {img.status === 'error' && <span className="text-red-500">✗ {img.errorMsg || 'خطأ'}</span>}
                  </p>
                </div>

                {/* Move buttons */}
                {!analyzing && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => moveImage(idx, idx - 1)}
                      disabled={idx === 0}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-purple-600 hover:bg-purple-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title="تحريك لأعلى"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => moveImage(idx, idx + 1)}
                      disabled={idx === images.length - 1}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-purple-600 hover:bg-purple-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title="تحريك لأسفل"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => removeImage(img.id)}
                      disabled={analyzing}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-30"
                      title="حذف"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Analyze button */}
          {pendingCount > 0 && (
            <button
              onClick={analyze}
              disabled={analyzing}
              className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white font-semibold py-3.5 px-6 rounded-xl transition-colors"
            >
              {analyzing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {analyzeProgress || 'جاري التحليل...'}
                </>
              ) : (
                <>
                  <Brain className="w-5 h-5" />
                  تحليل {images.length > 1 ? `${pendingCount} صور بالترتيب` : 'الصورة'} واستخراج الخوارزميات
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">
          <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Success */}
      {saved && (
        <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-xl p-4 text-green-700">
          <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold">تم الحفظ والدمج بنجاح!</p>
            {saveResult && (
              <div className="mt-1 flex flex-wrap gap-3 text-xs text-green-600">
                <span>📚 المجموع: <strong>{saveResult.totalCount} خوارزمية</strong></span>
                {saveResult.addedCount > 0 && (
                  <span>✨ جديدة: <strong>{saveResult.addedCount}</strong></span>
                )}
                {saveResult.mergedCount > 0 && (
                  <span>🔀 دُمجت مع القديمة: <strong>{saveResult.mergedCount}</strong></span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Notes */}
      {notes.length > 0 && !saved && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-800">الخوارزميات المستخرجة</h2>
              <p className="text-sm text-gray-500">راجع وعدّل أو احذف ما تريد قبل الحفظ</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="bg-purple-100 text-purple-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                {notes.filter(n => n.text.trim()).length} خوارزمية
              </span>
              <button
                onClick={reset}
                className="text-xs text-gray-400 hover:text-red-500 border border-gray-200 px-2 py-1 rounded-lg transition-colors"
              >
                بدء من جديد
              </button>
            </div>
          </div>

          {/* Source summary */}
          {images.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {images.map((img, idx) => (
                <div key={img.id} className="flex items-center gap-1.5 bg-gray-100 rounded-full px-3 py-1 text-xs text-gray-600">
                  <img src={img.preview} alt="" className="w-4 h-4 rounded-full object-cover" />
                  صورة {idx + 1}
                  {img.status === 'done' && <CheckCircle2 className="w-3 h-3 text-green-500" />}
                  {img.status === 'error' && <AlertCircle className="w-3 h-3 text-red-500" />}
                </div>
              ))}
            </div>
          )}

          <div className="space-y-3">
            {notes.map((note, idx) => (
              <div key={note.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-100">
                  <span className="text-xs font-bold text-purple-600 bg-purple-100 rounded-full w-5 h-5 flex items-center justify-center">
                    {idx + 1}
                  </span>
                  <span className="text-xs text-gray-500 flex-1">
                    خوارزمية {idx + 1}
                    {note.sourceImg && images.length > 1 && (
                      <span className="mr-2 text-gray-400">• من الصورة {note.sourceImg}</span>
                    )}
                  </span>
                  <button
                    onClick={() => toggleEdit(note.id)}
                    className={`p-1 rounded-lg transition-colors ${note.editing ? 'text-blue-600 bg-blue-50' : 'text-gray-400 hover:text-blue-600 hover:bg-blue-50'}`}
                    title="تعديل"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => deleteNote(note.id)}
                    className="p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    title="حذف"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="p-4">
                  {note.editing ? (
                    <textarea
                      value={note.text}
                      onChange={e => updateText(note.id, e.target.value)}
                      rows={4}
                      className="w-full text-sm text-gray-800 border border-purple-200 rounded-lg p-3 resize-y focus:outline-none focus:ring-2 focus:ring-purple-300 font-mono leading-relaxed"
                      placeholder="اكتب الخوارزمية هنا..."
                      dir="rtl"
                    />
                  ) : (
                    <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans leading-relaxed">
                      {note.text || <span className="text-gray-400 italic">فارغ — اضغط تعديل أو احذف</span>}
                    </pre>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3 pt-2">
            <button
              onClick={addNote}
              className="flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 hover:border-purple-400 hover:bg-purple-50 text-gray-500 hover:text-purple-600 font-medium py-2.5 rounded-xl transition-all text-sm"
            >
              <Plus className="w-4 h-4" />
              إضافة خوارزمية يدوية
            </button>

            <button
              onClick={saveNotes}
              disabled={saving || notes.filter(n => n.text.trim()).length === 0}
              className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-bold py-3.5 px-6 rounded-xl transition-colors text-base shadow-md"
            >
              {saving ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> جاري الحفظ...</>
              ) : (
                <><Save className="w-5 h-5" /> حفظ {notes.filter(n => n.text.trim()).length} خوارزمية في قاعدة المعرفة</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* How it works */}
      {activeTab === 'images' && images.length === 0 && !analyzing && (
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 space-y-3">
          <h3 className="font-semibold text-blue-800 text-sm">كيف يعمل هذا القسم؟</h3>
          <ol className="text-sm text-blue-700 space-y-2 list-decimal list-inside">
            <li>ارفع صورة أو عدة صور لمحادثات قديمة مع زبائن</li>
            <li><strong>رتّب الصور</strong> بالترتيب الصحيح بالسحب أو الأسهم — الرقم = ترتيب التحليل</li>
            <li>يحلل الذكاء الاصطناعي كل صورة بالترتيب ويستخرج <strong>خوارزميات رد وحجز</strong> للبوت</li>
            <li>راجع الخوارزميات وعدّل ما تريد، ثم احفظ</li>
          </ol>
        </div>
      )}
    </div>
  );
}
