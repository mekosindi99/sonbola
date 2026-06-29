export default function MainMenuPreview() {
  const cards = [
    {
      emoji: '🛍️',
      title: 'استفسار عن الأسعار',
      subtitle: 'تصفحي مجموعتنا وأسعارنا',
      btn: '🛍️ تصفح المنتجات',
      color: '#e8f4fd',
      border: '#4a90d9',
    },
    {
      emoji: '🔄',
      title: 'تبديل',
      subtitle: 'تبديل منتج حصلتِ عليه',
      btn: '🔄 طلب تبديل',
      color: '#fff8e1',
      border: '#f9a825',
    },
    {
      emoji: '↩️',
      title: 'ترجيع',
      subtitle: 'إرجاع منتج حصلتِ عليه',
      btn: '↩️ طلب ترجيع',
      color: '#fce4ec',
      border: '#e53935',
    },
    {
      emoji: '🚚',
      title: 'توصيل',
      subtitle: 'أسعار التوصيل للمحافظات',
      btn: '🚚 أسعار التوصيل',
      color: '#e8f5e9',
      border: '#43a047',
    },
  ];

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1877f2 0%, #0d47a1 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Segoe UI', Arial, sans-serif",
      padding: '20px',
    }}>
      <div style={{ width: '100%', maxWidth: 460 }}>
        {/* Phone frame */}
        <div style={{
          background: '#f0f2f5',
          borderRadius: 18,
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        }}>
          {/* Messenger top bar */}
          <div style={{
            background: 'linear-gradient(90deg, #1877f2, #42a5f5)',
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: '50%',
              background: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, fontWeight: 'bold', color: '#1877f2',
            }}>س</div>
            <div>
              <div style={{ color: 'white', fontWeight: 700, fontSize: 15 }}>سونبولة</div>
              <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11 }}>متجر ملابس أطفال 🌸</div>
            </div>
          </div>

          {/* Chat area */}
          <div style={{ padding: '16px 12px', background: '#f0f2f5' }}>
            {/* Bot greeting bubble */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 4, alignItems: 'flex-end' }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: 'linear-gradient(135deg, #1877f2, #42a5f5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, color: 'white', fontWeight: 'bold', flexShrink: 0,
              }}>س</div>
              <div style={{
                background: 'white',
                borderRadius: '18px 18px 18px 4px',
                padding: '10px 14px',
                maxWidth: 260,
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              }}>
                <p style={{ margin: 0, fontSize: 14, color: '#1c1e21', lineHeight: 1.6, direction: 'rtl' }}>
                  أهلا وسهلا بيكم بالصفحة 🌸<br />
                  <span style={{ fontWeight: 600 }}>سونبولة — ملابس أطفال راقية</span>
                </p>
              </div>
            </div>

            {/* Bot prompt bubble */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'flex-end' }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: 'linear-gradient(135deg, #1877f2, #42a5f5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, color: 'white', fontWeight: 'bold', flexShrink: 0,
              }}>س</div>
              <div style={{
                background: 'white',
                borderRadius: '18px 18px 18px 4px',
                padding: '10px 14px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              }}>
                <p style={{ margin: 0, fontSize: 14, color: '#1c1e21', direction: 'rtl' }}>
                  🌸 كيف يمكنني مساعدتج؟
                </p>
              </div>
            </div>

            {/* Carousel cards - horizontal scroll simulation */}
            <div style={{
              display: 'flex',
              gap: 10,
              overflowX: 'auto',
              paddingBottom: 6,
              paddingRight: 4,
              scrollbarWidth: 'none',
            }}>
              {cards.map((card, i) => (
                <div key={i} style={{
                  minWidth: 178,
                  background: 'white',
                  borderRadius: 12,
                  overflow: 'hidden',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                  border: `2px solid ${card.border}`,
                  flexShrink: 0,
                }}>
                  {/* Card color header */}
                  <div style={{
                    background: card.color,
                    height: 68,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 36,
                    borderBottom: `1px solid ${card.border}30`,
                  }}>
                    {card.emoji}
                  </div>
                  {/* Card content */}
                  <div style={{ padding: '10px 10px 0', direction: 'rtl' }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#1c1e21', marginBottom: 4 }}>
                      {card.title}
                    </div>
                    <div style={{ fontSize: 11, color: '#65676b', lineHeight: 1.4, marginBottom: 10 }}>
                      {card.subtitle}
                    </div>
                  </div>
                  {/* Button */}
                  <div style={{
                    margin: '0 8px 10px',
                    padding: '8px 6px',
                    borderRadius: 8,
                    background: card.color,
                    border: `1px solid ${card.border}`,
                    textAlign: 'center',
                    fontSize: 12,
                    fontWeight: 600,
                    color: card.border,
                    cursor: 'pointer',
                  }}>
                    {card.btn}
                  </div>
                </div>
              ))}
            </div>

            {/* Scroll hint */}
            <div style={{
              textAlign: 'center',
              fontSize: 11,
              color: '#8a8d91',
              marginTop: 8,
              letterSpacing: 1,
            }}>
              ← اسحبي للمزيد
            </div>
          </div>
        </div>

        {/* Label */}
        <div style={{
          textAlign: 'center',
          color: 'rgba(255,255,255,0.85)',
          fontSize: 13,
          marginTop: 14,
          letterSpacing: 0.3,
        }}>
          القائمة الرئيسية — ماسنجر Messenger
        </div>
      </div>
    </div>
  );
}
