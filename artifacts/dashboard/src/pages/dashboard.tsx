import { useTranslation } from '@/lib/i18n';
import { useEffect, useState } from 'react';
import { PackageSearch, CalendarCheck, BookOpen, Settings2, ArrowLeft, ArrowRight } from 'lucide-react';
import { Link } from 'wouter';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

export default function Dashboard() {
  const { t, language, isRtl } = useTranslation();
  const [stats, setStats] = useState({ bookings: 0, products: 0, conversations: 0, replies: 0 });

  useEffect(() => {
    fetch(`${BASE}/api/bookings?limit=1`).then(r => r.json()).then(d => {
      setStats(prev => ({ ...prev, bookings: d?.total ?? d?.bookings?.length ?? 0 }));
    }).catch(() => {});
    fetch(`${BASE}/api/inventory`).then(r => r.json()).then(d => {
      setStats(prev => ({ ...prev, products: Array.isArray(d) ? d.length : d?.products?.length ?? 0 }));
    }).catch(() => {});
    fetch(`${BASE}/api/conversations?limit=1`).then(r => r.json()).then(d => {
      setStats(prev => ({ ...prev, conversations: d?.total ?? 0 }));
    }).catch(() => {});
  }, []);

  const ar = language === 'ar';

  const cards = [
    {
      href: '/beqolky/inventory',
      icon: PackageSearch,
      label: ar ? 'المخزن' : 'Inventory',
      sub: ar ? `${stats.products} منتج` : `${stats.products} products`,
      color: 'from-violet-500/20 border-violet-500/30',
      iconColor: 'text-violet-400',
    },
    {
      href: '/beqolky/bookings',
      icon: CalendarCheck,
      label: ar ? 'الحجوزات' : 'Bookings',
      sub: ar ? `${stats.bookings} حجز` : `${stats.bookings} orders`,
      color: 'from-emerald-500/20 border-emerald-500/30',
      iconColor: 'text-emerald-400',
    },
    {
      href: '/beqolky/bot-general-qa',
      icon: BookOpen,
      label: ar ? 'قاعدة المعرفة' : 'Knowledge Base',
      sub: ar ? 'ذاكرة البوت' : 'Bot memory',
      color: 'from-blue-500/20 border-blue-500/30',
      iconColor: 'text-blue-400',
    },
    {
      href: '/beqolky/bot-settings',
      icon: Settings2,
      label: ar ? 'اعدادات البوت' : 'Bot Settings',
      sub: ar ? 'أسعار التوصيل والمزيد' : 'Delivery prices & more',
      color: 'from-orange-500/20 border-orange-500/30',
      iconColor: 'text-orange-400',
    },
  ];

  return (
    <div className="space-y-8 p-4" dir={isRtl ? 'rtl' : 'ltr'}>
      <div>
        <h1 className="text-3xl font-bold text-white">{t('dashboard')}</h1>
        <p className="text-white/50 mt-1 text-sm">
          {ar ? 'مرحباً بك في لوحة تحكم سنبلة' : 'Welcome to Sonbola control panel'}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map(({ href, icon: Icon, label, sub, color, iconColor }) => (
          <Link key={href} href={href}>
            <a className={`block rounded-2xl border bg-gradient-to-br ${color} p-5 hover:scale-[1.02] transition-transform cursor-pointer`}>
              <Icon className={`w-6 h-6 ${iconColor} mb-3`} />
              <p className="text-white font-semibold text-sm">{label}</p>
              <p className="text-white/50 text-xs mt-0.5">{sub}</p>
            </a>
          </Link>
        ))}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <p className="text-white/60 text-sm mb-3">
          {ar ? 'انتقل إلى اعدادات البوت لإدارة أسعار التوصيل' : 'Go to Bot Settings to manage delivery prices'}
        </p>
        <Link href="/beqolky/bot-settings">
          <a className="inline-flex items-center gap-2 text-violet-400 hover:text-violet-300 text-sm font-medium">
            {ar ? 'اعدادات البوت' : 'Bot Settings'}
            {ar ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
          </a>
        </Link>
      </div>
    </div>
  );
}
