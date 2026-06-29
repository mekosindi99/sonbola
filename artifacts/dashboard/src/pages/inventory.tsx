import { useState, useRef, useCallback } from 'react';
import { useTranslation } from '@/lib/i18n';
import {
  useGetInventory,
  useCreateInventoryItem,
  useUpdateInventoryItem,
  useDeleteInventoryItem,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import {
  Plus, Search, Edit2, Trash2, Loader2,
  PackageX, X, Upload, ImageIcon, CheckCircle2, MinusCircle,
  Pencil, Check, Layers, AlertCircle, Download, FileSpreadsheet,
} from 'lucide-react';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');


const SEASON_LABELS: Record<string, { ar: string; en: string; color: string }> = {
  Summer: { ar: 'صيفي', en: 'Summer', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  Winter: { ar: 'شتوي', en: 'Winter', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  Spring: { ar: 'بهاري', en: 'Spring', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
};
const GENDER_LABELS: Record<string, { ar: string; en: string; color: string }> = {
  Girls: { ar: 'بناتي', en: 'Girls', color: 'bg-pink-500/20 text-pink-400 border-pink-500/30' },
  Boys: { ar: 'ولادي', en: 'Boys', color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' },
  both: { ar: 'اثنيناتهم', en: 'Both', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
};

function CategoryBadge({ value, map }: { value: string; map: Record<string, { ar: string; en: string; color: string }> }) {
  const { isRtl } = useTranslation();
  const info = map[value];
  if (!info) return <span className="text-muted-foreground text-xs">{value}</span>;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${info.color}`}>
      {isRtl ? info.ar : info.en}
    </span>
  );
}

export default function Inventory() {
  const { t, isRtl } = useTranslation();
  const [search, setSearch] = useState('');
  const [seasonFilter, setSeasonFilter] = useState('');
  const [genderFilter, setGenderFilter] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [isDeleteAllOpen, setIsDeleteAllOpen] = useState(false);
  const [sortBy, setSortBy] = useState<'id' | 'viewCount' | 'botSendCount' | 'createdAt' | 'stock'>('id');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const { data: inventory, isLoading } = useGetInventory({ search });
  const queryClient = useQueryClient();

  const { mutate: deleteItem, isPending: isDeleting } = useDeleteInventoryItem({
    mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/inventory'] }) }
  });

  const { mutate: updateItemAvailable } = useUpdateInventoryItem({
    mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/inventory'] }) }
  });

  const filtered = (inventory ?? [])
    .filter(item => {
      if (seasonFilter && item.category !== seasonFilter) return false;
      if (genderFilter && (item as any).gender !== genderFilter) return false;
      return true;
    })
    .sort((a: any, b: any) => {
      const av = a[sortBy] ?? 0;
      const bv = b[sortBy] ?? 0;
      const cmp = typeof av === 'string' ? av.localeCompare(bv) : (av as number) - (bv as number);
      return sortDir === 'desc' ? -cmp : cmp;
    });

  const handleEdit = (item: any) => { setEditingItem(item); setIsModalOpen(true); };
  const handleAdd = () => { setEditingItem(null); setIsModalOpen(true); };
  const handleClose = () => { setIsModalOpen(false); setEditingItem(null); };

  return (
    <div className="space-y-6" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">{isRtl ? 'المخزون' : 'Inventory'}</h1>
          <p className="text-muted-foreground text-sm mt-1">{isRtl ? 'إدارة منتجات متجرك' : 'Manage your store products'}</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleAdd}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
          >
            <Plus className="w-4 h-4" />
            {isRtl ? 'إضافة منتج' : 'Add Product'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className={`absolute ${isRtl ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground`} />
          <input
            placeholder={isRtl ? 'بحث...' : 'Search...'}
            className={`w-full h-11 ${isRtl ? 'pr-10 pl-4' : 'pl-10 pr-4'} rounded-xl border border-white/10 bg-card text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground`}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="h-11 w-full md:w-44 rounded-xl border border-white/10 bg-card px-4 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          value={seasonFilter}
          onChange={e => setSeasonFilter(e.target.value)}
        >
          <option value="">{isRtl ? 'كل الفصول' : 'All Seasons'}</option>
          <option value="Summer">{isRtl ? 'صيفي' : 'Summer'}</option>
          <option value="Winter">{isRtl ? 'شتوي' : 'Winter'}</option>
          <option value="Spring">{isRtl ? 'بهاري' : 'Spring'}</option>
        </select>
        <select
          className="h-11 w-full md:w-44 rounded-xl border border-white/10 bg-card px-4 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          value={genderFilter}
          onChange={e => setGenderFilter(e.target.value)}
        >
          <option value="">{isRtl ? 'الكل' : 'All'}</option>
          <option value="Girls">{isRtl ? 'بناتي' : 'Girls'}</option>
          <option value="Boys">{isRtl ? 'ولادي' : 'Boys'}</option>
          <option value="both">{isRtl ? 'اثنيناتهم' : 'Both'}</option>
        </select>
      </div>

      {/* Sort row */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-muted-foreground font-medium">{isRtl ? 'ترتيب:' : 'Sort:'}</span>
        {([
          { key: 'id', label: isRtl ? 'تسلسل' : 'Seq' },
          { key: 'viewCount', label: isRtl ? '👁 مشاهدات' : '👁 Views' },
          { key: 'botSendCount', label: isRtl ? '🤖 البوت' : '🤖 Bot' },
          { key: 'stock', label: isRtl ? 'مخزون' : 'Stock' },
          { key: 'createdAt', label: isRtl ? 'التاريخ' : 'Date' },
        ] as { key: typeof sortBy; label: string }[]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => {
              if (sortBy === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
              else { setSortBy(key); setSortDir('desc'); }
            }}
            className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${sortBy === key ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-white/10 hover:bg-muted/50'}`}
          >
            {label}
            {sortBy === key && <span className="font-bold">{sortDir === 'desc' ? '↓' : '↑'}</span>}
          </button>
        ))}
      </div>

      {/* Grid / Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
          <PackageX className="w-16 h-16 mb-4 opacity-20" />
          <p className="text-lg font-medium">{isRtl ? 'لا توجد منتجات' : 'No products found'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(item => (
            <ProductCard
              key={item.id}
              item={item as any}
              onEdit={() => handleEdit(item)}
              onDelete={() => { if (confirm(isRtl ? 'حذف هذا المنتج؟' : 'Delete this product?')) deleteItem({ id: item.id }); }}
              onToggleAvailable={() => updateItemAvailable({ id: item.id, data: { available: !item.available } })}
              isRtl={isRtl}
            />
          ))}
        </div>
      )}

      {isModalOpen && (
        <InventoryModal item={editingItem} onClose={handleClose} />
      )}

      {isBulkOpen && (
        <BulkUploadModal
          onClose={() => setIsBulkOpen(false)}
          onEditItem={(item) => { setIsBulkOpen(false); setEditingItem(item); setIsModalOpen(true); }}
        />
      )}

      {isDeleteAllOpen && (
        <DeleteAllModal onClose={() => setIsDeleteAllOpen(false)} onConfirm={() => setIsDeleteAllOpen(false)} />
      )}
    </div>
  );
}

function DeleteAllModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: () => void }) {
  const { isRtl } = useTranslation();
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [done, setDone] = useState(false);
  const queryClient = useQueryClient();

  const handleDelete = async () => {
    setIsDeletingAll(true);
    try {
      await fetch('/api/inventory', { method: 'DELETE' });
      await queryClient.refetchQueries({ queryKey: ['/api/inventory'] });
      setDone(true);
    } catch {
      /* ignore */
    } finally {
      setIsDeletingAll(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={!isDeletingAll ? onClose : undefined} />
      <div className="relative w-full max-w-sm bg-card border border-red-500/20 rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="p-6 space-y-4">
          {!done ? (
            <>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/25 flex items-center justify-center flex-shrink-0">
                  <Trash2 className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-foreground">حذف كل المخزون</h2>
                  <p className="text-xs text-muted-foreground">هذا الإجراء لا يمكن التراجع عنه</p>
                </div>
              </div>
              <div className="p-3 rounded-xl bg-red-500/8 border border-red-500/15">
                <p className="text-sm text-red-300 leading-relaxed">
                  سيتم حذف <span className="font-bold">جميع المنتجات</span> من قاعدة البيانات نهائياً. هل أنت متأكد تماماً؟
                </p>
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  onClick={onClose}
                  disabled={isDeletingAll}
                  className="flex-1 h-11 rounded-xl border border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors text-sm font-medium disabled:opacity-50"
                >
                  إلغاء
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isDeletingAll}
                  className="flex-1 h-11 rounded-xl bg-red-500 hover:bg-red-400 text-white font-bold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-red-500/20"
                >
                  {isDeletingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  {isDeletingAll ? 'جاري الحذف...' : 'نعم، احذف الكل'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-col items-center gap-3 py-2">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                </div>
                <p className="text-sm font-semibold text-foreground">تم حذف المخزون بنجاح</p>
              </div>
              <button
                onClick={onClose}
                className="w-full h-11 rounded-xl bg-white/8 hover:bg-white/12 text-foreground font-medium text-sm transition-colors border border-white/10"
              >
                إغلاق
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

type BulkItem = {
  id: string;
  file: File;
  preview: string;
  code: string;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
};

function resizeImageToSquare(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read failed'));
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const img = new Image();
      img.onerror = () => reject(new Error('decode failed'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 1080;
        canvas.height = 1080;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, 1080, 1080);
        const size = Math.min(img.width, img.height);
        const sx = (img.width - size) / 2;
        const sy = (img.height - size) / 2;
        ctx.drawImage(img, sx, sy, size, size, 0, 0, 1080, 1080);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

function BulkUploadModal({ onClose, onEditItem }: { onClose: () => void; onEditItem: (item: any) => void }) {
  const { isRtl } = useTranslation();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const excelImportRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<BulkItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isGeneratingExcel, setIsGeneratingExcel] = useState(false);
  const [excelImported, setExcelImported] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const createdItemsRef = useRef<Record<string, any>>({});

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    const newItems: BulkItem[] = [];
    const baseTs = Date.now();
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('image/')) continue;
      const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '-').substring(0, 12).toUpperCase();
      const suffix = `${(baseTs + i).toString(36).slice(-5).toUpperCase()}-${String(i + 1).padStart(2, '0')}`;
      newItems.push({
        id: `${baseTs}-${i}`,
        file,
        preview: URL.createObjectURL(file),
        code: `${baseName}-${suffix}`,
        status: 'pending',
      });
    }
    setItems(prev => [...prev, ...newItems]);
    setExcelImported(false);
  };

  const updateCode = (id: string, code: string) => {
    setItems(prev => prev.map(it => it.id === id ? { ...it, code } : it));
  };

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(it => it.id !== id));
  };

  const downloadExcel = async () => {
    if (!items.length) return;
    setIsGeneratingExcel(true);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const workbook = new ExcelJS.Workbook();
      const ws = workbook.addWorksheet('Products', { views: [{ rightToLeft: true }] });

      ws.columns = [
        { header: 'الكود', key: 'code', width: 22 },
        { header: 'اسم الملف', key: 'filename', width: 38 },
        { header: 'الصورة', key: 'image', width: 14 },
      ];

      const headerRow = ws.getRow(1);
      headerRow.font = { bold: true, size: 12, color: { argb: 'FF000000' } };
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF59E0B' } };
      headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
      headerRow.height = 24;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const row = ws.addRow({ code: item.code, filename: item.file.name });
        row.height = 90;
        row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(1).font = { bold: true, size: 13 };
        row.getCell(2).alignment = { horizontal: 'right', vertical: 'middle' };

        try {
          const resp = await fetch(item.preview);
          const ab = await resp.arrayBuffer();
          const ext = item.file.type.includes('png') ? 'png' : 'jpeg';
          const imgId = workbook.addImage({ buffer: ab, extension: ext as any });
          ws.addImage(imgId, {
            tl: { col: 2, row: i + 1 } as any,
            br: { col: 3, row: i + 2 } as any,
          });
        } catch { /* skip image on error */ }
      }

      ws.eachRow(row => {
        row.eachCell(cell => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
            left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
            bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
            right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          };
        });
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sonbola-${Date.now()}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Excel export failed:', err);
    } finally {
      setIsGeneratingExcel(false);
    }
  };

  const importExcel = async (file: File) => {
    try {
      const ExcelJS = (await import('exceljs')).default;
      const workbook = new ExcelJS.Workbook();
      const ab = await file.arrayBuffer();
      await workbook.xlsx.load(ab);
      const ws = workbook.worksheets[0];
      const updates: Record<string, string> = {};
      ws.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const code = String(row.getCell(1).value ?? '').trim();
        const filename = String(row.getCell(2).value ?? '').trim();
        if (code && filename) updates[filename] = code;
      });
      let changed = 0;
      setItems(prev => prev.map(item => {
        const newCode = updates[item.file.name];
        if (newCode && newCode !== item.code) { changed++; return { ...item, code: newCode.toUpperCase() }; }
        return item;
      }));
      setExcelImported(true);
    } catch (err) {
      console.error('Excel import failed:', err);
    }
  };

  const uploadAll = async () => {
    const pending = items.filter(it => it.status === 'pending');
    if (!pending.length) return;
    setIsUploading(true);
    let done = doneCount;
    for (const item of pending) {
      setItems(prev => prev.map(it => it.id === item.id ? { ...it, status: 'uploading' } : it));
      try {
        const base64 = await resizeImageToSquare(item.file);
        const res = await fetch('/api/inventory', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nameAr: item.code,
            nameEn: item.code,
            productId: item.code,
            category: 'Summer',
            gender: 'Girls',
            ageRanges: [{ min: '1', max: '12' }],
            ageMin: 1,
            ageMax: 12,
            price: 0,
            stock: 0,
            available: false,
            imageUrl: base64,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as any)?.message || `HTTP ${res.status}`);
        }
        const created = await res.json();
        createdItemsRef.current[item.id] = created;
        done++;
        setDoneCount(done);
        setItems(prev => prev.map(it => it.id === item.id ? { ...it, status: 'done' } : it));
      } catch (err: any) {
        setItems(prev => prev.map(it => it.id === item.id ? { ...it, status: 'error', error: err.message } : it));
      }
    }
    setIsUploading(false);
    if (done > 0) {
      await queryClient.refetchQueries({ queryKey: ['/api/inventory'] });
    }
  };

  const handleEditItem = (bulkId: string) => {
    const created = createdItemsRef.current[bulkId];
    if (created) onEditItem(created);
  };

  const allDone = items.length > 0 && items.every(it => it.status === 'done' || it.status === 'error');
  const pendingCount = items.filter(it => it.status === 'pending').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={!isUploading ? onClose : undefined} />
      <div className="relative w-full max-w-2xl bg-card border border-amber-500/20 rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/8 bg-amber-500/5 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
              <Layers className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">رفع صور بالجملة</h2>
              <p className="text-xs text-muted-foreground">اختر الصور → نزّل Excel → عدّل الكودات → استورد → ارفع</p>
            </div>
          </div>
          <button
            onClick={!isUploading ? onClose : undefined}
            disabled={isUploading}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Steps hint */}
        {items.length > 0 && !allDone && !isUploading && (
          <div className="px-4 pt-3 flex-shrink-0">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground bg-white/3 border border-white/8 rounded-xl px-3 py-2">
              <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">١</span>
              <span>نزّل Excel</span>
              <span className="text-white/20 mx-1">←</span>
              <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">٢</span>
              <span>عدّل الكودات في Excel</span>
              <span className="text-white/20 mx-1">←</span>
              <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">٣</span>
              <span>استورد Excel المعدّل</span>
              <span className="text-white/20 mx-1">←</span>
              <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">٤</span>
              <span>ارفع الكل</span>
              {excelImported && <span className="mr-2 text-emerald-400 font-semibold">✓ تم استيراد Excel</span>}
            </div>
          </div>
        )}

        {/* Drop zone */}
        {!isUploading && !allDone && (
          <div className="p-4 flex-shrink-0">
            <div
              className="border-2 border-dashed border-amber-500/30 hover:border-amber-500/60 rounded-2xl p-5 flex flex-col items-center gap-3 cursor-pointer transition-colors bg-amber-500/3 hover:bg-amber-500/6"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
            >
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center">
                <Upload className="w-5 h-5 text-amber-400" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-foreground/80">اضغط لاختيار الصور أو اسحبها هنا</p>
                <p className="text-xs text-muted-foreground mt-0.5">PNG، JPG، WEBP — يمكنك اختيار عدة صور</p>
              </div>
              <span className="px-4 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 text-xs font-semibold border border-amber-500/30">
                اختيار صور
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={e => handleFiles(e.target.files)}
              />
            </div>
          </div>
        )}

        {/* Items list */}
        {items.length > 0 && (
          <div className="flex-1 overflow-y-auto px-4 pb-2 space-y-2 min-h-0 pt-2">
            {items.map(item => (
              <div key={item.id} className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                item.status === 'done' ? 'border-emerald-500/25 bg-emerald-500/5' :
                item.status === 'error' ? 'border-red-500/25 bg-red-500/5' :
                item.status === 'uploading' ? 'border-amber-500/25 bg-amber-500/5' :
                'border-white/8 bg-white/3'
              }`}>
                <div className="w-14 h-14 rounded-lg overflow-hidden bg-black/30 flex-shrink-0 relative">
                  <img src={item.preview} alt="" className="w-full h-full object-cover" />
                  {item.status === 'uploading' && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
                    </div>
                  )}
                  {item.status === 'done' && (
                    <div className="absolute inset-0 bg-emerald-500/30 flex items-center justify-center">
                      <CheckCircle2 className="w-5 h-5 text-emerald-300" />
                    </div>
                  )}
                  {item.status === 'error' && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <AlertCircle className="w-5 h-5 text-red-400" />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <label className="text-[10px] text-muted-foreground">كود المنتج</label>
                    <span className="text-[9px] text-white/25 truncate max-w-[120px]">{item.file.name}</span>
                  </div>
                  <input
                    value={item.code}
                    onChange={e => updateCode(item.id, e.target.value.toUpperCase())}
                    disabled={item.status !== 'pending'}
                    dir="ltr"
                    className="w-full h-8 px-3 rounded-lg border border-white/10 bg-black/30 text-xs text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-amber-500/60 disabled:opacity-50"
                  />
                  {item.error && (
                    <p className="text-[10px] text-red-400 mt-0.5 truncate">{item.error}</p>
                  )}
                </div>

                <div className="flex-shrink-0">
                  {item.status === 'pending' && (
                    <button
                      onClick={() => removeItem(item.id)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  {item.status === 'uploading' && (
                    <span className="text-xs text-amber-400 font-medium px-1">جاري...</span>
                  )}
                  {item.status === 'done' && (
                    <button
                      onClick={() => handleEditItem(item.id)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary/20 hover:bg-primary/35 text-primary text-xs font-bold transition-colors border border-primary/30"
                    >
                      <Edit2 className="w-3 h-3" />
                      تعديل
                    </button>
                  )}
                  {item.status === 'error' && (
                    <button
                      onClick={() => setItems(prev => prev.map(it => it.id === item.id ? { ...it, status: 'pending', error: undefined } : it))}
                      className="text-xs text-amber-400 underline px-1"
                    >
                      إعادة
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="p-4 border-t border-white/8 flex-shrink-0">
          {items.length > 0 && !allDone && (
            <div className="flex items-center gap-2 flex-wrap">
              {/* Excel export */}
              <button
                onClick={downloadExcel}
                disabled={isUploading || isGeneratingExcel || pendingCount === 0}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500/12 border border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/20 text-xs font-semibold transition-colors disabled:opacity-40"
                title="تحميل ملف Excel بالكودات والصور"
              >
                {isGeneratingExcel ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                {isGeneratingExcel ? 'جاري التحضير...' : 'تحميل Excel'}
              </button>

              {/* Excel import */}
              <button
                onClick={() => excelImportRef.current?.click()}
                disabled={isUploading}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-semibold transition-colors disabled:opacity-40 ${
                  excelImported
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                    : 'bg-blue-500/10 border-blue-500/25 text-blue-400 hover:bg-blue-500/18'
                }`}
                title="استيراد Excel المعدّل لتحديث الكودات"
              >
                {excelImported ? <CheckCircle2 className="w-3.5 h-3.5" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
                {excelImported ? 'تم الاستيراد ✓' : 'استيراد Excel'}
              </button>
              <input
                ref={excelImportRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={e => { if (e.target.files?.[0]) importExcel(e.target.files[0]); e.target.value = ''; }}
              />

              <span className="text-xs text-muted-foreground flex-1 text-left">
                {pendingCount} صورة
              </span>

              {/* Upload all */}
              <button
                onClick={uploadAll}
                disabled={isUploading || pendingCount === 0}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm transition-colors disabled:opacity-50 shadow-lg shadow-amber-500/25"
              >
                {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {isUploading ? 'جاري الرفع...' : 'رفع الكل'}
              </button>
            </div>
          )}
          {allDone && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-emerald-400 flex-1 font-medium">
                ✓ تم رفع {doneCount} صورة — اضغط "تعديل" على أي منتج
              </span>
              <button
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-foreground font-semibold text-sm transition-colors border border-white/10"
              >
                إغلاق
              </button>
            </div>
          )}
          {items.length === 0 && (
            <span className="text-xs text-muted-foreground flex-1 text-center block">اختر صوراً من أعلى لتبدأ</span>
          )}
        </div>
      </div>
    </div>
  );
}

function ProductCard({ item, onEdit, onDelete, onToggleAvailable, isRtl }: { item: any; onEdit: () => void; onDelete: () => void; onToggleAvailable: () => void; isRtl: boolean }) {
  return (
    <div className="bg-card border border-white/8 rounded-2xl overflow-hidden hover:border-primary/30 transition-all duration-200 group">
      {/* Square Image */}
      <div className="aspect-square bg-black/30 relative overflow-hidden">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt={isRtl ? item.nameAr : item.nameEn} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="w-12 h-12 text-muted-foreground/30" />
          </div>
        )}
        {/* Overlay actions */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
          <button onClick={onEdit} className="p-2.5 rounded-full bg-white/10 hover:bg-primary/80 transition-colors">
            <Edit2 className="w-4 h-4 text-white" />
          </button>
          <button onClick={onDelete} className="p-2.5 rounded-full bg-white/10 hover:bg-red-500/80 transition-colors">
            <Trash2 className="w-4 h-4 text-white" />
          </button>
        </div>
        {/* Available toggle badge */}
        <div className="absolute top-2 right-2">
          <button
            onClick={e => { e.stopPropagation(); onToggleAvailable(); }}
            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors ${
              item.available
                ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/35'
                : 'bg-red-500/15 border-red-500/25 text-red-400 hover:bg-red-500/25'
            }`}
          >
            {item.available ? (isRtl ? '✓ ظاهر' : '✓ Live') : (isRtl ? '✗ مخفي' : '✗ Hidden')}
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-mono font-bold text-primary">{item.productId}</p>
          <div className="text-right">
            {item.isOnSale && item.discountPrice ? (
              <>
                <p className="text-xs line-through text-muted-foreground">{Number(item.price).toLocaleString()} د.ع</p>
                <p className="text-sm font-bold text-rose-500">{Number(item.discountPrice).toLocaleString()} د.ع</p>
              </>
            ) : (
              <p className="text-sm font-bold text-foreground whitespace-nowrap">{Number(item.price).toLocaleString()} د.ع</p>
            )}
          </div>
        </div>
        {item.isOnSale && item.discountPrice && (
          <div className="flex">
            <span className="text-[10px] bg-rose-500/20 text-rose-400 font-bold px-1.5 py-0.5 rounded">🏷️ خصم</span>
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          <CategoryBadge value={item.category} map={SEASON_LABELS} />
          <CategoryBadge value={item.gender ?? 'both'} map={GENDER_LABELS} />
        </div>

        {((item.viewCount ?? 0) > 0 || (item.botSendCount ?? 0) > 0) && (
          <div className="flex items-center gap-3 text-[10px]">
            {(item.viewCount ?? 0) > 0 && (
              <span className="text-blue-400 font-semibold">👁 {item.viewCount}</span>
            )}
            {(item.botSendCount ?? 0) > 0 && (
              <span className="text-green-400 font-semibold">🤖 {item.botSendCount}</span>
            )}
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>📦 {item.stock} {isRtl ? 'قطعة' : 'pcs'}</span>
          <span>🧒 {(() => {
            try {
              const ranges = item.ageRanges ? JSON.parse(item.ageRanges) : null;
              if (Array.isArray(ranges) && ranges.length > 0) {
                return ranges.map((r: any) => `${r.min} الى ${r.max}`).join('، ');
              }
            } catch {}
            return `${item.ageMin} الى ${item.ageMax}`;
          })()}</span>
        </div>

        {item.colors && (
          <div className="text-[10px] text-muted-foreground/70 flex items-center gap-1 pt-0.5 border-t border-white/5">
            <span>🎨</span>
            <span className="truncate">{item.colors}</span>
          </div>
        )}

      </div>
    </div>
  );
}

type AgeRangeField = { minVal: string; minUnit: string; maxVal: string; maxUnit: string };

function splitAgePart(raw: string | number): { val: string; unit: string } {
  const s = String(raw ?? '').trim();
  const num = s.replace(/[^\d.]/g, '').trim();
  if (s.includes('شهر') || s.includes('شهور')) return { val: num, unit: 'شهر' };
  return { val: num, unit: 'سنة' };
}

function parseAgeRanges(item: any): AgeRangeField[] {
  if (!item) return [{ minVal: '', minUnit: 'سنة', maxVal: '', maxUnit: 'سنة' }];
  try {
    const ranges = item.ageRanges ? JSON.parse(item.ageRanges) : null;
    if (Array.isArray(ranges) && ranges.length > 0) {
      return ranges.map((r: any) => {
        const { val: minVal, unit: minUnit } = splitAgePart(r.min ?? '');
        const { val: maxVal, unit: maxUnit } = splitAgePart(r.max ?? '');
        return { minVal, minUnit, maxVal, maxUnit };
      });
    }
  } catch {}
  if (item.ageMin != null || item.ageMax != null) {
    const { val: minVal, unit: minUnit } = splitAgePart(item.ageMin ?? '');
    const { val: maxVal, unit: maxUnit } = splitAgePart(item.ageMax ?? '');
    return [{ minVal, minUnit, maxVal, maxUnit }];
  }
  return [{ minVal: '', minUnit: 'سنة', maxVal: '', maxUnit: 'سنة' }];
}

function InventoryModal({ item, onClose }: { item: any; onClose: () => void }) {
  const { isRtl } = useTranslation();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const originalImageUrl = useRef<string>(item?.imageUrl ?? '');
  const [imagePreview, setImagePreview] = useState<string>(
    item?.publicImageUrl ? (item.imageUrl ?? '') : (item?.imageUrl ?? '')
  );
  const [isDragging, setIsDragging] = useState(false);
  const [duplicateIdError, setDuplicateIdError] = useState<string | null>(null);

  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageUploaded, setImageUploaded] = useState(!!item?.publicImageUrl);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const { register, handleSubmit, control, setValue, watch, formState: { errors } } = useForm({
    defaultValues: {
      productId: item?.productId ?? '',
      category: item?.category ?? 'Summer',
      gender: item?.gender ?? 'Girls',
      ageRanges: parseAgeRanges(item),
      price: item?.price != null ? String(item.price) : '',
      stock: item?.stock != null ? String(item.stock) : '',
      colors: item?.colors ?? '',
      descriptionAr: item?.descriptionAr ?? '',
      available: item?.available ?? true,
      publicImageUrl: item?.publicImageUrl ?? '',
      discountPrice: (item as any)?.discountPrice != null ? String((item as any).discountPrice) : '',
      isOnSale: (item as any)?.isOnSale ?? false,
    }
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'ageRanges' as never });

  const handleDuplicateError = (err: any) => {
    if (err?.status === 409 || (err?.data as any)?.error === 'duplicate_product_id') {
      setDuplicateIdError(isRtl ? 'هذا الكود موجود بالفعل في النظام' : 'This product ID already exists');
    }
  };

  const { mutate: createItem, isPending: isCreating } = useCreateInventoryItem({
    mutation: {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/inventory'] }); onClose(); },
      onError: handleDuplicateError,
    }
  });
  const { mutate: updateItem, isPending: isUpdating } = useUpdateInventoryItem({
    mutation: {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/inventory'] }); onClose(); },
      onError: handleDuplicateError,
    }
  });

  const isPending = isCreating || isUpdating;

  const processFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    setUploadError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 1080;
        canvas.height = 1080;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, 1080, 1080);
        const size = Math.min(img.width, img.height);
        const sx = (img.width - size) / 2;
        const sy = (img.height - size) / 2;
        ctx.drawImage(img, sx, sy, size, size, 0, 0, 1080, 1080);
        const resized = canvas.toDataURL('image/jpeg', 0.85);
        setImagePreview(resized);
        setImageUploaded(false);
        setValue('publicImageUrl', '');
      };
      img.onerror = () => setUploadError(isRtl ? 'فشل تحميل الصورة، جرب صيغة أخرى' : 'Failed to load image');
      img.src = dataUrl;
    };
    reader.onerror = () => setUploadError(isRtl ? 'فشل قراءة الملف' : 'Failed to read file');
    reader.readAsDataURL(file);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, []);

  const onSubmit = (data: any) => {
    setUploadError(null);
    const ageValToYears = (val: string, unit: string): number => {
      const num = parseFloat(val) || 0;
      return unit === 'شهر' ? num / 12 : num;
    };
    const ageRanges = (data.ageRanges || []).map((r: any) => ({
      min: r.minVal ? `${r.minVal} ${r.minUnit}` : '',
      max: r.maxVal ? `${r.maxVal} ${r.maxUnit}` : '',
    }));
    const imageChanged = imagePreview !== originalImageUrl.current;
    const payload: any = {
      nameAr: data.productId,
      nameEn: data.productId,
      productId: data.productId,
      category: data.category,
      gender: data.gender,
      ageRanges,
      ageMin: ageValToYears(data.ageRanges[0]?.minVal ?? '', data.ageRanges[0]?.minUnit ?? 'سنة'),
      ageMax: ageValToYears(data.ageRanges[0]?.maxVal ?? '', data.ageRanges[0]?.maxUnit ?? 'سنة'),
      price: data.price !== '' ? Number(data.price) : 0,
      stock: data.stock !== '' ? Number(data.stock) : 0,
      colors: data.colors?.trim() || null,
      descriptionAr: data.descriptionAr || null,
      available: data.available,
      publicImageUrl: data.publicImageUrl?.trim() || null,
      discountPrice: data.discountPrice !== '' && data.discountPrice != null ? Number(data.discountPrice) : null,
      isOnSale: data.isOnSale ?? false,
    };
    if (imageChanged) {
      payload.imageUrl = imagePreview || null;
    }
    if (item) {
      updateItem({ id: item.id, data: payload });
    } else {
      createItem({ data: payload });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-card border border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/8">
          <h2 className="text-lg font-bold text-foreground">
            {item
              ? (isRtl ? 'تعديل المنتج' : 'Edit Product')
              : (isRtl ? 'إضافة منتج جديد' : 'Add New Product')}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-5">
          {/* Image Upload — 1080×1080 */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">{isRtl ? 'الصورة*' : 'Image*'}</label>
            <div
              className={`relative aspect-square rounded-2xl border-2 border-dashed cursor-pointer overflow-hidden transition-all duration-200 ${
                isDragging ? 'border-primary bg-primary/10' : 'border-white/15 hover:border-primary/50 hover:bg-white/3'
              }`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
            >
              {imagePreview ? (
                <>
                  <img src={imagePreview} alt="preview" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="flex flex-col items-center gap-2 text-white">
                      <Upload className="w-8 h-8" />
                      <span className="text-sm font-medium">{isRtl ? 'تغيير الصورة' : 'Change Image'}</span>
                    </div>
                  </div>
                  <div className="absolute bottom-2 right-2 bg-emerald-500/90 rounded-full p-1">
                    <CheckCircle2 className="w-4 h-4 text-white" />
                  </div>
                </>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground p-6">
                  <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center">
                    <ImageIcon className="w-7 h-7" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-foreground/70">
                      {isRtl ? 'اختر صورة أو اسحب وأفلت' : 'Choose or drag & drop'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {isRtl ? 'سيتم ضبطها تلقائياً 1080×1080' : 'Auto-resized to 1080×1080'}
                    </p>
                    <p className="text-xs text-muted-foreground">PNG, JPG, WEBP</p>
                  </div>
                  <div className="flex gap-2 mt-1">
                    <span className="px-3 py-1.5 rounded-lg bg-primary/20 text-primary text-xs font-medium border border-primary/30">
                      {isRtl ? 'اختيار صورة' : 'Choose Image'}
                    </span>
                  </div>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); }}
              />
            </div>
          </div>

          {/* Product ID */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">{isRtl ? 'كود القطعة (ID)*' : 'Product ID*'}</label>
            <input
              {...register('productId', { required: true })}
              placeholder="e.g. PRD001"
              onChange={(e) => { setDuplicateIdError(null); register('productId').onChange(e); }}
              className={`w-full h-11 px-4 rounded-xl border bg-black/20 text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground/50 transition-colors ${
                duplicateIdError ? 'border-red-500/60 focus:ring-red-500/50' : 'border-white/10'
              }`}
            />
            {duplicateIdError && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
                <span className="text-red-400 text-xs">⚠</span>
                <p className="text-xs text-red-400" dir="rtl">{duplicateIdError}</p>
              </div>
            )}
          </div>

          {/* Category + Gender */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">{isRtl ? 'الفصل*' : 'Season*'}</label>
              <select
                {...register('category', { required: true })}
                className="w-full h-11 px-3 rounded-xl border border-white/10 bg-black/20 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="Summer">{isRtl ? '☀️ صيفي' : '☀️ Summer'}</option>
                <option value="Spring">{isRtl ? '🌸 بهاري' : '🌸 Spring'}</option>
                <option value="Winter">{isRtl ? '❄️ شتوي' : '❄️ Winter'}</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">{isRtl ? 'الجنس*' : 'Gender*'}</label>
              <select
                {...register('gender', { required: true })}
                className="w-full h-11 px-3 rounded-xl border border-white/10 bg-black/20 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="Girls">{isRtl ? '👧 بناتي' : '👧 Girls'}</option>
                <option value="Boys">{isRtl ? '👦 ولادي' : '👦 Boys'}</option>
                <option value="both">{isRtl ? '👦👧 اثنيناتهم' : '👦👧 Both'}</option>
              </select>
            </div>
          </div>

          {/* Age Ranges — dynamic */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-muted-foreground">{isRtl ? 'الفترات العمرية*' : 'Age Ranges*'}</label>
              <button
                type="button"
                onClick={() => append({ minVal: '', minUnit: 'سنة', maxVal: '', maxUnit: 'سنة' } as any)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/15 text-primary text-xs font-medium hover:bg-primary/25 transition-colors border border-primary/30"
              >
                <Plus className="w-3.5 h-3.5" />
                {isRtl ? 'أضف فترة' : 'Add range'}
              </button>
            </div>
            <div className="space-y-2">
              {fields.map((field, index) => (
                <div key={field.id} className="flex items-center gap-1.5" dir="rtl">
                  {/* Min number */}
                  <input
                    type="number"
                    min={0}
                    step={1}
                    placeholder="من"
                    {...register(`ageRanges.${index}.minVal` as any, { required: true })}
                    className="w-16 h-11 px-2 rounded-xl border border-white/10 bg-black/20 text-sm text-foreground text-center focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground/50"
                  />
                  {/* Min unit */}
                  <select
                    {...register(`ageRanges.${index}.minUnit` as any)}
                    className="h-11 px-2 rounded-xl border border-white/10 bg-black/20 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="سنة">سنة</option>
                    <option value="شهر">شهر</option>
                  </select>
                  <span className="text-muted-foreground text-sm font-bold px-1">—</span>
                  {/* Max number */}
                  <input
                    type="number"
                    min={0}
                    step={1}
                    placeholder="إلى"
                    {...register(`ageRanges.${index}.maxVal` as any, { required: true })}
                    className="w-16 h-11 px-2 rounded-xl border border-white/10 bg-black/20 text-sm text-foreground text-center focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground/50"
                  />
                  {/* Max unit */}
                  <select
                    {...register(`ageRanges.${index}.maxUnit` as any)}
                    className="h-11 px-2 rounded-xl border border-white/10 bg-black/20 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="سنة">سنة</option>
                    <option value="شهر">شهر</option>
                  </select>
                  {fields.length > 1 && (
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      className="p-2 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors flex-shrink-0"
                    >
                      <MinusCircle className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Price + Stock */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">{isRtl ? 'السعر الأصلي (د.ع)*' : 'Price (د.ع)*'}</label>
              <input
                type="number"
                step="500"
                min={0}
                placeholder={isRtl ? 'مثال: 15000' : 'e.g. 15000'}
                {...register('price', { required: true })}
                className="w-full h-11 px-4 rounded-xl border border-white/10 bg-black/20 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground/50"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">{isRtl ? 'عدد القطع*' : 'Stock (pcs)*'}</label>
              <input
                type="number"
                min={0}
                placeholder={isRtl ? 'مثال: 10' : 'e.g. 10'}
                {...register('stock', { required: true })}
                className="w-full h-11 px-4 rounded-xl border border-white/10 bg-black/20 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground/50"
              />
            </div>
          </div>

          {/* Discount Section */}
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-rose-400 flex items-center gap-2">
                🏷️ {isRtl ? 'تفعيل العرض / التخفيض' : 'Enable Sale / Discount'}
              </label>
              <input
                type="checkbox"
                {...register('isOnSale')}
                className="w-5 h-5 rounded accent-rose-500 cursor-pointer"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">{isRtl ? 'سعر التخفيض (د.ع)' : 'Discount Price (د.ع)'}</label>
              <input
                type="number"
                step="500"
                min={0}
                placeholder={isRtl ? 'السعر الجديد بعد التخفيض' : 'New discounted price'}
                {...register('discountPrice')}
                className="w-full h-11 px-4 rounded-xl border border-white/10 bg-black/20 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-rose-500 placeholder:text-muted-foreground/50"
              />
              <p className="text-[11px] text-muted-foreground px-1">
                {isRtl
                  ? 'يظهر شارة "خصم" على البطاقة فقط عند تفعيل العرض'
                  : 'Sale badge shows on card only when sale is enabled'}
              </p>
            </div>
          </div>

          {/* Colors */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">
              {isRtl ? '🎨 ألوان القطعة (للبوت)' : '🎨 Product Colors (for AI bot)'}
            </label>
            <input
              {...register('colors')}
              dir="rtl"
              placeholder={isRtl ? 'مثال: أحمر، أبيض، أزرق فاتح' : 'e.g. أحمر، أبيض، أزرق فاتح'}
              className="w-full h-11 px-4 rounded-xl border border-white/10 bg-black/20 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground/50"
            />
            <p className="text-[11px] text-muted-foreground px-1">
              {isRtl
                ? 'اكتب ألوان القطعة بالفاصلة — يساعد البوت على تمييز الصور بدقة'
                : 'Enter colors separated by commas — helps AI bot accurately compare images'}
            </p>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">{isRtl ? 'وصف إضافي (اختياري)' : 'Description (optional)'}</label>
            <textarea
              {...register('descriptionAr')}
              dir="rtl"
              rows={2}
              placeholder={isRtl ? 'وصف مختصر للمنتج...' : 'Short description...'}
              className="w-full px-4 py-3 rounded-xl border border-white/10 bg-black/20 text-sm text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground/50"
            />
          </div>

          {/* Public Image URL */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              {isRtl ? 'رابط الصورة للإرسال' : 'Public Image URL'}
              {imageUploaded && (
                <span className="flex items-center gap-1 text-xs text-emerald-400">
                  <CheckCircle2 className="w-3 h-3" />
                  {isRtl ? 'تم الرفع' : 'Uploaded'}
                </span>
              )}
              {imagePreview && !imageUploaded && (
                <span className="text-xs text-amber-400/80">
                  {isRtl ? '(يُرفع عند الحفظ)' : '(uploads on save)'}
                </span>
              )}
            </label>
            <div className="relative">
              <input
                type="url"
                dir="ltr"
                {...register('publicImageUrl')}
                placeholder={isRtl ? 'يتم ملؤه تلقائياً عند الحفظ...' : 'Auto-filled on save...'}
                className="w-full h-11 px-4 rounded-xl border border-white/10 bg-black/20 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground/40 font-mono"
              />
            </div>
            <p className="text-xs text-muted-foreground/60">
              {isRtl
                ? 'يُملأ تلقائياً عند الحفظ — أو يمكنك لصق رابط خارجي يدوياً'
                : 'Auto-filled on save — or paste an external URL manually'}
            </p>
          </div>

          {/* Available toggle */}
          <div className="flex items-center justify-between p-4 rounded-xl border border-white/10 bg-white/3">
            <div>
              <p className="text-sm font-semibold text-foreground">{isRtl ? 'ظهور في المتجر' : 'Show in Store'}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isRtl ? 'فعّل لكي يظهر المنتج للزبائن' : 'Enable to display to customers'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setValue('available', !watch('available'))}
              className={`relative w-12 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${
                watch('available') ? 'bg-emerald-500' : 'bg-white/15'
              }`}
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${
                watch('available') ? 'translate-x-6' : 'translate-x-0.5'
              }`} />
            </button>
          </div>

          {/* Upload error */}
          {uploadError && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/25">
              <span className="text-red-400 text-sm mt-0.5">⚠</span>
              <p className="text-xs text-red-400 leading-relaxed" dir="rtl">{uploadError}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-11 rounded-xl border border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors text-sm font-medium"
            >
              {isRtl ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
            >
              {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {item ? (isRtl ? 'حفظ التعديلات' : 'Save Changes') : (isRtl ? 'حفظ المنتج' : 'Save Product')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
