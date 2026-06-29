const PRODUCTS = [
  {
    name: "S393",
    subtitle: "Spring · 25,000 د.ع",
    img: "https://sonbola.shop/api/storage/objects/uploads/80a8fba8-b2d2-4777-bc22-625382f31105",
  },
  {
    name: "S395",
    subtitle: "Summer · 20,000 د.ع",
    img: "https://sonbola.shop/api/storage/objects/uploads/b6695af5-4c88-49c9-899d-a2780a3b1234",
  },
  {
    name: "S386",
    subtitle: "Fall · 22,000 د.ع",
    img: "https://sonbola.shop/api/storage/objects/uploads/7b531f5b-46be-448d-ad65-699aff9ab123",
  },
];

function Card({ name, subtitle, img }: { name: string; subtitle: string; img: string }) {
  return (
    <div
      className="flex-shrink-0 rounded-2xl overflow-hidden shadow-md bg-white"
      style={{ width: 220, fontFamily: "'Segoe UI', sans-serif" }}
    >
      {/* Square image 1:1 */}
      <div className="relative" style={{ width: 220, height: 220, background: "#f0f0f0" }}>
        <img
          src={img}
          alt={name}
          className="absolute inset-0 w-full h-full"
          style={{ objectFit: "cover" }}
          onError={e => {
            (e.currentTarget as HTMLImageElement).src =
              "https://placehold.co/220x220/f3f4f6/9ca3af?text=" + encodeURIComponent(name);
          }}
        />
      </div>

      {/* Card body */}
      <div className="px-3 pt-2 pb-1">
        <div className="font-bold text-base text-gray-900">{name}</div>
        <div className="text-sm text-gray-500 mt-0.5">{subtitle}</div>
      </div>

      {/* Divider */}
      <div className="mx-3 border-t border-gray-100 mt-2" />

      {/* Book button */}
      <button
        className="w-full text-center py-2.5 text-sm font-semibold text-blue-600 hover:bg-blue-50 transition-colors"
      >
        🛒 احجزيه
      </button>
    </div>
  );
}

export function CarouselPreview() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ background: "#e5ddd5", fontFamily: "'Segoe UI', sans-serif" }}
    >
      {/* Messenger bubble header */}
      <div className="w-full max-w-lg mb-2">
        <div className="flex items-center gap-2 mb-1 px-1">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center text-white text-xs font-bold shadow">S</div>
          <span className="text-xs text-gray-500 font-medium">SONBOLA</span>
        </div>

        {/* Carousel cards scroll */}
        <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
          {PRODUCTS.map(p => (
            <Card key={p.name} {...p} />
          ))}
          {/* Show edge of 4th card to indicate scrollability */}
          <div
            className="flex-shrink-0 rounded-2xl overflow-hidden shadow-md bg-white opacity-60"
            style={{ width: 60, height: 284 }}
          >
            <div style={{ width: 60, height: 220, background: "#e5e7eb" }} />
          </div>
        </div>

        {/* Timestamp */}
        <div className="text-center text-xs text-gray-400 mt-1">الآن</div>
      </div>

      <p className="text-xs text-gray-400 mt-4 text-center max-w-xs">
        الصور تظهر مربعة 1:1 · يمكن التمرير يميناً لرؤية باقي المنتجات
      </p>
    </div>
  );
}
