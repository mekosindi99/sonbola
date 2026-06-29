import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Trash2, Phone, ChevronDown, ChevronUp, Search, Star, Plus, X, Save, Pencil } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  imageUrl?: string;
}

interface StorefrontChat {
  id: number;
  name: string;
  phone: string;
  messages: string;
  createdAt: string;
  updatedAt: string;
}

interface Booking {
  id: number;
  phoneNumber: string | null;
  senderName: string | null;
  governorate: string | null;
  status: string;
  totalAmount: number | null;
  starred: boolean;
  createdAt: string;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'الآن';
  if (mins < 60) return `منذ ${mins} دقيقة`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `منذ ${hrs} ساعة`;
  const days = Math.floor(hrs / 24);
  return `منذ ${days} يوم`;
}

interface Suggestion {
  text: string;
  reply: string;
}

const DEFAULT_SUGGESTIONS: Suggestion[] = [
  { text: 'شنو عندكم؟', reply: '' },
  { text: 'ما هي الأسعار؟', reply: '' },
  { text: 'كيف أطلب؟', reply: '' },
  { text: 'طريقة التوصيل', reply: '' },
];

function parseSuggestions(raw: string | undefined): Suggestion[] {
  try {
    const parsed = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_SUGGESTIONS;
    return parsed.map((s: string | Suggestion) =>
      typeof s === 'string' ? { text: s, reply: '' } : { text: s.text || '', reply: s.reply || '' }
    );
  } catch { return DEFAULT_SUGGESTIONS; }
}

export default function StorefrontChats() {
  const { language, isRtl } = useTranslation();
  const ar = language === 'ar';
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  // ── Suggestions state ──
  const [editingSuggestions, setEditingSuggestions] = useState(false);
  const [suggestionDraft, setSuggestionDraft] = useState<Suggestion[]>([]);
  const [newSuggestion, setNewSuggestion] = useState('');
  const [savingSugg, setSavingSugg] = useState(false);
  const [suggSaved, setSuggSaved] = useState(false);

  const { data: chats = [], isLoading } = useQuery<StorefrontChat[]>({
    queryKey: ['storefront-chats'],
    queryFn: async () => {
      const res = await fetch('/api/beqolky/storefront-chats');
      if (!res.ok) throw new Error('Failed to load');
      return res.json();
    },
    refetchInterval: 30000,
  });

  const { data: bookings = [] } = useQuery<Booking[]>({
    queryKey: ['bookings-phones'],
    queryFn: async () => {
      const res = await fetch('/api/bookings');
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 60000,
  });

  const { data: settings } = useQuery<{ storefrontSuggestions?: string }>({
    queryKey: ['settings-suggestions'],
    queryFn: async () => {
      const res = await fetch('/api/settings');
      if (!res.ok) return {};
      return res.json();
    },
  });

  const bookedPhones = new Set(bookings.map(b => b.phoneNumber?.replace(/\D/g, '')));

  const isBooked = (phone: string) => {
    const clean = phone.replace(/\D/g, '');
    return bookedPhones.has(clean) || [...bookedPhones].some(p => p && (p.endsWith(clean) || clean.endsWith(p)));
  };

  const getBookingByPhone = (phone: string): Booking | undefined => {
    const clean = phone.replace(/\D/g, '');
    return bookings.find(b => {
      const bClean = (b.phoneNumber || '').replace(/\D/g, '');
      return bClean === clean || bClean.endsWith(clean) || clean.endsWith(bClean);
    });
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/beqolky/storefront-chats/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['storefront-chats'] }),
  });

  const filtered = chats.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search)
  );

  const currentSuggestions = parseSuggestions(settings?.storefrontSuggestions);

  const startEditSuggestions = () => {
    setSuggestionDraft(currentSuggestions.map(s => ({ ...s })));
    setEditingSuggestions(true);
    setSuggSaved(false);
  };

  const saveSuggestions = async () => {
    setSavingSugg(true);
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storefrontSuggestions: JSON.stringify(suggestionDraft) }),
      });
      queryClient.invalidateQueries({ queryKey: ['settings-suggestions'] });
      setSuggSaved(true);
      setTimeout(() => { setSuggSaved(false); setEditingSuggestions(false); }, 1500);
    } finally {
      setSavingSugg(false);
    }
  };

  const addSuggestion = () => {
    if (!newSuggestion.trim()) return;
    setSuggestionDraft(prev => [...prev, { text: newSuggestion.trim(), reply: '' }]);
    setNewSuggestion('');
  };

  const removeSuggestion = (i: number) => setSuggestionDraft(prev => prev.filter((_, idx) => idx !== i));

  const updateSuggestionText = (i: number, val: string) =>
    setSuggestionDraft(prev => prev.map((s, idx) => idx === i ? { ...s, text: val } : s));

  const updateSuggestionReply = (i: number, val: string) =>
    setSuggestionDraft(prev => prev.map((s, idx) => idx === i ? { ...s, reply: val } : s));

  return (
    <div className="space-y-6" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            {ar ? 'حجوزات الموقع' : 'Website Bookings'}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">{ar ? 'محادثات الزوار مع البوت على واجهة المتجر' : 'Visitor conversations with the bot on the storefront'}</p>
        </div>
        <div className="text-sm text-muted-foreground bg-card/50 border border-white/10 rounded-xl px-4 py-2">
          {chats.length} {ar ? 'محادثة' : 'chats'}
        </div>
      </div>

      {/* ── Suggestions Management ────────────────────────────── */}
      <div className="bg-card/50 border border-white/10 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-foreground flex items-center gap-2">
              <span className="text-xl">💬</span> اقتراحات الكلام في بوت الموقع
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">الأزرار التي تظهر للزوار أسفل الدردشة</p>
          </div>
          {!editingSuggestions && (
            <button
              onClick={startEditSuggestions}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" /> تعديل
            </button>
          )}
        </div>

        {!editingSuggestions ? (
          <div className="space-y-2">
            {currentSuggestions.map((s, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="px-3 py-1.5 rounded-full border border-primary/30 text-primary text-sm bg-primary/5 whitespace-nowrap">
                  {s.text}
                </span>
                {s.reply ? (
                  <span className="text-xs text-muted-foreground bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 flex-1">
                    ← {s.reply}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground/40 italic py-1.5">بدون رد محفوظ — يجيب الـ AI</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {suggestionDraft.map((s, i) => (
              <div key={i} className="bg-background/30 border border-white/10 rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-16 shrink-0">الزر:</span>
                  <input
                    value={s.text}
                    onChange={e => updateSuggestionText(i, e.target.value)}
                    placeholder="نص الزر..."
                    className="flex-1 bg-background/50 border border-white/15 rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary/50"
                  />
                  <button
                    onClick={() => removeSuggestion(i)}
                    className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-xs text-muted-foreground w-16 shrink-0 pt-2">ردي:</span>
                  <textarea
                    value={s.reply}
                    onChange={e => updateSuggestionReply(i, e.target.value)}
                    placeholder="اكتب ردك هنا... (اتركه فارغاً ليجيب الـ AI)"
                    rows={2}
                    className="flex-1 bg-background/50 border border-white/15 rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-green-500/50 resize-none placeholder:text-muted-foreground/50"
                  />
                </div>
              </div>
            ))}

            <div className="flex items-center gap-2 pt-1">
              <input
                value={newSuggestion}
                onChange={e => setNewSuggestion(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addSuggestion()}
                placeholder="اكتب اقتراحاً جديداً..."
                className="flex-1 bg-background/50 border border-dashed border-white/20 rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40"
              />
              <button
                onClick={addSuggestion}
                className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={saveSuggestions}
                disabled={savingSugg}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${suggSaved ? 'bg-green-600 text-white' : 'bg-primary text-white hover:bg-primary/90'}`}
              >
                <Save className="w-3.5 h-3.5" />
                {savingSugg ? 'جارٍ الحفظ...' : suggSaved ? 'تم الحفظ ✓' : 'حفظ الاقتراحات'}
              </button>
              <button
                onClick={() => setEditingSuggestions(false)}
                className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:bg-white/5 transition-colors"
              >
                إلغاء
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="ابحث بالاسم أو الرقم..."
          className="w-full bg-card/50 border border-white/10 rounded-xl px-4 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
        />
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground">
          <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mr-2" />
          جارٍ التحميل...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-3">
          <MessageSquare className="w-12 h-12 opacity-20" />
          <p className="text-sm">{search ? 'لا توجد نتائج' : 'لا توجد محادثات بعد'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(chat => {
            const msgs: ChatMessage[] = (() => {
              try { return JSON.parse(chat.messages); } catch { return []; }
            })();
            const isExpanded = expandedId === chat.id;
            const lastMsg = msgs.filter(m => m.role === 'user').at(-1);
            const hasBooking = isBooked(chat.phone);
            const booking = hasBooking ? getBookingByPhone(chat.phone) : undefined;

            return (
              <div key={chat.id} className={`bg-card/50 border rounded-2xl overflow-hidden transition-all duration-200 ${hasBooking ? 'border-yellow-400/40' : 'border-white/10'}`}>
                {/* Card Header */}
                <div
                  className="flex items-center gap-4 p-4 cursor-pointer hover:bg-white/5 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : chat.id)}
                >
                  {/* Avatar */}
                  <div className="relative w-10 h-10 flex-shrink-0">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-white font-bold text-sm">
                      {chat.name.charAt(0)}
                    </div>
                    {hasBooking && (
                      <span className="absolute -top-1 -right-1 text-base leading-none" title="قام بالحجز">⭐</span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-foreground text-sm">{chat.name}</span>
                      {hasBooking && (
                        <span className="text-xs bg-yellow-400/15 text-yellow-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Star className="w-3 h-3 fill-yellow-400" /> حجز مكتمل
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">{timeAgo(chat.updatedAt)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Phone className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground font-mono" dir="ltr">{chat.phone}</span>
                    </div>
                    {lastMsg && !isExpanded && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        💬 {lastMsg.content}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-lg">
                      {msgs.length} رسالة
                    </span>
                    <button
                      onClick={e => { e.stopPropagation(); if (confirm('حذف هذه المحادثة؟')) deleteMutation.mutate(chat.id); }}
                      className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </div>

                {/* Booking Details Banner */}
                {hasBooking && booking && (
                  <div className="border-t border-yellow-400/20 bg-yellow-400/5 px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                    <span className="font-bold text-yellow-400">📦 تفاصيل الحجز</span>
                    <span className="text-muted-foreground">
                      رقم الطلب: <span className="font-mono text-foreground">#{booking.id + 951}</span>
                    </span>
                    {booking.governorate && (
                      <span className="text-muted-foreground">
                        المحافظة: <span className="text-indigo-300">{booking.governorate}</span>
                      </span>
                    )}
                    {booking.totalAmount != null && booking.totalAmount > 0 && (
                      <span className="text-muted-foreground">
                        المبلغ: <span className="font-semibold text-amber-300">{booking.totalAmount.toLocaleString()} د.ع</span>
                      </span>
                    )}
                    <span className={`px-2 py-0.5 rounded-full font-bold ${
                      booking.status === 'completed' ? 'bg-emerald-500/15 text-emerald-400' :
                      booking.status === 'cancelled' ? 'bg-red-500/15 text-red-400' :
                      'bg-amber-500/15 text-amber-400'
                    }`}>
                      {booking.status === 'completed' ? '✓ مكتمل' : booking.status === 'cancelled' ? '✗ ملغى' : '⏳ معلّق'}
                    </span>
                  </div>
                )}

                {/* Expanded Messages */}
                {isExpanded && (
                  <div className="border-t border-white/10 p-4 space-y-3 max-h-96 overflow-y-auto bg-background/20">
                    {msgs.length === 0 ? (
                      <p className="text-center text-xs text-muted-foreground">لا توجد رسائل</p>
                    ) : msgs.map((msg, i) => (
                      <div key={i} className={`flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                        {msg.imageUrl && (
                          <div className={`max-w-xs overflow-hidden rounded-xl border border-white/10`}>
                            <img
                              src={msg.imageUrl}
                              alt="صورة مرسلة"
                              className="max-w-full max-h-48 object-contain block"
                            />
                          </div>
                        )}
                        {msg.content && (
                          <div className={`max-w-xs lg:max-w-md px-4 py-2.5 rounded-2xl text-sm ${
                            msg.role === 'user'
                              ? 'bg-primary text-white rounded-tr-sm'
                              : 'bg-card border border-white/10 text-foreground rounded-tl-sm'
                          }`}>
                            {msg.content}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
