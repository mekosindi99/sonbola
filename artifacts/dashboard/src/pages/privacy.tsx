export default function Privacy() {
  return (
    <div style={{ background: "#fff", minHeight: "100vh", position: "fixed", inset: 0, overflowY: "auto", zIndex: 9999 }}>
    <div dir="rtl" style={{ fontFamily: "Arial, sans-serif", maxWidth: 800, margin: "0 auto", padding: "40px 24px", color: "#222", lineHeight: 1.8 }}>
      <h1 style={{ fontSize: 28, fontWeight: "bold", marginBottom: 8 }}>سياسة الخصوصية</h1>
      <p style={{ color: "#666", marginBottom: 32 }}>آخر تحديث: أبريل 2026</p>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 20, fontWeight: "bold", marginBottom: 8 }}>عن المتجر</h2>
        <p>سنبلة (Sonbola.baby) متجر متخصص في ملابس الأطفال العراقية. نتواصل مع عملائنا عبر فيسبوك وإنستغرام والموقع الإلكتروني.</p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 20, fontWeight: "bold", marginBottom: 8 }}>البيانات التي نجمعها</h2>
        <ul style={{ paddingRight: 20 }}>
          <li>الاسم ورقم الهاتف عند إتمام طلب الشراء</li>
          <li>العنوان لأغراض التوصيل</li>
          <li>رسائل التواصل عبر الماسنجر وإنستغرام لخدمة العملاء</li>
        </ul>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 20, fontWeight: "bold", marginBottom: 8 }}>كيف نستخدم البيانات</h2>
        <ul style={{ paddingRight: 20 }}>
          <li>معالجة الطلبات والتوصيل</li>
          <li>التواصل مع العملاء بخصوص طلباتهم</li>
          <li>تحسين خدمة العملاء</li>
        </ul>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 20, fontWeight: "bold", marginBottom: 8 }}>مشاركة البيانات</h2>
        <p>لا نبيع أو نشارك بياناتكم الشخصية مع أطراف ثالثة إلا لأغراض التوصيل.</p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 20, fontWeight: "bold", marginBottom: 8 }}>التكامل مع فيسبوك وإنستغرام</h2>
        <p>نستخدم Messenger API من Meta لإدارة المحادثات تلقائياً. عند التواصل معنا عبر فيسبوك أو إنستغرام، تخضع بياناتك أيضاً لسياسة خصوصية Meta المتاحة على <a href="https://www.facebook.com/privacy/policy/" target="_blank" rel="noopener noreferrer">facebook.com</a>.</p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 20, fontWeight: "bold", marginBottom: 8 }}>حذف البيانات</h2>
        <p>يمكنكم طلب حذف بياناتكم في أي وقت عبر التواصل معنا على صفحة سنبلة في فيسبوك أو إنستغرام.</p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 20, fontWeight: "bold", marginBottom: 8 }}>التواصل معنا</h2>
        <p>لأي استفسار بخصوص الخصوصية، تواصلوا معنا عبر:</p>
        <ul style={{ paddingRight: 20 }}>
          <li>صفحة فيسبوك: Sonbola.baby</li>
          <li>الموقع: sonbola.shop</li>
        </ul>
      </section>

      <hr style={{ margin: "32px 0", border: "none", borderTop: "1px solid #eee" }} />
      <p style={{ color: "#888", fontSize: 14, textAlign: "center" }}>© 2026 سنبلة — جميع الحقوق محفوظة</p>
    </div>
    </div>
  );
}
