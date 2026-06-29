import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Loader2, Save, Bot, PackageX, Sparkles,
  FileSpreadsheet, Search, BadgePercent, X, RefreshCw, Tag,
} from 'lucide-react';
import ExcelJS from 'exceljs';
import { useTranslation } from '@/lib/i18n';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

interface InventoryItem {
  id: number;
  productId: string;
  nameAr: string;
  price: number;
  discountPrice: string | null;
  isOnSale: boolean;
  publicImageUrl: string | null;
  imageUrl: string | null;
  ageMin: number;
  ageMax: number;
  ageRanges: string | null;
  available: boolean;
  stock: number;
  createdAt: string;
}

interface LocalEdit {
  price: string;
  discountPrice: string;
  isOnSale: boolean;
  ageText: string; // "3-6 سنة"
}

/** Format age from inventory row */
function fmtAge(item: InventoryItem): string {
  try {
    const r = item.ageRanges ? JSON.parse(item.ageRanges) : null;
    if (Array.isArray(r) && r.length > 0) return r.map((x: any) => `${x.min} الى ${x.max} سنة`).join('، ');
  } catch {}
  return `${item.ageMin} الى ${item.ageMax} سنة`;
}

export default function Suggestions() {
  const { language, isRtl } = useTranslation();
  const ar = language === 'ar';
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  // id → local edits
  const [edits, setEdits] = useState<Record<number, LocalEdit>>({});
  const [dirtyIds, setDirtyIds] = useState<Set<number>>(new Set());

  const { data: items = [], isLoading, isFetching, refetch } = useQuery<InventoryItem[]>({
    queryKey: ['/api/inventory'],
    queryFn: () => fetch(`${BASE}/api/inventory`).then(r => r.json()),
    onSuccess: (data: InventoryItem[]) => {
      // Seed edits from fresh data (only for non-dirty items)
      setEdits(prev => {
        const next = { ...prev };
        data.forEach(item => {
          if (!dirtyIds.has(item.id)) {
            next[item.id] = {
              price: String(item.price),
              discountPrice: item.discountPrice ?? '',
              isOnSale: item.isOnSale ?? false,
              ageText: fmtAge(item),
            };
          }
        });
        return next;
      });
    },
  } as any);

  const batchMutation = useMutation({
    mutationFn: (payload: any[]) =>
      fetch(`${BASE}/api/inventory/batch`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then(r => r.json()),
    onSuccess: () => {
      setDirtyIds(new Set());
      qc.invalidateQueries({ queryKey: ['/api/inventory'] });
    },
  });

  function markDirty(id: number, patch: Partial<LocalEdit>) {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
    setDirtyIds(prev => new Set([...prev, id]));
  }

  async function handleSaveAll() {
    if (dirtyIds.size === 0) return;
    setSaving(true);
    try {
      const payload = [...dirtyIds].map(id => {
        const e = edits[id];
        return {
          id,
          price: e.price,
          discountPrice: e.discountPrice || null,
          isOnSale: e.isOnSale,
          ageText: e.ageText,
        };
      });
      await batchMutation.mutateAsync(payload);
    } finally {
      setSaving(false);
    }
  }

  async function handleExportExcel() {
    setExporting(true);
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'SONBOLA';
      workbook.created = new Date();
      const sheet = workbook.addWorksheet('المخزون-الاقتراحات', { properties: { defaultColWidth: 20 } });
      sheet.views = [{ rightToLeft: true }];
      sheet.columns = [
        { header: 'الكود',          key: 'code',       width: 14 },
        { header: 'الاسم',          key: 'name',       width: 24 },
        { header: 'العمر',          key: 'age',        width: 20 },
        { header: 'السعر الأصلي',   key: 'price',      width: 16 },
        { header: 'سعر التخفيض',    key: 'sale',       width: 16 },
        { header: 'تخفيض؟',         key: 'onSale',     width: 10 },
        { header: 'المخزون',        key: 'stock',      width: 10 },
        { header: 'متاح',           key: 'available',  width: 10 },
        { header: 'رابط الصورة',    key: 'image',      width: 50 },
      ];
      const hdr = sheet.getRow(1);
      hdr.font = { bold: true, size: 12, color: { argb: 'FF1A1A1A' } };
      hdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFBBF24' } };
      hdr.alignment = { horizontal: 'center', vertical: 'middle' };
      hdr.height = 22;

      items.forEach((item, idx) => {
        const e = edits[item.id];
        const row = sheet.addRow({
          code:      item.productId,
          name:      item.nameAr,
          age:       e?.ageText || fmtAge(item),
          price:     e?.price ? Number(e.price).toLocaleString() : String(item.price),
          sale:      e?.discountPrice ? Number(e.discountPrice).toLocaleString() : '—',
          onSale:    e?.isOnSale ? 'نعم' : 'لا',
          stock:     item.stock,
          available: item.available ? 'نعم' : 'لا',
          image:     item.publicImageUrl || '—',
        });
        row.height = 18;
        row.alignment = { horizontal: 'right', vertical: 'middle' };
        const fgColor = idx % 2 === 0 ? 'FF1F2937' : 'FF111827';
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fgColor } };
        row.font = { color: { argb: 'FFE5E7EB' } };
      });
      sheet.autoFilter = { from: 'A1', to: 'I1' };

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `مخزون-سنبلة-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      i => i.productId.toLowerCase().includes(q) || i.nameAr.toLowerCase().includes(q)
    );
  }, [items, search]);

  // Sort: newest first (highest id = newest insert)
  const sorted = useMemo(() => [...filtered].sort((a, b) => b.id - a.id), [filtered]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-yellow-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6 font-sans" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Header */}
      <header className="flex flex-wrap gap-3 justify-between items-center mb-6 border-b border-gray-700 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-yellow-500 flex items-center gap-2">
            <Bot className="w-6 h-6" />
            {ar ? 'الاقتراحات الذكية' : 'Smart Suggestions'}
          </h1>
          <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-yellow-500" />
            {items.length} {ar ? 'منتج — مزامنة مباشرة من المخزون' : 'products — synced directly from inventory'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition disabled:opacity-50"
            title="تحديث"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleExportExcel}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg font-bold text-sm transition disabled:opacity-50"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
            تصدير Excel
          </button>
          <button
            onClick={handleSaveAll}
            disabled={saving || dirtyIds.size === 0}
            className="flex items-center gap-2 px-5 py-2 bg-yellow-500 hover:bg-yellow-400 text-gray-900 rounded-lg font-bold text-sm transition disabled:opacity-40"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            حفظ الكل {dirtyIds.size > 0 && <span className="bg-gray-900/30 px-1.5 rounded text-xs">{dirtyIds.size}</span>}
          </button>
        </div>
      </header>

      {/* Search bar */}
      <div className="relative mb-6">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="ابحث بالكود أو الاسم..."
          className="w-full bg-gray-800 border border-gray-700 rounded-xl pr-10 pl-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500 transition"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-gray-600">
          <PackageX className="w-12 h-12 mb-3 opacity-30" />
          <p className="text-sm">لا توجد منتجات</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {sorted.map(item => {
            const e = edits[item.id] ?? {
              price: String(item.price),
              discountPrice: item.discountPrice ?? '',
              isOnSale: item.isOnSale ?? false,
              ageText: fmtAge(item),
            };
            const isDirty = dirtyIds.has(item.id);
            return (
              <ProductCard
                key={item.id}
                item={item}
                edit={e}
                isDirty={isDirty}
                onChange={(patch) => markDirty(item.id, patch)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function ProductCard({
  item,
  edit,
  isDirty,
  onChange,
}: {
  item: InventoryItem;
  edit: LocalEdit;
  isDirty: boolean;
  onChange: (patch: Partial<LocalEdit>) => void;
}) {
  const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
  const imgSrc = item.publicImageUrl || item.imageUrl || null;
  const displaySrc = imgSrc
    ? (imgSrc.startsWith('/') ? `${BASE}${imgSrc}` : imgSrc)
    : null;

  return (
    <div className={`bg-gray-800 rounded-2xl overflow-hidden flex flex-col border transition ${
      isDirty ? 'border-yellow-500/60 shadow-lg shadow-yellow-900/20' : 'border-gray-700/60'
    }`}>
      {/* صورة */}
      <div className="relative w-full aspect-[3/4] bg-gray-700/40 overflow-hidden">
        {displaySrc ? (
          <img
            src={displaySrc}
            alt={item.productId}
            className="w-full h-full object-cover"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <PackageX className="w-8 h-8 opacity-20 text-gray-500" />
          </div>
        )}
        {/* code badge */}
        <span className="absolute top-1.5 right-1.5 bg-gray-900/80 text-yellow-400 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded">
          {item.productId}
        </span>
        {/* sale badge */}
        {edit.isOnSale && (
          <span className="absolute top-1.5 left-1.5 bg-red-600/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5">
            <BadgePercent className="w-2.5 h-2.5" /> خصم
          </span>
        )}
        {/* dirty indicator */}
        {isDirty && (
          <span className="absolute bottom-1.5 left-1.5 w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
        )}
        {!item.available && (
          <div className="absolute inset-0 bg-gray-900/50 flex items-center justify-center">
            <span className="text-[10px] text-red-400 font-bold bg-gray-900/80 px-1.5 py-0.5 rounded">غير متاح</span>
          </div>
        )}
      </div>

      {/* حقول */}
      <div className="p-2.5 space-y-2 flex-1">
        {/* عمر */}
        <div>
          <label className="text-[9px] text-gray-500 uppercase tracking-wider font-bold block mb-0.5">العمر</label>
          <input
            type="text"
            value={edit.ageText}
            onChange={e => onChange({ ageText: e.target.value })}
            placeholder="3-6 سنة"
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-xs text-blue-300 focus:outline-none focus:border-yellow-500 transition"
          />
        </div>

        {/* سعر */}
        <div>
          <label className="text-[9px] text-gray-500 uppercase tracking-wider font-bold block mb-0.5">السعر</label>
          <input
            type="text"
            value={edit.price}
            onChange={e => onChange({ price: e.target.value })}
            placeholder="25000"
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-xs text-green-400 font-bold focus:outline-none focus:border-yellow-500 transition"
          />
        </div>

        {/* سعر مخفض + toggle */}
        <div>
          <div className="flex items-center justify-between mb-0.5">
            <label className="text-[9px] text-gray-500 uppercase tracking-wider font-bold">تخفيض</label>
            <button
              onClick={() => onChange({ isOnSale: !edit.isOnSale })}
              className={`w-8 h-4 rounded-full transition relative ${edit.isOnSale ? 'bg-red-500' : 'bg-gray-600'}`}
            >
              <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all ${edit.isOnSale ? 'left-4.5 translate-x-0' : 'left-0.5'}`} style={{ left: edit.isOnSale ? '18px' : '2px' }} />
            </button>
          </div>
          <input
            type="text"
            value={edit.discountPrice}
            onChange={e => onChange({ discountPrice: e.target.value, isOnSale: e.target.value.trim() !== '' })}
            placeholder="20000"
            className={`w-full bg-gray-700 border rounded-lg px-2 py-1.5 text-xs font-bold focus:outline-none transition ${
              edit.isOnSale ? 'border-red-500/60 text-red-400 focus:border-red-400' : 'border-gray-600 text-gray-500 focus:border-yellow-500'
            }`}
          />
        </div>
      </div>
    </div>
  );
}
