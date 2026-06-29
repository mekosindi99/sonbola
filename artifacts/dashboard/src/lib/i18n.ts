import { useAppStore } from './store';

const dictionary = {
  // Navigation
  dashboard: { en: 'Dashboard', ar: 'لوحة القيادة' },
  conversations: { en: 'Conversations', ar: 'المحادثات' },
  inventory: { en: 'Inventory', ar: 'المخزون' },
  bookings: { en: 'Bookings', ar: 'الحجوزات' },
  settings: { en: 'Settings', ar: 'الإعدادات' },
  
  // Dashboard
  totalConversations: { en: 'Total Conversations', ar: 'إجمالي المحادثات' },
  activeBookings: { en: 'Active Bookings', ar: 'الحجوزات النشطة' },
  completedBookings: { en: 'Completed Bookings', ar: 'الحجوزات المكتملة' },
  escalatedChats: { en: 'Escalated Chats', ar: 'محادثات مصعدة' },
  botStatus: { en: 'Bot Status', ar: 'حالة البوت' },
  active: { en: 'Active', ar: 'نشط' },
  inactive: { en: 'Inactive', ar: 'غير نشط' },
  turnOn: { en: 'Start Bot', ar: 'شغّل البوت' },
  turnOff: { en: 'Stop Bot', ar: 'أوقف البوت' },
  systemMemory: { en: 'System Memory Usage', ar: 'استخدام ذاكرة النظام' },
  
  // Inventory
  addProduct: { en: 'Add Product', ar: 'إضافة منتج' },
  search: { en: 'Search...', ar: 'بحث...' },
  productName: { en: 'Product Name', ar: 'اسم المنتج' },
  category: { en: 'Category', ar: 'الفئة' },
  price: { en: 'Price', ar: 'السعر' },
  stock: { en: 'Stock', ar: 'المخزون' },
  status: { en: 'Status', ar: 'الحالة' },
  actions: { en: 'Actions', ar: 'إجراءات' },
  save: { en: 'Save', ar: 'حفظ' },
  cancel: { en: 'Cancel', ar: 'إلغاء' },
  ageRange: { en: 'Age Range', ar: 'الفئة العمرية' },
  available: { en: 'Available', ar: 'متاح' },
  outOfStock: { en: 'Out of Stock', ar: 'نفد من المخزون' },
  
  // Categories
  Summer: { en: 'Summer', ar: 'صيف' },
  Winter: { en: 'Winter', ar: 'شتاء' },
  Spring: { en: 'Spring', ar: 'ربيع' },
  Girls: { en: 'Girls', ar: 'بنات' },
  Boys: { en: 'Boys', ar: 'أولاد' },
  
  // Bookings
  sender: { en: 'Customer', ar: 'العميل' },
  phone: { en: 'Phone', ar: 'رقم الهاتف' },
  address: { en: 'Address', ar: 'العنوان' },
  items: { en: 'Items', ar: 'العناصر' },
  starred: { en: 'Starred', ar: 'مميز' },
  pending: { en: 'Pending', ar: 'قيد الانتظار' },
  confirmed: { en: 'Confirmed', ar: 'مؤكد' },
  completed: { en: 'Completed', ar: 'مكتمل' },
  cancelled: { en: 'Cancelled', ar: 'ملغى' },
  
  // Saved Replies
  savedReplies: { en: 'General Bot', ar: 'البوت العام' },
  bookingBot: { en: 'Bot Instructions', ar: 'تعليمات البوت' },
  botTest: { en: 'Bot Test', ar: 'اختبار البوت' },
  addReply: { en: 'Add Reply', ar: 'إضافة رد' },
  editReply: { en: 'Edit Reply', ar: 'تعديل الرد' },
  titleAr: { en: 'Title (Arabic)', ar: 'العنوان (عربي)' },
  titleEn: { en: 'Title (English)', ar: 'العنوان (إنجليزي)' },
  triggerKeywords: { en: 'Trigger Keywords', ar: 'الكلمات المفتاحية' },
  triggerKeywordsHint: { en: 'Comma-separated: price, سعر, كم', ar: 'مفصولة بفاصلة: سعر, price, كم' },
  replyAr: { en: 'Reply in Arabic', ar: 'الرد بالعربية' },
  replyEn: { en: 'Reply in English', ar: 'الرد بالإنجليزية' },
  replyCategory: { en: 'Category', ar: 'التصنيف' },
  noSavedReplies: { en: 'No saved replies yet', ar: 'لا توجد ردود محفوظة بعد' },
  keywordMatch: { en: 'Keyword match', ar: 'تطابق الكلمة المفتاحية' },
  aiInferred: { en: 'AI inferred', ar: 'استنتاج ذكي' },
  deleteConfirm: { en: 'Delete this reply?', ar: 'حذف هذا الرد؟' },

  // Settings
  botConfiguration: { en: 'Bot Configuration', ar: 'إعدادات البوت' },
  masterToggle: { en: 'Master Auto-Reply Toggle', ar: 'المفتاح الرئيسي للرد الآلي' },
  scheduler: { en: 'Smart Scheduling', ar: 'الجدولة الذكية' },
  activeHours: { en: 'Active Hours', ar: 'ساعات العمل' },
  ageFilter: { en: 'Age Filtering', ar: 'تصفية حسب العمر' },
  customAgeFilter: { en: 'Custom Age Range (Optional)', ar: 'نطاق عمري مخصص (اختياري)' },
  metaIntegration: { en: 'Meta API Integration', ar: 'تكامل واجهة برمجة تطبيقات Meta' },
  pageId: { en: 'Facebook Page ID', ar: 'معرف صفحة فيسبوك' },
  igAccountId: { en: 'Instagram Account ID', ar: 'معرف حساب إنستغرام' },
  accessToken: { en: 'Access Token', ar: 'رمز الوصول' },
  escalationConfig: { en: 'Support Escalation', ar: 'إعدادات التصعيد' },
  whatsappAdmin: { en: 'WhatsApp Admin Number', ar: 'رقم واتساب للمسؤول' },
};

export type TranslationKey = keyof typeof dictionary;

export function useTranslation() {
  const language = useAppStore((state) => state.language);
  const isRtl = language === 'ar';
  
  const t = (key: TranslationKey | string) => {
    if (key in dictionary) {
      return dictionary[key as TranslationKey][language];
    }
    return key;
  };
  
  return { t, language, isRtl };
}
