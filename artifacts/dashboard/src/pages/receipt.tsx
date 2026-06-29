import { useEffect, useState } from "react";
import { useRoute } from "wouter";

interface BookingItem {
  code?: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  imageUrl?: string;
  ageLabel?: string;
  size?: string;
}

interface ReceiptData {
  booking: {
    id: number;
    senderName?: string;
    phoneNumber: string;
    governorate: string;
    fullAddress: string;
    items: BookingItem[];
    totalAmount: number | null;
    deliveryCost: number | null;
    notes?: string;
    createdAt: string;
  };
  store: {
    name: string;
    code: string;
  };
  orderNumber: number;
  platformLabel: string;
  platformIcon: string;
}

export default function ReceiptPage() {
  const [, params] = useRoute("/receipt/:token");
  const token = params?.token;

  const [data, setData] = useState<ReceiptData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/public/receipt/${token}`)
      .then(r => {
        if (!r.ok) throw new Error("not found");
        return r.json();
      })
      .then(setData)
      .catch(() => setError("الإيصال غير موجود أو انتهت صلاحيته"))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#fdf6f0" }}>
        <div style={{ textAlign: "center", color: "#c9816a" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🧾</div>
          <p style={{ fontFamily: "sans-serif" }}>جاري تحميل الإيصال...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#fdf6f0" }}>
        <div style={{ textAlign: "center", color: "#c9816a" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>❌</div>
          <p style={{ fontFamily: "sans-serif" }}>{error || "خطأ غير متوقع"}</p>
        </div>
      </div>
    );
  }

  const { booking, store, orderNumber, platformLabel, platformIcon } = data;
  const items: BookingItem[] = Array.isArray(booking.items) ? booking.items : [];
  const subtotal = items.reduce((s, i) => s + (i.totalPrice || i.unitPrice * i.quantity || 0), 0);
  const deliveryCost = booking.deliveryCost ?? 0;
  const grandTotal = subtotal + deliveryCost;

  // Extract age note from notes field
  const ageNotes: string[] = [];
  if (booking.notes) {
    const lines = booking.notes.split("\n");
    for (const line of lines) {
      if (line.includes("عمر") || line.includes("سنة") || line.includes("شهر")) {
        ageNotes.push(line.trim());
      }
    }
  }
  // Also check per-item age labels
  items.forEach((item, i) => {
    if (item.ageLabel) {
      ageNotes.push(`قطعة ${i + 1}: ${item.ageLabel}`);
    }
  });

  const fmtK = (n: number) => `${Math.round(n / 1000)} ألف`;

  return (
    <div dir="rtl" style={{ minHeight: "100vh", background: "#fdf6f0", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "20px 12px 60px", fontFamily: "'Segoe UI', Tahoma, sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 480, background: "#fff", borderRadius: 16, boxShadow: "0 4px 24px rgba(0,0,0,0.10)", overflow: "hidden" }}>

        {/* Header */}
        <div style={{ background: "linear-gradient(135deg, #b5451b 0%, #d4622a 100%)", padding: "24px 24px 18px", textAlign: "center", color: "#fff" }}>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "0.5px", marginBottom: 2 }}>
            {store.name}
          </div>
          <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 10 }}>
            كود المتجر: <strong>{store.code}</strong>
          </div>
          <div style={{ width: 50, height: 1.5, background: "rgba(255,255,255,0.35)", margin: "0 auto 12px" }} />
          {/* Order number + platform badge */}
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(0,0,0,0.18)", borderRadius: 20, padding: "5px 14px" }}>
            <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: "0.5px" }}>#{orderNumber}</span>
            <span style={{ width: 1, height: 14, background: "rgba(255,255,255,0.4)", display: "inline-block" }} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>{platformIcon} {platformLabel}</span>
          </div>
        </div>

        {/* Customer info */}
        <div style={{ padding: "18px 20px 12px", borderBottom: "1px solid #f0e8e2" }}>
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 12px", fontSize: 14 }}>
            <span style={{ color: "#999", whiteSpace: "nowrap" }}>المستخدم:</span>
            <span style={{ color: "#333", fontWeight: 600 }}>{booking.senderName || "—"}</span>
            <span style={{ color: "#999", whiteSpace: "nowrap" }}>أرقام:</span>
            <span style={{ color: "#333", fontWeight: 600, direction: "ltr", textAlign: "right" }}>{booking.phoneNumber}</span>
            <span style={{ color: "#999", whiteSpace: "nowrap" }}>العنوان:</span>
            <span style={{ color: "#333", fontWeight: 600 }}>{booking.governorate} — {booking.fullAddress}</span>
          </div>
        </div>

        {/* Items cards */}
        <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map((item, idx) => (
            <div key={idx} style={{ display: "flex", gap: 12, background: "#fffaf7", borderRadius: 14, border: "1px solid #f0e0d0", overflow: "hidden" }}>
              {/* Product image */}
              <div style={{ flexShrink: 0 }}>
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    style={{ width: 110, height: 110, objectFit: "cover", display: "block" }}
                    onError={e => {
                      const el = e.target as HTMLImageElement;
                      el.style.display = "none";
                      (el.nextElementSibling as HTMLElement | null)?.style.setProperty("display", "flex");
                    }}
                  />
                ) : null}
                <div style={{
                  width: 110, height: 110, background: "#fdf0e8",
                  display: item.imageUrl ? "none" : "flex",
                  alignItems: "center", justifyContent: "center", fontSize: 36
                }}>🛍️</div>
              </div>

              {/* Product details */}
              <div style={{ flex: 1, padding: "12px 10px 12px 4px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontWeight: 700, color: "#333", fontSize: 14, lineHeight: 1.4 }}>{item.name}</div>
                  {item.code && <div style={{ fontSize: 11, color: "#b5451b", marginTop: 2, opacity: 0.7 }}>{item.code}</div>}
                  {item.size && <div style={{ fontSize: 12, color: "#888", marginTop: 3 }}>📏 مقاس: {item.size}</div>}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                  <div style={{ fontSize: 12, color: "#999" }}>
                    {fmtK(item.unitPrice)} × <strong style={{ color: "#555" }}>{item.quantity}</strong>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 17, color: "#b5451b" }}>
                    {fmtK(item.totalPrice || item.unitPrice * item.quantity)}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Delivery card */}
          {deliveryCost > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fdf6f0", borderRadius: 12, border: "1px dashed #f0c8a8", padding: "10px 14px" }}>
              <div style={{ fontSize: 13, color: "#888" }}>🚚 توصيل — {booking.governorate}</div>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#b5451b" }}>{fmtK(deliveryCost)}</div>
            </div>
          )}
        </div>

        {/* Grand total */}
        <div style={{ padding: "14px 20px", background: "#fdf0e8", display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "2px solid #f0d5c5" }}>
          <span style={{ fontWeight: 700, fontSize: 16, color: "#555" }}>المجموع</span>
          <span style={{ fontWeight: 800, fontSize: 22, color: "#b5451b" }}>{fmtK(grandTotal)} <span style={{ fontSize: 14, fontWeight: 600 }}>الف</span></span>
        </div>

        {/* Age note */}
        {ageNotes.length > 0 && (
          <div style={{ margin: "16px 16px 0", padding: "14px 16px", background: "#fff8f0", border: "1.5px solid #f5c9a8", borderRadius: 12 }}>
            <div style={{ fontWeight: 700, color: "#c96a2a", marginBottom: 6, fontSize: 13 }}>
              ⚠️ ملاحظة العمر (مهمة جداً):
            </div>
            {ageNotes.map((note, i) => (
              <div key={i} style={{ color: "#c96a2a", fontWeight: 700, fontSize: 14 }}>{note}</div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={{ padding: "20px 20px 24px", textAlign: "center", color: "#ccc", fontSize: 11 }}>
          {new Date(booking.createdAt).toLocaleString("ar-IQ")}
          <br />
          <span style={{ color: "#e0c0b0" }}>🌸 شكراً لثقتك بنا 🌸</span>
        </div>
      </div>
    </div>
  );
}
