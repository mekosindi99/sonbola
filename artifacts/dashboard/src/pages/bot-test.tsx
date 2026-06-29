import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Camera, Image as ImageIcon, Paperclip, Mic, Smile, Heart, ThumbsUp,
  Send, RotateCcw, Bot, StopCircle,
  ShoppingCart, MessageSquare, UserPlus, Phone, Video,
  ChevronRight, MoreHorizontal, Info, X, Plus,
  MicOff, Sticker, Flag, CheckCircle,
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';

type Platform = 'instagram' | 'facebook';
type MsgType = 'text' | 'ai' | 'saved_reply' | 'escalation';

interface ChatMessage {
  id: string;
  role: 'user' | 'bot';
  content: string;
  time: string;
  type?: MsgType;
  imageUrl?: string;
  audioUrl?: string;
  fileName?: string;
}

const EMOJI_GROUPS = [
  { label: '😊', emojis: ['😀','😂','🥰','😍','🤩','😎','🥳','😇','🤗','😅','😉','😋','😘','🥺','😢','😡','🤔','😴','🥱','😤'] },
  { label: '👍', emojis: ['👍','👎','❤️','🔥','💯','✨','💪','🙏','👏','🎉','🎊','💕','💔','⭐','🌟','💫','🎁','🏆','💎','🌹'] },
  { label: '🐶', emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🦋','🌸','🌺','🌈','⚡'] },
  { label: '🍕', emojis: ['🍕','🍔','🍟','🌮','🌯','🥗','🍜','🍱','🍰','🎂','🍩','🍪','🍫','☕','🧋','🥤','🍵','🎂','🍦','🍭'] },
];

const STICKERS = [
  '🥰','😍','🤩','😂','💀','😭','🥹','😤','🫶',
  '❤️‍🔥','💯','🔥','✨','💪','🙌','👏','🎉','🏆',
  '💐','🌹','🌺','🎀','🎊','🎁','⭐','🌟','💫',
];

function getTime() {
  return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

// ── localStorage helpers ──────────────────────────────────────────────────────
function lsKey(platform: string) { return `bot-test-chat-${platform}`; }
function sidKey(platform: string) { return `bot-test-sid-${platform}`; }

function loadChatMessages(platform: string): ChatMessage[] {
  try { return JSON.parse(localStorage.getItem(lsKey(platform)) ?? '[]'); } catch { return []; }
}
function saveChatMessages(platform: string, msgs: ChatMessage[]) {
  try {
    // Strip blob audioUrls — they don't survive page reloads
    const safe = msgs.slice(-200).map(m => m.audioUrl?.startsWith('blob:') ? { ...m, audioUrl: undefined } : m);
    localStorage.setItem(lsKey(platform), JSON.stringify(safe));
  } catch {}
}
function loadSessionId(platform: string): string {
  const stored = localStorage.getItem(sidKey(platform));
  if (stored) return stored;
  const fresh = `test-${Date.now()}`;
  localStorage.setItem(sidKey(platform), fresh);
  return fresh;
}
function clearChatStorage(platform: string) {
  localStorage.removeItem(lsKey(platform));
  const fresh = `test-${Date.now()}`;
  localStorage.setItem(sidKey(platform), fresh);
  return fresh;
}

export default function BotTestPage() {
  const { language } = useAppStore();
  const theme = useAppStore((s) => s.theme);
  const [platform, setPlatform] = useState<Platform>('instagram');
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadChatMessages('instagram'));
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string>(() => loadSessionId('instagram'));
  const [showEmoji, setShowEmoji] = useState(false);
  const [showSticker, setShowSticker] = useState(false);
  const [emojiGroup, setEmojiGroup] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [correctionMsgId, setCorrectionMsgId] = useState<string | null>(null);
  const [correctionText, setCorrectionText] = useState('');
  const [savingCorrection, setSavingCorrection] = useState(false);
  const [savedNoteIds, setSavedNoteIds] = useState<Set<string>>(new Set());

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const attachRef = useRef<HTMLInputElement>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const recordTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const isLight = theme === 'light';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // ── Auto-save messages to localStorage whenever they change ──────────────
  useEffect(() => {
    saveChatMessages(platform, messages);
  }, [messages, platform]);

  const resetChat = useCallback(async (keepPlatform?: Platform) => {
    const p = keepPlatform ?? platform;
    try { await fetch(`/api/bot-test/${sessionId}`, { method: 'DELETE' }); } catch {}
    const newSid = clearChatStorage(p);
    setSessionId(newSid);
    setMessages([]);
    setInput('');
    setShowEmoji(false);
    setShowSticker(false);
  }, [sessionId, platform]);

  // When platform switches: load saved messages for that platform
  useEffect(() => {
    const savedMsgs = loadChatMessages(platform);
    const savedSid = loadSessionId(platform);
    setMessages(savedMsgs);
    setSessionId(savedSid);
  }, [platform]);

  useEffect(() => {
    const handler = () => { setShowEmoji(false); setShowSticker(false); };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  const addMessage = (msg: Omit<ChatMessage, 'id' | 'time'>): ChatMessage =>
    ({ ...msg, id: crypto.randomUUID(), time: getTime() });

  const appendBotResponse = useCallback((data: any) => {
    const msgs: ChatMessage[] = [];
    if (data.reply || data.error) {
      msgs.push(addMessage({ role: 'bot', content: data.reply || data.error || 'خطأ', type: data.type ?? 'ai' }));
    }
    if (Array.isArray(data.suggestedProducts) && data.suggestedProducts.length > 0) {
      for (const p of data.suggestedProducts) {
        const displayImg = p.imageUrl || p.publicImageUrl || null;
        if (displayImg) {
          const label = p.publicImageUrl ? `✓ سيُرسل للزبون | ${p.productId}` : `${p.productId} (بدون رابط عام)`;
          msgs.push(addMessage({ role: 'bot', content: label, imageUrl: displayImg, type: 'ai' }));
        }
      }
    }
    if (msgs.length > 0) setMessages(prev => [...prev, ...msgs]);
  }, []);

  const saveCorrection = useCallback(async (msgId: string, botReply: string) => {
    const note = correctionText.trim();
    if (!note) return;
    setSavingCorrection(true);
    try {
      const fullNote = `[تصحيح من اختبار البوت] البوت قال: "${botReply.slice(0, 120)}" — الصح: "${note}"`;
      await fetch('/api/bot-training/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: fullNote }),
      });
      setSavedNoteIds(prev => new Set([...prev, msgId]));
      setCorrectionMsgId(null);
      setCorrectionText('');
    } catch {}
    finally { setSavingCorrection(false); }
  }, [correctionText]);

  const sendToBotAndGetReply = useCallback(async (text: string, imageBase64?: string) => {
    setLoading(true);
    try {
      // Build OpenAI-compatible history from current messages (last 14, text-only)
      const history = messages
        .filter(m => m.content && !m.content.startsWith('⚠️') && !m.audioUrl)
        .slice(-14)
        .map(m => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.content,
        }));
      const res = await fetch('/api/bot-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, platform, sessionId, imageBase64, history }),
      });
      const data = await res.json();
      appendBotResponse(data);
    } catch {
      setMessages(prev => [...prev, addMessage({ role: 'bot', content: '⚠️ خطأ في الاتصال', type: 'text' })]);
    } finally {
      setLoading(false);
    }
  }, [platform, sessionId, messages, appendBotResponse]);

  const sendMessage = useCallback(async (text: string, extra?: Partial<ChatMessage>) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setInput('');
    setShowEmoji(false);
    setShowSticker(false);
    setMessages(prev => [...prev, addMessage({ role: 'user', content: trimmed, ...extra })]);
    await sendToBotAndGetReply(trimmed, extra?.imageUrl);
  }, [loading, sendToBotAndGetReply]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  const handleImageFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      setMessages(prev => {
        const updated = [...prev, addMessage({ role: 'user', content: '', imageUrl: dataUrl })];
        // Send with current history after state update
        const history = updated
          .filter(m => m.content && !m.content.startsWith('⚠️') && !m.audioUrl)
          .slice(-14)
          .map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));
        setLoading(true);
        fetch('/api/bot-test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'ارسل صورة', platform, sessionId, imageBase64: dataUrl, history }),
        })
          .then(r => r.json())
          .then(data => appendBotResponse(data))
          .catch(() => setMessages(p => [...p, addMessage({ role: 'bot', content: '⚠️ خطأ', type: 'text' })]))
          .finally(() => setLoading(false));
        return updated;
      });
    };
    reader.readAsDataURL(file);
  }, [platform, sessionId, appendBotResponse]);

  const handleAttachment = useCallback((file: File) => {
    setMessages(prev => [...prev, addMessage({ role: 'user', content: `📎 ${file.name}`, fileName: file.name })]);
    sendToBotAndGetReply(`أرسل ملف: ${file.name}`);
  }, [sendToBotAndGetReply]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunks.current = [];
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(audioChunks.current, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(blob);
        setMessages(prev => [...prev, addMessage({ role: 'user', content: `🎙️ رسالة صوتية (${recordingSeconds}s)`, audioUrl })]);
        stream.getTracks().forEach(t => t.stop());
        sendToBotAndGetReply(`[رسالة صوتية - ${recordingSeconds} ثانية]`);
        setRecordingSeconds(0);
      };
      mr.start();
      mediaRecorder.current = mr;
      setIsRecording(true);
      recordTimer.current = setInterval(() => setRecordingSeconds(s => s + 1), 1000);
    } catch { alert(language === 'ar' ? 'تعذر الوصول إلى الميكروفون' : 'Cannot access microphone'); }
  }, [language, recordingSeconds, sendToBotAndGetReply]);

  const stopRecording = useCallback(() => {
    if (recordTimer.current) clearInterval(recordTimer.current);
    mediaRecorder.current?.stop();
    setIsRecording(false);
  }, []);

  const quickReplies = platform === 'instagram'
    ? ['السلام عليكم', 'كم سعر المنتج؟', 'وين تتوصلون؟', 'عندكم مقاس 4 سنوات؟', 'ابي استبدال']
    : ['مرحبا', 'شكد سعر بنات 3 سنين؟', 'متوفر أولاد صيف؟', 'ابي اطلب', 'ارجاع منتج'];

  const igGradient = 'linear-gradient(135deg,#a855f7,#ec4899)';
  const fbBlue = '#1877F2';
  const sendColor = platform === 'instagram' ? igGradient : fbBlue;

  return (
    <div className="flex flex-col h-full gap-3">

      {/* ─── Page Header ─── */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-foreground truncate">
            {language === 'ar' ? 'قسم اختبار البوت' : 'Bot Test Center'}
          </h1>
          <p className="text-xs text-muted-foreground hidden sm:block mt-0.5">
            {language === 'ar' ? 'اختبر ردود البوت الذكي قبل التفعيل' : 'Test AI before going live'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {language === 'ar' ? 'نشط' : 'Active'}
          </div>
          <button onClick={() => resetChat()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors text-xs font-medium">
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{language === 'ar' ? 'محادثة جديدة' : 'New Chat'}</span>
          </button>
        </div>
      </div>

      {/* ─── Platform Tabs ─── */}
      <div className="flex gap-2">
        {(['instagram', 'facebook'] as Platform[]).map(p => (
          <button key={p} onClick={() => setPlatform(p)}
            className={cn('flex items-center gap-1.5 px-3 sm:px-5 py-2 rounded-xl font-medium text-xs sm:text-sm transition-all',
              platform === p
                ? p === 'instagram'
                  ? 'bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 text-white shadow-lg'
                  : 'bg-[#1877F2] text-white shadow-lg'
                : 'bg-card text-muted-foreground border border-border hover:bg-accent')}>
            {p === 'instagram'
              ? <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
              : <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>}
            {p === 'instagram' ? 'Instagram' : 'Facebook'}
          </button>
        ))}
      </div>

      {/* ─── Mobile Quick Replies (horizontal scroll) ─── */}
      <div className="flex md:hidden gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {quickReplies.map(r => (
          <button key={r} onClick={() => sendMessage(r)} disabled={loading}
            className="shrink-0 px-3 py-1.5 rounded-full border border-border text-xs text-foreground hover:bg-accent whitespace-nowrap disabled:opacity-50"
            dir="auto">{r}</button>
        ))}
      </div>

      {/* ─── Main Area: Chat + Desktop Side Panel ─── */}
      <div className="flex-1 flex gap-4 min-h-0">

        {/* Chat Simulator */}
        <div className="flex-1 flex flex-col rounded-2xl overflow-hidden border border-border shadow-xl relative min-h-0">

          {/* Platform Header */}
          {platform === 'instagram' ? <IGHeader isLight={isLight} /> : <FBHeader isLight={isLight} />}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3"
            style={{ background: isLight ? '#f0f2f5' : '#1a1a2e', minHeight: 0 }}>
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-3 opacity-40 select-none">
                <Bot className="w-10 h-10 text-muted-foreground" />
                <p className="text-muted-foreground text-sm text-center">
                  {language === 'ar' ? 'ابدأ المحادثة لاختبار البوت' : 'Start chatting to test the bot'}
                </p>
              </div>
            )}
            <AnimatePresence>
              {messages.map((msg) => (
                <motion.div key={msg.id}
                  initial={{ opacity: 0, y: 8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.18 }}
                  className={cn('flex items-end gap-2', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs shrink-0"
                    style={msg.role === 'bot'
                      ? { background: platform === 'instagram' ? igGradient : fbBlue }
                      : { background: '#9ca3af' }}>
                    {msg.role === 'bot' ? '🏪' : '👤'}
                  </div>
                  <div className={cn('flex flex-col gap-0.5 max-w-[75%] sm:max-w-xs lg:max-w-sm', msg.role === 'user' ? 'items-end' : 'items-start')}>
                    {msg.imageUrl && (
                      <div className="relative rounded-2xl overflow-hidden max-w-[160px] sm:max-w-[200px]">
                        <img src={msg.imageUrl} alt="sent" className="w-full object-cover" />
                        {msg.role === 'bot' && msg.content && (
                          <div className={cn(
                            'absolute bottom-0 inset-x-0 px-2 py-1 text-[10px] font-medium text-center truncate',
                            msg.content.startsWith('✓')
                              ? 'bg-emerald-500/90 text-white'
                              : 'bg-black/70 text-amber-300'
                          )}>
                            {msg.content}
                          </div>
                        )}
                      </div>
                    )}
                    {msg.audioUrl && (
                      <div className={cn('px-3 py-2 rounded-2xl', msg.role === 'user' ? 'text-white' : 'bg-white shadow-sm')}
                        style={msg.role === 'user' ? { background: sendColor } : {}}>
                        <audio controls src={msg.audioUrl} className="h-7 w-36 sm:w-44" />
                      </div>
                    )}
                    {msg.content && !(msg.imageUrl && msg.role === 'bot') && (
                      <div className={cn(
                        'px-3 sm:px-4 py-2 sm:py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words',
                        msg.role === 'user'
                          ? 'text-white rounded-t-2xl rounded-s-2xl rounded-e-sm'
                          : 'bg-white text-gray-900 rounded-t-2xl rounded-e-2xl rounded-s-sm shadow-sm',
                        msg.type === 'escalation' && msg.role === 'bot' && 'border-2 border-orange-400',
                        msg.type === 'saved_reply' && msg.role === 'bot' && 'border border-emerald-400/50',
                      )}
                        style={msg.role === 'user' ? { background: sendColor } : {}}>
                        {msg.content}
                      </div>
                    )}
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground px-1">
                      {msg.time}
                      {msg.type === 'saved_reply' && <span className="text-emerald-400">· محفوظ</span>}
                      {msg.type === 'escalation' && <span className="text-orange-400">· تصعيد</span>}
                      {msg.type === 'ai' && <span className="text-blue-400">· AI</span>}
                      {/* Correction button — bot text messages only */}
                      {msg.role === 'bot' && msg.content && !msg.imageUrl && (
                        savedNoteIds.has(msg.id) ? (
                          <span className="flex items-center gap-0.5 text-emerald-400 ms-1">
                            <CheckCircle className="w-3 h-3" />
                            {language === 'ar' ? 'تم الحفظ' : 'Saved'}
                          </span>
                        ) : (
                          <button
                            onClick={() => {
                              setCorrectionMsgId(correctionMsgId === msg.id ? null : msg.id);
                              setCorrectionText('');
                            }}
                            title={language === 'ar' ? 'تصحيح هذا الرد' : 'Correct this reply'}
                            className={cn(
                              'flex items-center gap-0.5 ms-1 px-1.5 py-0.5 rounded-full transition-colors text-[10px] font-medium',
                              correctionMsgId === msg.id
                                ? 'bg-red-500/20 text-red-400'
                                : 'text-muted-foreground hover:text-red-400 hover:bg-red-500/10'
                            )}>
                            <Flag className="w-2.5 h-2.5" />
                            {language === 'ar' ? 'تصحيح' : 'Correct'}
                          </button>
                        )
                      )}
                    </div>

                    {/* Inline correction form */}
                    <AnimatePresence>
                      {correctionMsgId === msg.id && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="w-full overflow-hidden">
                          <div className="mt-1 rounded-xl border border-red-400/40 bg-red-500/5 p-2 flex flex-col gap-1.5">
                            <p className="text-[10px] text-red-400 font-medium px-0.5">
                              {language === 'ar'
                                ? '✏️ اكتب الرد الصحيح — سيُحفظ كملاحظة تدريب للبوت'
                                : '✏️ Write the correct reply — will be saved as a training note'}
                            </p>
                            <textarea
                              autoFocus
                              value={correctionText}
                              onChange={e => setCorrectionText(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                  e.preventDefault();
                                  saveCorrection(msg.id, msg.content);
                                }
                                if (e.key === 'Escape') { setCorrectionMsgId(null); setCorrectionText(''); }
                              }}
                              placeholder={language === 'ar' ? 'الرد الصحيح يكون...' : 'The correct reply should be...'}
                              rows={2}
                              className="w-full text-xs rounded-lg border border-red-400/30 bg-background px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-red-400/50 text-foreground placeholder:text-muted-foreground"
                            />
                            <div className="flex items-center gap-1.5 justify-end">
                              <button
                                onClick={() => { setCorrectionMsgId(null); setCorrectionText(''); }}
                                className="text-[10px] px-2 py-0.5 rounded-full text-muted-foreground hover:text-foreground transition-colors">
                                {language === 'ar' ? 'إلغاء' : 'Cancel'}
                              </button>
                              <button
                                onClick={() => saveCorrection(msg.id, msg.content)}
                                disabled={!correctionText.trim() || savingCorrection}
                                className="text-[10px] px-3 py-1 rounded-full bg-red-500 text-white font-medium disabled:opacity-40 hover:bg-red-600 transition-colors flex items-center gap-1">
                                {savingCorrection
                                  ? (language === 'ar' ? 'جاري الحفظ...' : 'Saving...')
                                  : (language === 'ar' ? 'حفظ ملاحظة التدريب' : 'Save Training Note')}
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {loading && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-end gap-2">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs"
                  style={{ background: platform === 'instagram' ? igGradient : fbBlue }}>🏪</div>
                <div className="bg-white rounded-t-2xl rounded-e-2xl rounded-s-sm px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-1">
                    {[0, 1, 2].map(i => (
                      <motion.div key={i} className="w-2 h-2 rounded-full bg-gray-400"
                        animate={{ y: [0, -4, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }} />
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Facebook Quick Actions */}
          {platform === 'facebook' && (
            <div className="flex items-center overflow-x-auto border-t scrollbar-hide"
              style={{ background: isLight ? '#fff' : '#242424', borderColor: isLight ? '#e5e7eb' : '#333' }}>
              {[
                { icon: ShoppingCart, label: 'Create order', msg: 'ابي اطلب منتج' },
                { icon: MessageSquare, label: 'Saved replies', msg: 'اريد ترى الردود المحفوظة' },
                { icon: UserPlus, label: 'Update', msg: 'ابي اعدل طلبي' },
              ].map(({ icon: Icon, label, msg }) => (
                <button key={label} onClick={() => sendMessage(msg)}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap hover:bg-black/5 text-[#1877F2] shrink-0">
                  <Icon className="w-3.5 h-3.5" />{label}
                </button>
              ))}
            </div>
          )}

          {/* Emoji Panel */}
          <AnimatePresence>
            {showEmoji && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                onClick={e => e.stopPropagation()}
                className="absolute bottom-16 start-2 z-50 rounded-2xl border border-border shadow-2xl overflow-hidden w-64 sm:w-72"
                style={{ background: isLight ? '#fff' : '#1e1e2e' }}>
                <div className="flex border-b" style={{ borderColor: isLight ? '#e5e7eb' : '#333' }}>
                  {EMOJI_GROUPS.map((g, i) => (
                    <button key={i} onClick={() => setEmojiGroup(i)}
                      className={cn('flex-1 py-2 text-base transition-colors', emojiGroup === i ? 'bg-primary/10' : 'hover:bg-accent')}>
                      {g.label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-10 p-2">
                  {EMOJI_GROUPS[emojiGroup].emojis.map(e => (
                    <button key={e} onClick={() => { setInput(p => p + e); inputRef.current?.focus(); }}
                      className="text-xl p-1 rounded-lg hover:bg-accent">{e}</button>
                  ))}
                </div>
              </motion.div>
            )}
            {showSticker && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                onClick={e => e.stopPropagation()}
                className="absolute bottom-16 start-2 z-50 rounded-2xl border border-border shadow-2xl overflow-hidden w-56"
                style={{ background: isLight ? '#fff' : '#1e1e2e' }}>
                <p className="text-center text-xs text-muted-foreground py-1.5 border-b" style={{ borderColor: isLight ? '#e5e7eb' : '#333' }}>
                  {language === 'ar' ? 'ستيكرات' : 'Stickers'}
                </p>
                <div className="grid grid-cols-9 p-2">
                  {STICKERS.map(s => (
                    <button key={s} onClick={() => { sendMessage(s); setShowSticker(false); }}
                      className="text-xl p-1 rounded-lg hover:bg-accent">{s}</button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Recording Bar */}
          {isRecording && (
            <div className="px-3 py-2 flex items-center gap-2 border-t text-xs text-red-400 font-medium"
              style={{ background: isLight ? '#fff' : '#1e1e1e', borderColor: isLight ? '#e5e7eb' : '#2d2d2d' }}>
              <motion.div className="w-2 h-2 rounded-full bg-red-500"
                animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1, repeat: Infinity }} />
              {language === 'ar' ? `تسجيل... ${recordingSeconds}s` : `Recording... ${recordingSeconds}s`}
              <button onClick={stopRecording} className="ms-auto flex items-center gap-1 text-red-400">
                <StopCircle className="w-4 h-4" />
                {language === 'ar' ? 'إيقاف' : 'Stop'}
              </button>
            </div>
          )}

          {/* Toolbar */}
          <div className="flex items-center gap-1 px-2 sm:px-3 py-2 border-t"
            style={{ background: isLight ? '#fff' : '#1e1e1e', borderColor: isLight ? '#e5e7eb' : '#2d2d2d' }}>
            {/* Left icons */}
            {platform === 'instagram' ? (
              <div className="flex items-center gap-0.5 shrink-0">
                <TBtn label="Camera" onClick={() => cameraRef.current?.click()}>
                  <Camera className="w-[18px] h-[18px] sm:w-5 sm:h-5 text-[#a855f7]" />
                </TBtn>
                <TBtn label="Gallery" onClick={() => galleryRef.current?.click()}>
                  <ImageIcon className="w-[18px] h-[18px] sm:w-5 sm:h-5 text-[#ec4899]" />
                </TBtn>
                <TBtn label="Attach" onClick={() => attachRef.current?.click()}>
                  <Paperclip className="w-[18px] h-[18px] sm:w-5 sm:h-5 text-[#f97316]" />
                </TBtn>
                <TBtn label="Sticker" onClick={e => { e.stopPropagation(); setShowSticker(s => !s); setShowEmoji(false); }}>
                  <Sticker className="w-[18px] h-[18px] sm:w-5 sm:h-5 text-[#ec4899]" />
                </TBtn>
                <TBtn label="Mic" onClick={isRecording ? stopRecording : startRecording}>
                  {isRecording
                    ? <MicOff className="w-[18px] h-[18px] sm:w-5 sm:h-5 text-red-400" />
                    : <Mic className="w-[18px] h-[18px] sm:w-5 sm:h-5 text-[#a855f7]" />}
                </TBtn>
              </div>
            ) : (
              <div className="flex items-center gap-0.5 shrink-0">
                <TBtn label="Plus" onClick={() => {}}>
                  <Plus className="w-[18px] h-[18px] sm:w-5 sm:h-5 text-[#1877F2]" />
                </TBtn>
                <TBtn label="Camera" onClick={() => cameraRef.current?.click()}>
                  <Camera className="w-[18px] h-[18px] sm:w-5 sm:h-5 text-[#1877F2]" />
                </TBtn>
                <TBtn label="Gallery" onClick={() => galleryRef.current?.click()}>
                  <ImageIcon className="w-[18px] h-[18px] sm:w-5 sm:h-5 text-[#1877F2]" />
                </TBtn>
                <TBtn label="Attach" onClick={() => attachRef.current?.click()}>
                  <Paperclip className="w-[18px] h-[18px] sm:w-5 sm:h-5 text-[#1877F2]" />
                </TBtn>
                <TBtn label="Mic" onClick={isRecording ? stopRecording : startRecording}>
                  {isRecording
                    ? <MicOff className="w-[18px] h-[18px] sm:w-5 sm:h-5 text-red-400" />
                    : <Mic className="w-[18px] h-[18px] sm:w-5 sm:h-5 text-[#1877F2]" />}
                </TBtn>
              </div>
            )}

            {/* Input */}
            <div className="flex-1 flex items-center px-3 py-1.5 rounded-full mx-1"
              style={{ background: isLight ? '#f0f2f5' : '#2d2d2d' }}>
              <input ref={inputRef}
                className="flex-1 bg-transparent outline-none text-foreground placeholder:text-muted-foreground text-sm min-w-0"
                placeholder="Aa" value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                dir="auto" autoComplete="off" />
            </div>

            {/* Right icons */}
            <div className="flex items-center gap-0.5 shrink-0">
              <TBtn label="Emoji" onClick={e => { e.stopPropagation(); setShowEmoji(s => !s); setShowSticker(false); }}>
                <Smile className="w-[18px] h-[18px] sm:w-5 sm:h-5" style={{ color: platform === 'instagram' ? '#a855f7' : '#1877F2' }} />
              </TBtn>
              {input.trim() ? (
                <motion.button whileTap={{ scale: 0.9 }} onClick={() => sendMessage(input)}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: sendColor }}>
                  <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                </motion.button>
              ) : platform === 'instagram' ? (
                <TBtn label="Like" onClick={() => sendMessage('❤️')}>
                  <Heart className="w-[18px] h-[18px] sm:w-5 sm:h-5 text-red-400" fill="currentColor" />
                </TBtn>
              ) : (
                <TBtn label="Like" onClick={() => sendMessage('👍')}>
                  <ThumbsUp className="w-[18px] h-[18px] sm:w-5 sm:h-5 text-[#1877F2]" fill="currentColor" />
                </TBtn>
              )}
            </div>
          </div>

          {/* Hidden Inputs */}
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleImageFile(f); e.target.value = ''; }} />
          <input ref={galleryRef} type="file" accept="image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleImageFile(f); e.target.value = ''; }} />
          <input ref={attachRef} type="file" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleAttachment(f); e.target.value = ''; }} />
        </div>

        {/* ─── Desktop Side Panel ─── */}
        <div className="hidden md:flex flex-col gap-3 w-52 lg:w-60 shrink-0">
          <div className="glass-panel rounded-2xl p-4 flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-foreground">
              {language === 'ar' ? 'ردود سريعة' : 'Quick Replies'}
            </h3>
            <div className="flex flex-col gap-2">
              {quickReplies.map(r => (
                <button key={r} onClick={() => sendMessage(r)} disabled={loading}
                  className="text-right px-3 py-2 rounded-xl border border-border text-xs text-foreground hover:bg-accent hover:border-primary/50 transition-colors disabled:opacity-50"
                  dir="auto">{r}</button>
              ))}
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-4 flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-foreground mb-1">
              {language === 'ar' ? 'مؤشرات' : 'Indicators'}
            </h3>
            {[
              { color: 'bg-blue-400', label: language === 'ar' ? 'رد AI' : 'AI Reply' },
              { color: 'bg-emerald-400', label: language === 'ar' ? 'رد محفوظ' : 'Saved Reply' },
              { color: 'bg-orange-400', label: language === 'ar' ? 'تصعيد' : 'Escalation' },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${color}`} />{label}
              </div>
            ))}
          </div>

          <div className="glass-panel rounded-2xl p-4 flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-foreground mb-1">
              {language === 'ar' ? 'إحصائيات' : 'Stats'}
            </h3>
            {[
              { label: language === 'ar' ? 'الرسائل' : 'Messages', value: messages.length },
              { label: 'AI', value: messages.filter(m => m.type === 'ai').length },
              { label: language === 'ar' ? 'محفوظة' : 'Saved', value: messages.filter(m => m.type === 'saved_reply').length },
              { label: language === 'ar' ? 'تصعيد' : 'Escalated', value: messages.filter(m => m.type === 'escalation').length },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-bold text-foreground">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Helpers ──────────────────────────────────────────────────────────── */

function TBtn({ label, onClick, children }: {
  label: string; onClick?: (e: React.MouseEvent) => void; children: React.ReactNode;
}) {
  return (
    <button aria-label={label} onClick={onClick}
      className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center hover:bg-black/10 transition-colors shrink-0">
      {children}
    </button>
  );
}

function IGHeader({ isLight }: { isLight: boolean }) {
  return (
    <div className="shrink-0" style={{ background: isLight ? '#fff' : '#121212' }}>
      <div className="px-3 py-1.5 border-b text-xs font-medium flex items-center gap-2"
        style={{ background: isLight ? '#fafafa' : '#1a1a1a', borderColor: isLight ? '#e5e7eb' : '#2d2d2d', color: '#a855f7' }}>
        <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
        <span className="truncate">تعليق على فيديو</span>
      </div>
      <div className="flex items-center gap-2 px-3 py-2.5 border-b" style={{ borderColor: isLight ? '#e5e7eb' : '#2d2d2d' }}>
        <ChevronRight className="w-4 h-4 shrink-0" style={{ color: isLight ? '#000' : '#fff' }} />
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-base shrink-0"
          style={{ background: 'linear-gradient(135deg,#a855f7,#ec4899,#f97316)' }}>🛍️</div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-xs truncate" style={{ color: isLight ? '#000' : '#fff' }}>العميل</p>
          <p className="text-[10px]" style={{ color: isLight ? '#6b7280' : '#888' }}>+ Add details and labels</p>
        </div>
        <MoreHorizontal className="w-4 h-4 shrink-0" style={{ color: isLight ? '#6b7280' : '#888' }} />
      </div>
    </div>
  );
}

function FBHeader({ isLight }: { isLight: boolean }) {
  return (
    <div className="shrink-0" style={{ background: isLight ? '#fff' : '#242424' }}>
      <div className="flex items-center gap-2 px-3 py-2.5 border-b" style={{ borderColor: isLight ? '#e5e7eb' : '#333' }}>
        <ChevronRight className="w-4 h-4 shrink-0" style={{ color: isLight ? '#000' : '#fff' }} />
        <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-base shrink-0">👤</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="font-semibold text-xs truncate" style={{ color: isLight ? '#000' : '#fff' }}>العميل</p>
            <span className="text-[10px] px-1.5 py-0.5 rounded text-white shrink-0" style={{ background: '#1877F2' }}>Intake</span>
          </div>
          <p className="text-[10px]" style={{ color: isLight ? '#6b7280' : '#888' }}>• Active now</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Phone className="w-4 h-4" style={{ color: '#1877F2' }} />
          <Video className="w-4 h-4 hidden sm:block" style={{ color: '#1877F2' }} />
          <Info className="w-4 h-4" style={{ color: '#1877F2' }} />
        </div>
      </div>
      <div className="mx-2 my-1.5 px-2 py-1.5 rounded-lg border flex items-center gap-2"
        style={{ background: isLight ? '#f0f2f5' : '#2d2d2d', borderColor: isLight ? '#ddd' : '#444' }}>
        <div className="w-6 h-6 rounded bg-gray-300 flex items-center justify-center text-xs shrink-0">📢</div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-medium truncate" style={{ color: isLight ? '#333' : '#ccc' }}>This is a reply to an ad</p>
          <p className="text-[10px]" style={{ color: '#1877F2' }}>View details</p>
        </div>
        <X className="w-3.5 h-3.5 shrink-0" style={{ color: isLight ? '#6b7280' : '#888' }} />
      </div>
    </div>
  );
}
