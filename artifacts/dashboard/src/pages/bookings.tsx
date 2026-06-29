import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '@/lib/i18n';
import { useUpdateBooking, type UpdateBookingBodyStatus } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle, Badge } from '@/components/ui-custom';
import { Star, Loader2, MapPin, Phone, Package, ExternalLink, Trash2, CheckCircle2, Clock, XCircle, CircleCheck, Printer, X, ImageOff, RefreshCw, MessageCircle, ImagePlus, Facebook, Globe } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

function escHtml(str: unknown): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function fmtPrice(n: number): string {
  if (n >= 1000) return `${(n / 1000).toLocaleString('ar-IQ', { maximumFractionDigits: 0 })} ألف`;
  return n.toLocaleString('ar-IQ');
}

const STATUS_OPTIONS = [
  { value: 'pending',   label: 'قيد الانتظار', icon: Clock,         color: 'text-amber-400',  bg: 'bg-amber-500/10 border-amber-500/40' },
  { value: 'confirmed', label: 'مؤكد',          icon: CircleCheck,   color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/40' },
  { value: 'completed', label: 'مكتمل',          icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/40' },
  { value: 'cancelled', label: 'ملغي',           icon: XCircle,      color: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/40' },
] as const;

type PaperSize = '58mm' | '80mm' | 'A4';

const PAPER_SIZES: { value: PaperSize; label: string; width: string; desc: string }[] = [
  { value: '58mm', label: '58mm',  width: '58mm',  desc: 'طابعة حرارية صغيرة' },
  { value: '80mm', label: '80mm',  width: '80mm',  desc: 'طابعة حرارية كبيرة' },
  { value: 'A4',   label: 'A4',    width: '210mm', desc: 'طابعة عادية' },
];

function doPrint(booking: any, paperSize: PaperSize) {
  const items: any[] = Array.isArray(booking.items) ? booking.items : [];
  const subtotal = items.reduce((s: number, i: any) => s + (i.unitPrice ?? i.price ?? 0) * (i.qty ?? i.quantity ?? 1), 0);
  const grandTotal = Number(booking.totalAmount ?? 0);
  const deliveryFee = booking.deliveryCost != null ? Number(booking.deliveryCost) : (grandTotal > 0 ? Math.max(0, grandTotal - subtotal) : 0);
  const ps = PAPER_SIZES.find(p => p.value === paperSize)!;
  const isSmall = paperSize === '58mm' || paperSize === '80mm';
  const dateStr = format(new Date(booking.createdAt), 'yyyy/MM/dd – HH:mm');

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8"/>
<title>فاتورة #${booking.id + 873} – sonbola.baby</title>
<style>
  @page { margin: 0; size: ${ps.width} auto; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
    font-size: ${isSmall ? '11px' : '13px'};
    color: #111;
    width: ${ps.width};
    padding: ${isSmall ? '6px 8px' : '20px 24px'};
    background: #fff;
  }
  .brand {
    text-align: center;
    margin-bottom: ${isSmall ? '6px' : '12px'};
    border-bottom: ${isSmall ? '1px' : '2px'} solid #111;
    padding-bottom: ${isSmall ? '6px' : '12px'};
  }
  .brand h1 {
    font-size: ${isSmall ? '16px' : '24px'};
    font-weight: 900;
    letter-spacing: 1px;
  }
  .brand p { font-size: ${isSmall ? '9px' : '11px'}; color: #555; margin-top: 2px; }
  .invoice-no {
    text-align: center;
    font-size: ${isSmall ? '12px' : '15px'};
    font-weight: 700;
    margin: ${isSmall ? '4px 0' : '8px 0'};
    border-bottom: 1px dashed #aaa;
    padding-bottom: ${isSmall ? '4px' : '8px'};
  }
  .meta {
    margin: ${isSmall ? '4px 0' : '10px 0'};
    font-size: ${isSmall ? '10px' : '12px'};
    line-height: 1.8;
  }
  .meta .label { color: #666; font-size: ${isSmall ? '9px' : '11px'}; }
  .meta .val { font-weight: 600; }
  .phone-brand { font-size: ${isSmall ? '9px' : '10px'}; color: #888; }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: ${isSmall ? '6px 0' : '12px 0'};
    font-size: ${isSmall ? '10px' : '12px'};
  }
  thead th {
    background: #111;
    color: #fff;
    padding: ${isSmall ? '3px 4px' : '5px 8px'};
    text-align: center;
    font-size: ${isSmall ? '9px' : '11px'};
  }
  thead th:first-child { text-align: right; }
  tbody td {
    padding: ${isSmall ? '3px 4px' : '5px 8px'};
    border-bottom: 1px dotted #ddd;
    text-align: center;
    vertical-align: middle;
  }
  tbody td:first-child { text-align: right; }
  .delivery-row td { color: #555; font-size: ${isSmall ? '9px' : '11px'}; }
  tfoot td {
    padding: ${isSmall ? '4px' : '8px'};
    font-weight: 900;
    font-size: ${isSmall ? '12px' : '15px'};
    text-align: center;
    border-top: ${isSmall ? '1px' : '2px'} solid #111;
  }
  .total-label { text-align: right; }
  .footer {
    margin-top: ${isSmall ? '8px' : '16px'};
    border-top: 1px dashed #aaa;
    padding-top: ${isSmall ? '6px' : '12px'};
    text-align: center;
    font-size: ${isSmall ? '9px' : '11px'};
    color: #666;
    line-height: 1.8;
  }
  .footer strong { color: #111; font-size: ${isSmall ? '10px' : '12px'}; }
</style>
</head>
<body>
<div class="brand">
  <h1>sonbola.baby</h1>
  <p>ملابس أطفال عراقية ● متجر سنبلة</p>
</div>

<div class="invoice-no">فاتورة رقم #${booking.id + 873}</div>

<div class="meta">
  <div><span class="label">التاريخ: </span><span class="val">${dateStr}</span></div>
  <div><span class="label">الزبون: </span><span class="val">${escHtml(booking.senderName || 'زبون')}</span></div>
  <div>
    <span class="label">العنوان: </span>
    <span class="val">${
      (booking.governorate && booking.governorate !== 'null' && booking.governorate !== 'غير محدد' ? escHtml(booking.governorate) + ' — ' : '') +
      (booking.fullAddress && booking.fullAddress !== 'null' ? escHtml(booking.fullAddress) : 'غير محدد')
    }</span>
  </div>
  <div>
    <div class="phone-brand">sonbola.baby</div>
    <span class="label">الهاتف: </span>
    <span class="val" dir="ltr">${escHtml(booking.phoneNumber)}</span>
    <span class="label" style="margin-right:6px">| 20947</span>
  </div>
</div>

<table>
  <thead>
    <tr>
      <th>المنتج</th>
      <th>العدد</th>
      <th>السعر</th>
      <th>المبلغ</th>
    </tr>
  </thead>
  <tbody>
    ${items.map((item: any) => {
      const qty = item.qty ?? item.quantity ?? 1;
      const unitP = item.unitPrice ?? item.price ?? 0;
      const lineTotal = unitP * qty;
      return `<tr>
        <td>${escHtml(item.nameAr || item.name || item.nameEn || item.productId)} <small style="color:#888">${escHtml(item.productId)}</small></td>
        <td>${escHtml(qty)}</td>
        <td>${fmtPrice(unitP)}</td>
        <td>${fmtPrice(lineTotal)}</td>
      </tr>`;
    }).join('')}
    ${deliveryFee > 0 ? `<tr class="delivery-row">
      <td colspan="2">🚚 توصيل — ${escHtml(booking.governorate)}</td>
      <td>—</td>
      <td>${fmtPrice(deliveryFee)}</td>
    </tr>` : ''}
  </tbody>
  <tfoot>
    <tr>
      <td colspan="3" class="total-label">المجموع الكلي</td>
      <td>${fmtPrice(grandTotal)} د.ع</td>
    </tr>
  </tfoot>
</table>

<div class="footer">
  <strong>sonbola.baby</strong><br/>
  شكراً لتسوقكم معنا 🌸<br/>
  <strong>20947</strong>
</div>
</body>
</html>`;

  const existing = document.getElementById('_print_frame');
  if (existing) existing.remove();

  const blob = new Blob([html], { type: 'text/html; charset=utf-8' });
  const blobUrl = URL.createObjectURL(blob);

  const iframe = document.createElement('iframe');
  iframe.id = '_print_frame';
  iframe.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none;';
  iframe.src = blobUrl;

  iframe.onload = () => {
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } finally {
        setTimeout(() => {
          iframe.remove();
          URL.revokeObjectURL(blobUrl);
        }, 3000);
      }
    }, 400);
  };

  document.body.appendChild(iframe);
}

export function PrintModal({ booking, onClose }: { booking: any; onClose: () => void }) {
  const [selected, setSelected] = useState<PaperSize>('80mm');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-card border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <Printer className="w-5 h-5 text-primary" /> اختر حجم الورق
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2 mb-6">
          {PAPER_SIZES.map(ps => (
            <button
              key={ps.value}
              onClick={() => setSelected(ps.value)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
                selected === ps.value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-white/10 text-muted-foreground hover:border-white/20 hover:text-foreground'
              }`}
            >
              <span className="font-bold text-base">{ps.label}</span>
              <span className="text-xs">{ps.desc}</span>
            </button>
          ))}
        </div>

        <button
          onClick={() => { doPrint(booking, selected); onClose(); }}
          className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
        >
          <Printer className="w-4 h-4" /> طباعة
        </button>
      </div>
    </div>
  );
}

type FilterKey = 'all' | 'pending' | 'completed' | 'starred';
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all',       label: 'الكل' },
  { key: 'pending',   label: 'انتظار' },
  { key: 'completed', label: 'مكتمل' },
  { key: 'starred',   label: '⭐' },
];

export function useBookings(source: 'facebook' | 'storefront', filter: FilterKey, platform?: string) {
  const [bookings, setBookings] = useState<any[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (platform) {
        params.set('platform', platform);
      } else {
        params.set('source', source);
      }
      if (filter === 'pending' || filter === 'completed') params.set('status', filter);
      if (filter === 'starred') params.set('starred', 'true');
      const res = await fetch(`${BASE}/api/bookings?${params}`);
      const data = await res.json();
      setBookings(Array.isArray(data) ? data : []);
    } catch {
      setBookings([]);
    } finally {
      setIsLoading(false);
    }
  }, [source, filter, platform]);

  useEffect(() => { load(); }, [load]);

  return { bookings, isLoading, refetch: load };
}

export function BookingSection({
  title,
  icon,
  source,
  accentClass,
  printBooking,
  setPrintBooking,
  platform,
}: {
  title: string;
  icon: React.ReactNode;
  source: 'facebook' | 'storefront';
  accentClass: string;
  printBooking: any;
  setPrintBooking: (b: any) => void;
  platform?: string;
}) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [brokenImages, setBrokenImages] = useState<Record<number, boolean>>({});
  const [reloadKeys, setReloadKeys] = useState<Record<number, number>>({});
  const [uploadingImageId, setUploadingImageId] = useState<number | null>(null);

  const { bookings, isLoading, refetch } = useBookings(source, filter, platform);

  const { mutate: updateBooking } = useUpdateBooking({
    mutation: { onSuccess: () => { refetch(); queryClient.invalidateQueries({ queryKey: ['/api/bookings'] }); } },
  });

  const handleToggleStar = (id: number, cur: boolean) => updateBooking({ id, data: { starred: !cur } });
  const handleStatusChange = (id: number, status: string) => updateBooking({ id, data: { status: status as UpdateBookingBodyStatus } });

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      await fetch(`${BASE}/api/bookings/${id}`, { method: 'DELETE' });
      refetch();
      queryClient.invalidateQueries({ queryKey: ['/api/bookings'] });
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  const toWhatsAppUrl = (phone: string) => {
    const digits = phone.replace(/\D/g, '');
    const intl = digits.startsWith('0') ? '964' + digits.slice(1) : digits;
    return `https://wa.me/${intl}`;
  };

  const handleImageUpload = async (bookingId: number, file: File) => {
    setUploadingImageId(bookingId);
    try {
      const reader = new FileReader();
      const base64: string = await new Promise((res, rej) => {
        reader.onload = () => res(reader.result as string);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      const resp = await fetch(`${BASE}/api/storefront/order/${bookingId}/receipt-image`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiptImage: base64 }),
      });
      if (resp.ok) {
        refetch();
        setBrokenImages(prev => ({ ...prev, [bookingId]: false }));
      }
    } catch { } finally {
      setUploadingImageId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className={`flex items-center gap-2.5 px-4 py-2.5 rounded-2xl border ${accentClass}`}>
          {icon}
          <h2 className="text-xl font-bold">{title}</h2>
          {bookings !== null && (
            <span className="text-sm font-medium opacity-70">({bookings.length})</span>
          )}
        </div>
        <div className="flex bg-black/20 p-1 rounded-xl border border-white/5">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${filter === key ? 'bg-card shadow-md text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Booking cards */}
      <div className="grid grid-cols-1 gap-4">
        {isLoading ? (
          <div className="flex justify-center p-10"><Loader2 className="w-7 h-7 text-primary animate-spin" /></div>
        ) : bookings?.length === 0 ? (
          <Card className="p-10 text-center text-muted-foreground text-sm">لا توجد حجوزات.</Card>
        ) : (
          bookings?.map((booking) => {
            const items: any[] = Array.isArray(booking.items) ? booking.items : [];
            const subtotal = items.reduce((s: number, i: any) => s + (i.unitPrice ?? i.price ?? 0) * (i.qty ?? i.quantity ?? 1), 0);
            const grandTotal = Number(booking.totalAmount ?? 0);
            const deliveryFee = booking.deliveryCost != null ? Number(booking.deliveryCost) : (grandTotal > 0 ? Math.max(0, grandTotal - subtotal) : 0);
            const notesRaw = booking.notes ?? '';
            const ageNote = notesRaw.match(/ملاحظة العمر:\s*(.+?)(?:\s*\|.*)?$/)?.[1]?.trim() ?? '';
            const statusOpt = STATUS_OPTIONS.find(s => s.value === booking.status) ?? STATUS_OPTIONS[0];
            const StatusIcon = statusOpt.icon;

            return (
              <div key={booking.id} className="space-y-1.5">
                {/* Action buttons */}
                <div className="flex items-center gap-2 px-1">
                  {booking.phoneNumber && (
                    <a
                      href={toWhatsAppUrl(booking.phoneNumber)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 active:scale-95"
                      style={{ background: '#25D366' }}
                    >
                      <MessageCircle className="w-4 h-4 shrink-0" />
                      <span>رسالة</span>
                    </a>
                  )}
                  <label className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold cursor-pointer transition-all hover:opacity-90 active:scale-95 bg-white/10 border border-white/15 text-foreground hover:bg-white/15">
                    {uploadingImageId === booking.id
                      ? <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                      : <ImagePlus className="w-4 h-4 shrink-0" />}
                    <span>{uploadingImageId === booking.id ? 'جاري الرفع...' : 'إضافة صورة'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploadingImageId === booking.id}
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) handleImageUpload(booking.id, file);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>

                <Card className="overflow-hidden transition-all duration-300 hover:border-primary/30">
                  {/* Header bar */}
                  <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 bg-black/20">
                    <div className="flex items-center gap-3 flex-wrap">
                      <button onClick={() => handleToggleStar(booking.id, booking.starred)} className="focus:outline-none transition-transform hover:scale-110">
                        <Star className={`w-5 h-5 transition-colors ${booking.starred ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground hover:text-yellow-400'}`} />
                      </button>
                      <span className="font-mono text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-md font-bold">#{booking.id + 873}</span>
                      <span className="font-bold text-foreground">{booking.senderName || 'زبون'}</span>
                      <Badge variant="outline" className="text-[10px]">{booking.platform?.toUpperCase()}</Badge>
                      <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${statusOpt.bg} ${statusOpt.color}`}>
                        <StatusIcon className="w-3 h-3" />{statusOpt.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground hidden sm:block">{format(new Date(booking.createdAt), 'yyyy/MM/dd – HH:mm')}</span>
                      <button
                        onClick={() => setPrintBooking(booking)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                        title="طباعة الفاتورة"
                      >
                        <Printer className="w-4 h-4" />
                      </button>
                      {confirmDeleteId === booking.id ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-muted-foreground">تأكيد؟</span>
                          <button
                            onClick={() => handleDelete(booking.id)}
                            disabled={deletingId === booking.id}
                            className="text-xs font-bold text-red-400 hover:text-red-300 px-2 py-1 rounded-lg bg-red-500/10 border border-red-500/30 transition-colors disabled:opacity-50"
                          >
                            {deletingId === booking.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'حذف'}
                          </button>
                          <button onClick={() => setConfirmDeleteId(null)} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg">إلغاء</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(booking.id)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="حذف الحجز"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col lg:flex-row gap-0">
                    {/* Left: contact + invoice table */}
                    <div className="flex-1 p-5 space-y-4">
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-foreground tracking-tight leading-none" style={{fontSize:30}}>sonbola.baby</span>
                          <span className="font-bold text-muted-foreground leading-none" style={{fontSize:25}}>| 20947</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-4 h-4 text-secondary shrink-0" />
                          <span className="font-mono font-black text-foreground" style={{ fontSize: 20 }} dir="ltr">{booking.phoneNumber}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-4 h-4 text-primary shrink-0" />
                          <span className="font-bold text-foreground" style={{ fontSize: 17 }}>
                            {booking.governorate && booking.governorate !== 'null' && booking.governorate !== 'غير محدد' ? `${booking.governorate} — ` : ''}
                            {booking.fullAddress && booking.fullAddress !== 'null' ? booking.fullAddress : 'غير محدد'}
                          </span>
                        </div>
                      </div>

                      {/* Invoice table */}
                      <div className="rounded-xl overflow-hidden border border-white/10" dir="rtl">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-white/5 text-xs text-muted-foreground">
                              <th className="py-2 px-3 text-right font-semibold">المنتج</th>
                              <th className="py-2 px-3 text-center font-semibold w-16">العدد</th>
                              <th className="py-2 px-3 text-center font-semibold w-24">السعر</th>
                              <th className="py-2 px-3 text-center font-semibold w-24">المبلغ</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map((item: any, idx: number) => {
                              const qty = item.qty ?? item.quantity ?? 1;
                              const unitP = item.unitPrice ?? item.price ?? 0;
                              const lineTotal = unitP * qty;
                              return (
                                <tr key={idx} className="border-t border-white/5 hover:bg-white/[0.02]">
                                  <td className="py-2.5 px-3">
                                    <div className="flex items-center gap-2">
                                      {(item.image || item.imageUrl) ? (
                                        <div className="relative shrink-0">
                                          <img src={item.image || item.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover border border-white/10" />
                                          <span className="absolute bottom-0 right-0 bg-black/70 text-white rounded px-0.5 leading-none" style={{ fontSize: 8 }}>{item.productId}</span>
                                        </div>
                                      ) : (
                                        <div className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                                          <Package className="w-4 h-4 text-muted-foreground" />
                                        </div>
                                      )}
                                      <div>
                                        <div className="font-medium text-foreground leading-tight">{item.nameAr || item.name || item.nameEn || item.productId}</div>
                                        <div className="text-[10px] text-muted-foreground font-mono">{item.productId || item.code}</div>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-3 text-center font-bold text-primary">{qty}</td>
                                  <td className="py-2.5 px-3 text-center font-semibold">{fmtPrice(unitP)}</td>
                                  <td className="py-2.5 px-3 text-center font-bold">{fmtPrice(lineTotal)}</td>
                                </tr>
                              );
                            })}
                            {deliveryFee > 0 && (
                              <tr className="border-t border-white/5 bg-white/[0.02]">
                                <td className="py-2 px-3 text-muted-foreground text-xs" colSpan={2}>🚚 توصيل — {booking.governorate}</td>
                                <td className="py-2 px-3 text-center text-xs text-muted-foreground">—</td>
                                <td className="py-2 px-3 text-center font-semibold text-blue-400">{fmtPrice(deliveryFee)}</td>
                              </tr>
                            )}
                          </tbody>
                          <tfoot>
                            <tr className="border-t border-white/10 bg-white/5">
                              <td colSpan={3} className="py-2.5 px-3 text-right font-bold text-foreground">المجموع الكلي</td>
                              <td className="py-2.5 px-3 text-center font-black text-primary">{fmtPrice(grandTotal)} د.ع</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>

                      {ageNote && (
                        <div className="text-xs text-muted-foreground flex items-center gap-1.5 bg-white/5 rounded-lg px-3 py-2 border border-white/5">
                          📝 <span>{ageNote}</span>
                        </div>
                      )}
                    </div>

                    {/* Right: receipt image + status chips */}
                    <div className="flex flex-col gap-4 p-5 lg:w-56 lg:border-r lg:border-white/5">
                      {(() => {
                        // Prefer receiptToken-based URL (stable server-rendered image),
                        // fall back to receiptImageUrl only if it's an actual image (not .txt)
                        const tokenUrl = (booking as any).receiptToken
                          ? `${BASE}/api/public/receipt/${(booking as any).receiptToken}/image`
                          : null;
                        const rawUrl = booking.receiptImageUrl;
                        const isTxtReceipt = rawUrl?.endsWith('.txt');
                        const effectiveImgUrl = tokenUrl ?? (isTxtReceipt ? null : rawUrl ?? null);
                        const hasReceipt = !!(effectiveImgUrl || (isTxtReceipt && rawUrl));

                        if (!hasReceipt) return null;
                        return (
                          <div className="space-y-1.5">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">صورة الفاتورة</p>
                            {/* Text-only receipt (.txt) → show as a link */}
                            {isTxtReceipt && !effectiveImgUrl ? (
                              <a
                                href={rawUrl!}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-xs text-primary hover:underline"
                              >
                                <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                                عرض الفاتورة
                              </a>
                            ) : brokenImages[booking.id] ? (
                              <div className="w-full rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col items-center gap-2 text-center">
                                <ImageOff className="w-8 h-8 text-muted-foreground/50" />
                                <p className="text-xs text-muted-foreground">انتهت صلاحية الصورة</p>
                                <button
                                  onClick={() => {
                                    setBrokenImages(prev => ({ ...prev, [booking.id]: false }));
                                    setReloadKeys(prev => ({ ...prev, [booking.id]: (prev[booking.id] ?? 0) + 1 }));
                                  }}
                                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                                >
                                  <RefreshCw className="w-3 h-3" />
                                  إعادة المحاولة
                                </button>
                              </div>
                            ) : (
                              <a href={effectiveImgUrl!} target="_blank" rel="noopener noreferrer" className="block relative group/img">
                                <img
                                  key={reloadKeys[booking.id] ?? 0}
                                  src={effectiveImgUrl!}
                                  alt={`فاتورة #${booking.id}`}
                                  className="w-full rounded-xl border border-white/10 object-cover shadow-md group-hover/img:ring-2 group-hover/img:ring-primary/60 transition-all"
                                  onError={() => setBrokenImages(prev => ({ ...prev, [booking.id]: true }))}
                                />
                                <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/20 rounded-xl transition-all flex items-center justify-center opacity-0 group-hover/img:opacity-100">
                                  <ExternalLink className="w-5 h-5 text-white drop-shadow" />
                                </div>
                              </a>
                            )}
                          </div>
                        );
                      })()}

                      <div className="space-y-1.5 mt-auto">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">تغيير الحالة</p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {STATUS_OPTIONS.map(({ value, label, icon: Icon, color, bg }) => (
                            <button
                              key={value}
                              onClick={() => handleStatusChange(booking.id, value)}
                              className={`flex items-center justify-center gap-1 px-2 py-2 rounded-xl border text-xs font-semibold transition-all ${
                                booking.status === value
                                  ? `${bg} ${color} shadow-inner`
                                  : 'border-white/10 text-muted-foreground hover:border-white/20 hover:text-foreground'
                              }`}
                            >
                              <Icon className="w-3 h-3 shrink-0" />
                              <span>{label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default function Bookings() {
  const { language } = useTranslation();
  const ar = language === 'ar';
  const [printBooking, setPrintBooking] = useState<any | null>(null);

  return (
    <div className="space-y-8">
      {printBooking && <PrintModal booking={printBooking} onClose={() => setPrintBooking(null)} />}

      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
          <Globe className="w-6 h-6 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-foreground">{ar ? 'حجوزات الموقع' : 'Website Bookings'}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{ar ? 'الطلبات الواردة من متجر sonbola.shop' : 'Orders from sonbola.shop store'}</p>
        </div>
      </div>

      <BookingSection
        title={ar ? 'حجوزات الموقع' : 'Website Bookings'}
        icon={<Globe className="w-5 h-5 text-emerald-400" />}
        source="storefront"
        accentClass="bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
        printBooking={printBooking}
        setPrintBooking={setPrintBooking}
      />
    </div>
  );
}
