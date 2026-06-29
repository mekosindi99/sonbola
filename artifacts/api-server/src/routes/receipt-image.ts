import { Router } from 'express';
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '@workspace/db';
import { bookingsTable } from '@workspace/db/schema';
import { eq } from 'drizzle-orm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT_PATH = path.resolve(__dirname, '../assets/NotoSansArabic.ttf');

try { GlobalFonts.registerFromPath(FONT_PATH, 'NotoAr'); } catch {}

export const receiptImageRouter = Router();

const W = 600;
const PAD = 30;
const LINE_H = 36;
const BRAND_PINK = '#e91e8c';
const LIGHT_PINK = '#fff0f7';
const GRAY = '#555';
const DARK = '#1a1a1a';

const ORDINALS_AR = ['اول', 'ثاني', 'ثالث', 'رابع', 'خامس', 'سادس', 'سابع', 'ثامن', 'تاسع', 'عاشر'];

function pieceLabel(i: number, total: number): string {
  return total > 1 ? `${ORDINALS_AR[i] ?? String(i + 1)} قطعة` : '';
}

function fmtK(n: number): string {
  return `${Math.round(n / 1000)} الف`;
}

async function loadItemImage(url: string): Promise<any | null> {
  try {
    if (!url || !url.startsWith('http')) return null;
    const img = await loadImage(url);
    return img;
  } catch {
    return null;
  }
}

async function drawReceiptImage(booking: any, cancelled = false, added = false): Promise<Buffer> {
  let items: Array<{ name: string; quantity: number; totalPrice: number; imageUrl?: string }> = [];
  try {
    items = Array.isArray(booking.items) ? booking.items : JSON.parse(booking.items || '[]');
  } catch { items = []; }

  const deliveryCost = parseInt(booking.deliveryCost || '0', 10) || 0;
  const productsTotal = items.reduce((s, it) => s + (it.totalPrice ?? 0), 0);
  const grandTotal = productsTotal + deliveryCost;
  const orderNum = (booking.id || 0) + 873;

  // Load all product images in parallel
  const images = await Promise.all(
    items.map(it => it.imageUrl ? loadItemImage(it.imageUrl) : Promise.resolve(null))
  );
  const hasImages = images.some(img => img !== null);

  // Image grid: up to 3 per row, multiple rows for more items
  const COLS = 3;
  const ROW_H = 150; // height per image row (px) including label
  const IMG_CELL_H = ROW_H - 20; // image area within each cell
  const IMG_STRIP_Y = 104;

  const totalItems = items.length;
  const validImgs = images.map((img, i) => ({ img, item: items[i], origIdx: i })).filter(x => x.img);
  const imgRows = hasImages ? Math.ceil(validImgs.length / COLS) : 0;
  const IMG_STRIP_H = hasImages ? imgRows * ROW_H + 10 : 0;

  const addrLines = [
    booking.governorate,
    booking.fullAddress,
    booking.landmark ? `📌 ${booking.landmark}` : null,
    booking.phoneNumber ? `📱 ${booking.phoneNumber}` : null,
  ].filter(Boolean).length;

  const bodyLines = totalItems + (deliveryCost > 0 ? 1 : 0) + 1 /* total row */ + 1 /* section header */ + addrLines + 1 /* section header */;
  const H = 104 + IMG_STRIP_H + (hasImages ? 16 : 0) + 40 + bodyLines * LINE_H + addrLines * 4 /* extra padding per addr line */ + 70;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);

  // Header banner
  ctx.fillStyle = BRAND_PINK;
  ctx.fillRect(0, 0, W, 70);

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 30px NotoAr';
  ctx.textAlign = 'right';
  ctx.direction = 'rtl';
  ctx.fillText('🌸 sonbola.baby', W - PAD, 46);

  ctx.textAlign = 'left';
  ctx.font = '17px NotoAr';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillText(`طلب #${orderNum}`, PAD, 46);

  // Sub-header
  ctx.fillStyle = LIGHT_PINK;
  ctx.fillRect(0, 70, W, 34);
  ctx.fillStyle = BRAND_PINK;
  ctx.font = '15px NotoAr';
  ctx.textAlign = 'right';
  ctx.fillText('ملابس أطفال', W - PAD, 93);

  // ── Product image grid (all images, 3 per row) ────────────────────────────
  if (hasImages) {
    for (let vi = 0; vi < validImgs.length; vi++) {
      const { img, origIdx } = validImgs[vi];
      const row = Math.floor(vi / COLS);
      const col = vi % COLS;

      // For each row determine how many images it has (for centering last row)
      const rowStart = row * COLS;
      const rowCount = Math.min(COLS, validImgs.length - rowStart);
      const CELL_W = Math.floor((W - PAD * 2 - (rowCount - 1) * 10) / rowCount);

      const cellX = PAD + col * (CELL_W + 10);
      const cellY = IMG_STRIP_Y + row * ROW_H;

      const ratio = Math.min(CELL_W / img.width, IMG_CELL_H / img.height);
      const dw = Math.round(img.width * ratio);
      const dh = Math.round(img.height * ratio);
      const dx = cellX + Math.floor((CELL_W - dw) / 2);
      const dy = cellY + Math.floor((IMG_CELL_H - dh) / 2);

      // Rounded clip
      ctx.save();
      ctx.beginPath();
      const r = 8;
      ctx.moveTo(dx + r, dy);
      ctx.lineTo(dx + dw - r, dy);
      ctx.quadraticCurveTo(dx + dw, dy, dx + dw, dy + r);
      ctx.lineTo(dx + dw, dy + dh - r);
      ctx.quadraticCurveTo(dx + dw, dy + dh, dx + dw - r, dy + dh);
      ctx.lineTo(dx + r, dy + dh);
      ctx.quadraticCurveTo(dx, dy + dh, dx, dy + dh - r);
      ctx.lineTo(dx, dy + r);
      ctx.quadraticCurveTo(dx, dy, dx + r, dy);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(img, dx, dy, dw, dh);
      ctx.restore();

      // Piece label under image
      if (totalItems > 1) {
        ctx.fillStyle = GRAY;
        ctx.font = '12px NotoAr';
        ctx.textAlign = 'center';
        ctx.fillText(pieceLabel(origIdx, totalItems), cellX + CELL_W / 2, cellY + ROW_H - 4);
      }
    }
  }

  let y = IMG_STRIP_Y + IMG_STRIP_H + (hasImages ? 16 : 14);

  // Products section header
  ctx.fillStyle = DARK;
  ctx.font = 'bold 17px NotoAr';
  ctx.textAlign = 'right';
  ctx.fillText('📦 تفاصيل الطلبية', W - PAD, y);
  y += 6;
  ctx.strokeStyle = '#f0c0d8';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke();
  y += LINE_H - 8;

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const lbl = pieceLabel(i, totalItems);
    const right = lbl ? `${fmtK(it.totalPrice ?? 0)} — ${lbl}` : fmtK(it.totalPrice ?? 0);
    ctx.fillStyle = DARK;
    ctx.font = '19px NotoAr';
    ctx.textAlign = 'right';
    ctx.fillText(right, W - PAD, y);
    ctx.fillStyle = GRAY;
    ctx.font = '15px NotoAr';
    ctx.textAlign = 'left';
    ctx.fillText(String(it.name ?? '').slice(0, 30), PAD, y);
    y += LINE_H;
  }

  if (deliveryCost > 0) {
    ctx.fillStyle = GRAY;
    ctx.font = '18px NotoAr';
    ctx.textAlign = 'right';
    ctx.fillText(`${fmtK(deliveryCost)} توصيل`, W - PAD, y);
    y += LINE_H;
  }

  // Total bar
  ctx.fillStyle = BRAND_PINK;
  ctx.fillRect(PAD, y - 26, W - PAD * 2, 34);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 19px NotoAr';
  ctx.textAlign = 'right';
  ctx.fillText(`مجموع ${fmtK(grandTotal)}`, W - PAD - 8, y - 4);
  y += LINE_H + 6;

  // Divider
  ctx.strokeStyle = '#f0c0d8';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke();
  y += 10;

  // Address section
  ctx.fillStyle = DARK;
  ctx.font = 'bold 20px NotoAr';
  ctx.textAlign = 'right';
  ctx.fillText('📍 معلومات التوصيل', W - PAD, y);
  y += LINE_H;

  const addrItems = [
    booking.governorate,
    booking.fullAddress,
    booking.landmark ? `📌 ${String(booking.landmark).slice(0, 38)}` : null,
    booking.phoneNumber ? `📱 ${booking.phoneNumber}` : null,
  ].filter(Boolean) as string[];

  for (const line of addrItems) {
    ctx.fillStyle = GRAY;
    ctx.font = '20px NotoAr';
    ctx.textAlign = 'right';
    ctx.fillText(line.slice(0, 42), W - PAD, y);
    y += LINE_H + 4;
  }

  // Footer
  y += 6;
  ctx.fillStyle = BRAND_PINK;
  ctx.fillRect(0, y, W, 3);
  ctx.fillStyle = '#aaa';
  ctx.font = '13px NotoAr';
  ctx.textAlign = 'center';
  ctx.fillText('sonbola.baby — ملابس أطفال 🌸', W / 2, y + 22);

  // ── Cancelled overlay (red diagonal "لغو") ──────────────────────────────
  if (cancelled) {
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#cc0000';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-Math.PI / 5);
    ctx.font = 'bold 110px NotoAr';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 8;
    ctx.strokeStyle = '#880000';
    ctx.lineWidth = 6;
    ctx.strokeText('لغو', 0, 0);
    ctx.fillStyle = '#cc0000';
    ctx.fillText('لغو', 0, 0);
    ctx.restore();

    ctx.restore();
  }

  // ── Added overlay (green diagonal "إضافة") ──────────────────────────────
  if (added) {
    ctx.save();
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = '#007a00';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-Math.PI / 5);
    ctx.font = 'bold 90px NotoAr';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 8;
    ctx.strokeStyle = '#004d00';
    ctx.lineWidth = 5;
    ctx.strokeText('إضافة', 0, 0);
    ctx.fillStyle = '#007a00';
    ctx.fillText('إضافة', 0, 0);
    ctx.restore();

    ctx.restore();
  }

  return canvas.toBuffer('image/png') as unknown as Buffer;
}

// GET /api/public/receipt/demo/image — generate a sample receipt with demo data
receiptImageRouter.get('/demo/image', async (req, res) => {
  try {
    const cancelled = req.query.cancelled === '1';
    const added = req.query.added === '1';
    const demoBooking = {
      id: 127,
      receiptToken: 'demo',
      platform: 'facebook',
      phoneNumber: '07503981573',
      governorate: 'بغداد',
      fullAddress: 'بغداد — حي العباسية يك جامع الكبير',
      deliveryCost: '3000',
      totalAmount: '53000',
      status: 'pending',
      items: JSON.stringify([
        {
          code: 'S317',
          name: 'فستان سونبولة',
          quantity: 1,
          unitPrice: 25000,
          totalPrice: 25000,
          size: '1–2 سنة',
          imageUrl: 'https://sonbola.shop/api/public/products/S317/image',
        },
        {
          code: 'S388',
          name: 'بدلة الربيع',
          quantity: 1,
          unitPrice: 25000,
          totalPrice: 25000,
          size: '3–4 سنة',
          imageUrl: 'https://sonbola.shop/api/public/products/S388/image',
        },
      ]),
    };
    const buf = await drawReceiptImage(demoBooking, cancelled, added);
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-cache');
    res.send(buf);
  } catch (err: any) {
    console.error('[RECEIPT_IMAGE_DEMO]', err?.message);
    res.status(500).json({ error: 'demo image generation failed' });
  }
});

// GET /api/public/receipt/:token/image?cancelled=1
receiptImageRouter.get('/:token/image', async (req, res) => {
  try {
    const { token } = req.params;
    const cancelled = req.query.cancelled === '1';
    const added = req.query.added === '1';

    const [booking] = await db
      .select()
      .from(bookingsTable)
      .where(eq(bookingsTable.receiptToken, token))
      .limit(1);

    if (!booking) return res.status(404).json({ error: 'not found' });

    const buf = await drawReceiptImage(booking, cancelled, added);
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', (cancelled || added) ? 'no-cache' : 'public, max-age=3600');
    res.send(buf);
  } catch (err: any) {
    console.error('[RECEIPT_IMAGE]', err?.message);
    res.status(500).json({ error: 'image generation failed' });
  }
});
