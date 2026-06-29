import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "@/lib/i18n";
import {
  DollarSign, Zap, MessageSquare, ImageIcon, TrendingUp,
  Bot, ExternalLink, BarChart3, ArrowUpRight, RefreshCw,
  Calendar, Info, Sparkles, Server, Cpu, HardDrive, Clock,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface UsageData {
  allTime:   { botReplies: number; textCalls: number; imageCalls: number; conversations: number; tokens: number; costUsd: number };
  thisMonth: { botReplies: number; textCalls: number; imageCalls: number; conversations: number; tokens: number; costUsd: number };
  perCall:   { textCallUsd: number; imageCallUsd: number; textModel: string; imageModel: string };
}
interface DailyRow { day: string; botReplies: number; imageCalls: number }
interface SystemStats {
  node: { version: string; uptimeSeconds: number; heapUsedMb: number; heapTotalMb: number; rssMb: number };
  system: { totalMemMb: number; usedMemMb: number; freeMemMb: number; usedPct: number; cpuCores: number; cpuModel: string; platform: string };
}

function fmt$(n: number, dec = 4) {
  if (n === 0) return "$0.00";
  if (n < 0.0001) return "<$0.0001";
  return "$" + n.toFixed(dec);
}
function fmtNum(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + "K";
  return String(n);
}
function fmtDay(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("ar-IQ", { month: "short", day: "numeric" });
}

/* ── Stat card ──────────────────────────────────────────────────────────────── */
function StatCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>{icon}</div>
      <div>
        <p className="text-2xl font-bold text-white">{typeof value === "number" ? fmtNum(value) : value}</p>
        <p className="text-xs text-white/50 mt-0.5">{label}</p>
      </div>
      {sub && <span className="text-[10px] text-white/30 bg-white/5 px-2 py-0.5 rounded-full">{sub}</span>}
    </div>
  );
}

/* ── Bar chart ──────────────────────────────────────────────────────────────── */
function DailyChart({ data }: { data: DailyRow[] }) {
  const max = Math.max(1, ...data.map(d => d.botReplies));
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-1 h-28 px-1">
        {data.map((d, i) => {
          const pct = (d.botReplies / max) * 100;
          const isToday = d.day === new Date().toISOString().slice(0, 10);
          return (
            <div
              key={d.day}
              className="flex-1 flex flex-col items-center gap-1 cursor-pointer group"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              {hovered === i && (
                <div className="absolute -translate-y-8 bg-black/80 text-white text-[10px] px-2 py-1 rounded-lg whitespace-nowrap z-10 border border-white/10">
                  {fmtDay(d.day)}: {d.botReplies} رد
                </div>
              )}
              <div className="w-full relative flex items-end" style={{ height: '100px' }}>
                <div
                  className={`w-full rounded-t-sm transition-all duration-300 ${
                    isToday ? 'bg-violet-500' : hovered === i ? 'bg-violet-400/80' : 'bg-violet-500/40'
                  }`}
                  style={{ height: `${Math.max(4, pct)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      {/* X-axis labels — show every 2nd day */}
      <div className="flex gap-1 px-1">
        {data.map((d, i) => (
          <div key={d.day} className="flex-1 text-center">
            {i % 2 === 0 && (
              <span className="text-[9px] text-white/30">{fmtDay(d.day).split(' ')[0]}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Main page ──────────────────────────────────────────────────────────────── */
export default function UsagePage() {
  const { language, isRtl } = useTranslation();
  const ar = language === 'ar';
  const [tab, setTab] = useState<"month" | "all">("month");
  const monthName = new Date().toLocaleString(ar ? "ar-IQ" : "en-US", { month: "long", year: "numeric" });

  const { data, isLoading, refetch, dataUpdatedAt } = useQuery<UsageData>({
    queryKey: ["usage"],
    queryFn: () => fetch(`${BASE}/api/usage`).then(r => r.json()),
    refetchInterval: 60_000,
  });

  const { data: daily, isLoading: dailyLoading } = useQuery<DailyRow[]>({
    queryKey: ["usage-daily"],
    queryFn: () => fetch(`${BASE}/api/usage/daily?days=14`).then(r => r.json()),
    refetchInterval: 60_000,
  });

  const { data: sys, isLoading: sysLoading } = useQuery<SystemStats>({
    queryKey: ["usage-system"],
    queryFn: () => fetch(`${BASE}/api/usage/system`).then(r => r.json()),
    refetchInterval: 30_000,
  });

  const d = tab === "month" ? data?.thisMonth : data?.allTime;
  const cost = d?.costUsd ?? 0;
  const textCost = data?.perCall.textCallUsd ?? 0.000289;
  const imgCost  = data?.perCall.imageCallUsd ?? 0.011075;

  const today = new Date().getDate();
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const projected = tab === "month" && today > 0 && data?.thisMonth.costUsd
    ? (data.thisMonth.costUsd / today) * daysInMonth
    : null;

  const updatedTime = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <div className="space-y-6 pb-12 max-w-3xl mx-auto" dir={isRtl ? 'rtl' : 'ltr'}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">{ar ? 'استهلاك البوت' : 'Bot Usage'}</h1>
            <p className="text-white/40 text-xs">{ar ? 'مراقبة التكاليف والنشاط اليومي' : 'Monitor costs and daily activity'}</p>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isLoading}
          className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors bg-white/5 hover:bg-white/10 px-3 py-2 rounded-xl"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          {updatedTime ? (ar ? `آخر تحديث ${updatedTime}` : `Updated ${updatedTime}`) : (ar ? "تحديث" : "Refresh")}
        </button>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 p-1 bg-white/5 rounded-2xl w-fit">
        {[
          { id: "month" as const, label: monthName },
          { id: "all"   as const, label: ar ? "كل الوقت" : "All Time" },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              tab === t.id ? "bg-violet-600 text-white shadow" : "text-white/50 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Cost hero ── */}
      <div className="rounded-2xl border border-violet-500/25 bg-gradient-to-br from-violet-500/10 to-transparent p-6">
        <p className="text-sm text-white/50 mb-1">
          {tab === "month" ? `التكلفة المقدّرة — ${monthName}` : "التكلفة الكلية"}
        </p>
        <p className="text-5xl font-bold text-violet-300">
          {isLoading ? "—" : fmt$(cost, 4)}
        </p>
        {projected !== null && (
          <p className="text-xs text-white/40 mt-2 flex items-center gap-1">
            <ArrowUpRight className="w-3 h-3 text-yellow-400" />
            توقع نهاية الشهر: <span className="text-yellow-400 font-mono">{fmt$(projected, 3)}</span>
          </p>
        )}
        <div className="flex flex-wrap gap-3 mt-4">
          <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2">
            <Zap className="w-3.5 h-3.5 text-yellow-400" />
            <span className="text-white/40 text-xs">Tokens:</span>
            <span className="font-mono text-white text-xs font-bold">{isLoading ? "—" : fmtNum(d?.tokens ?? 0)}</span>
          </div>
          <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2">
            <MessageSquare className="w-3.5 h-3.5 text-green-400" />
            <span className="text-white/40 text-xs">رسالة نصية:</span>
            <span className="font-mono text-white text-xs font-bold">{fmt$(textCost, 6)}</span>
          </div>
          <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2">
            <ImageIcon className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-white/40 text-xs">تحليل صورة:</span>
            <span className="font-mono text-white text-xs font-bold">{fmt$(imgCost, 6)}</span>
          </div>
        </div>
      </div>

      {/* ── 4 Stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {isLoading ? [...Array(4)].map((_, i) => (
          <div key={i} className="h-32 rounded-2xl bg-white/5 animate-pulse" />
        )) : (<>
          <StatCard
            icon={<Bot className="w-5 h-5 text-violet-400" />}
            label="ردود البوت" value={d?.botReplies ?? 0}
            sub="إجمالي" color="bg-violet-500/20"
          />
          <StatCard
            icon={<MessageSquare className="w-5 h-5 text-green-400" />}
            label="رسائل نصية" value={d?.textCalls ?? 0}
            sub="gpt-4o-mini" color="bg-green-500/20"
          />
          <StatCard
            icon={<ImageIcon className="w-5 h-5 text-purple-400" />}
            label="تحليل صور" value={d?.imageCalls ?? 0}
            sub="gpt-4o" color="bg-purple-500/20"
          />
          <StatCard
            icon={<TrendingUp className="w-5 h-5 text-blue-400" />}
            label="محادثات" value={d?.conversations ?? 0}
            sub="مختلفة" color="bg-blue-500/20"
          />
        </>)}
      </div>

      {/* ── Daily activity chart ── */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-violet-400" />
            <h2 className="font-semibold text-white text-sm">النشاط اليومي — آخر 14 يوم</h2>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-white/40">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-violet-500 inline-block" /> ردود البوت</span>
          </div>
        </div>
        {dailyLoading ? (
          <div className="h-28 rounded-xl bg-white/5 animate-pulse" />
        ) : (
          <DailyChart data={daily ?? []} />
        )}
      </div>

      {/* ── Cost breakdown ── */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-violet-400" />
          <h2 className="font-semibold text-white text-sm">تفصيل التكلفة</h2>
        </div>

        {[
          {
            icon: <MessageSquare className="w-4 h-4 text-green-400" />,
            label: "رسائل نصية — gpt-4o-mini",
            count: d?.textCalls ?? 0,
            perCall: textCost,
            pctColor: "bg-green-500",
          },
          {
            icon: <ImageIcon className="w-4 h-4 text-purple-400" />,
            label: "تحليل صور — gpt-4o",
            count: d?.imageCalls ?? 0,
            perCall: imgCost,
            pctColor: "bg-purple-500",
          },
        ].map(row => {
          const rowCost = row.count * row.perCall;
          const pct = cost > 0 ? (rowCost / cost) * 100 : 0;
          return (
            <div key={row.label} className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors">
              <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">{row.icon}</div>
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white/70 text-xs">{row.label}</span>
                  <span className="font-mono text-white text-xs font-bold">{fmt$(rowCost, 4)}</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-white/10">
                  <div className={`h-full rounded-full ${row.pctColor}`} style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
                <p className="text-[10px] text-white/30">{row.count} رسالة × {fmt$(row.perCall, 6)}</p>
              </div>
            </div>
          );
        })}

        <div className="border-t border-white/10 pt-3 flex justify-between text-sm font-bold px-3">
          <span className="text-white/60">المجموع</span>
          <span className="text-violet-300 font-mono">{fmt$(cost, 4)}</span>
        </div>
      </div>

      {/* ── Projection table ── */}
      <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
        <div className="px-5 py-3 border-b border-white/10 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-yellow-400" />
          <h2 className="font-semibold text-white text-sm">توقعات التكلفة الشهرية</h2>
        </div>
        <div className="grid grid-cols-3 gap-0 text-[11px] font-semibold text-white/30 bg-white/5 px-5 py-2.5">
          <span>السيناريو</span>
          <span className="text-center">رسائل/يوم</span>
          <span className="text-end">تكلفة/شهر</span>
        </div>
        <div className="divide-y divide-white/5">
          {[
            { label: "بوت خفيف",   msgs: 50,   imgs: 5   },
            { label: "نشاط متوسط", msgs: 200,  imgs: 20  },
            { label: "نشاط عالٍ",  msgs: 500,  imgs: 50  },
            { label: "نشاط مكثف",  msgs: 1000, imgs: 100 },
          ].map(row => {
            const monthly = (row.msgs * 30 * textCost) + (row.imgs * 30 * imgCost);
            return (
              <div key={row.label} className="grid grid-cols-3 gap-0 px-5 py-3 text-sm hover:bg-white/4 transition-colors">
                <span className="text-white/70 text-xs">{row.label}</span>
                <span className="text-center text-white/40 text-xs">
                  {row.msgs} <MessageSquare className="w-3 h-3 inline text-green-400 mx-0.5" />
                  {row.imgs} <ImageIcon className="w-3 h-3 inline text-purple-400 mx-0.5" />
                </span>
                <span className="text-end font-mono font-bold text-violet-300 text-xs">{fmt$(monthly, 2)}</span>
              </div>
            );
          })}
        </div>
        <div className="px-5 py-3 border-t border-white/10">
          <p className="text-[11px] text-white/30 flex items-center gap-1">
            <Info className="w-3 h-3 shrink-0" />
            التكاليف تقديرية. للفاتورة الفعلية تحقق من لوحة OpenAI.
          </p>
        </div>
      </div>

      {/* ── Replit Hosting Section ── */}
      <div className="rounded-2xl border border-orange-500/25 bg-gradient-to-br from-orange-500/8 to-transparent overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-orange-500/20 flex items-center justify-center">
              <Server className="w-4 h-4 text-orange-400" />
            </div>
            <div>
              <h2 className="font-bold text-white text-sm">Replit Hosting</h2>
              <p className="text-white/40 text-[11px]">موارد السيرفر الحالية</p>
            </div>
          </div>
          {sysLoading && <RefreshCw className="w-3.5 h-3.5 text-white/30 animate-spin" />}
        </div>

        <div className="p-5 space-y-4">
          {sysLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => <div key={i} className="h-12 rounded-xl bg-white/5 animate-pulse" />)}
            </div>
          ) : sys ? (
            <>
              {/* Memory gauges */}
              <div className="space-y-3">
                {/* System RAM */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-white/60"><HardDrive className="w-3.5 h-3.5 text-orange-400" /> ذاكرة النظام (RAM)</span>
                    <span className="font-mono text-white">{sys.system.usedMemMb} <span className="text-white/30">/ {sys.system.totalMemMb} MB</span></span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-white/10">
                    <div
                      className={`h-full rounded-full transition-all ${sys.system.usedPct > 85 ? 'bg-red-500' : sys.system.usedPct > 65 ? 'bg-yellow-500' : 'bg-orange-500'}`}
                      style={{ width: `${Math.min(100, sys.system.usedPct)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-white/30">{sys.system.usedPct}% مستخدم — {sys.system.freeMemMb} MB متاح</p>
                </div>

                {/* Node.js Heap */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-white/60"><Cpu className="w-3.5 h-3.5 text-blue-400" /> Node.js Heap</span>
                    <span className="font-mono text-white">{sys.node.heapUsedMb} <span className="text-white/30">/ {sys.node.heapTotalMb} MB</span></span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-blue-500 transition-all"
                      style={{ width: `${Math.min(100, (sys.node.heapUsedMb / sys.node.heapTotalMb) * 100)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-white/30">RSS: {sys.node.rssMb} MB — {sys.node.version}</p>
                </div>
              </div>

              {/* Info chips */}
              <div className="flex flex-wrap gap-2 pt-1">
                <div className="flex items-center gap-1.5 bg-white/5 rounded-xl px-3 py-2 text-xs">
                  <Clock className="w-3.5 h-3.5 text-purple-400" />
                  <span className="text-white/40">وقت التشغيل:</span>
                  <span className="text-white font-mono">
                    {(() => {
                      const s = sys.node.uptimeSeconds;
                      const h = Math.floor(s / 3600);
                      const m = Math.floor((s % 3600) / 60);
                      return h > 0 ? `${h}س ${m}د` : `${m} دقيقة`;
                    })()}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 bg-white/5 rounded-xl px-3 py-2 text-xs">
                  <Cpu className="w-3.5 h-3.5 text-green-400" />
                  <span className="text-white/40">CPU Cores:</span>
                  <span className="text-white font-mono">{sys.system.cpuCores}</span>
                </div>
                <div className="flex items-center gap-1.5 bg-white/5 rounded-xl px-3 py-2 text-xs">
                  <Server className="w-3.5 h-3.5 text-orange-400" />
                  <span className="text-white/40">Platform:</span>
                  <span className="text-white font-mono">{sys.system.platform}</span>
                </div>
              </div>

              {/* Billing link */}
              <a
                href="https://portal.withorb.com/view?token=ImpOdWlaamJmUlFKUkxoWkQi.q3JS0vmwAMfhZwrN8l4uc1GaJ3s&redirect_invoice_id=2BCpSx2FKKuXkRtK&payment_intent=pi_3TJ6oLJAmnYVOvfn0O6wkXAM&payment_intent_client_secret=pi_3TJ6oLJAmnYVOvfn0O6wkXAM_secret_d59yrjMk2P9qYPGEfW3PZzXWj&redirect_status=succeeded"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-3 rounded-xl border border-orange-500/20 bg-orange-500/5 hover:bg-orange-500/10 transition-colors group"
              >
                <span className="text-xs text-white/70 font-medium">فاتورة Replit</span>
                <ExternalLink className="w-3.5 h-3.5 text-white/30 group-hover:text-orange-400 transition-colors" />
              </a>
            </>
          ) : (
            <p className="text-white/30 text-sm text-center py-4">تعذّر تحميل بيانات السيرفر</p>
          )}
        </div>
      </div>

      {/* ── OpenAI link ── */}
      <a
        href="https://platform.openai.com/usage"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-between p-4 rounded-2xl border border-green-500/20 bg-green-500/5 hover:bg-green-500/10 transition-colors group"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-green-500/20 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-green-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">OpenAI Usage Dashboard</p>
            <p className="text-xs text-white/40">الفاتورة الفعلية والاستهلاك الحقيقي</p>
          </div>
        </div>
        <ExternalLink className="w-4 h-4 text-white/30 group-hover:text-green-400 transition-colors" />
      </a>

    </div>
  );
}
