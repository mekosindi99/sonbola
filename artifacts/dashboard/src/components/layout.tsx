import React, { useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { 
  LayoutDashboard, 
  PackageSearch, 
  CalendarCheck, 
  Settings, 
  Languages,
  Menu,
  X,

  Sun,
  Moon,
  Facebook,
  Instagram,
  DollarSign,
  Store,
  LogOut,
  BotMessageSquare,
  Palette,
  BarChart2,
  Lightbulb,
  MapPin,
  GitBranch,
  Settings2,
  ListOrdered,
  BookOpen,
  Brain,
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { useAppStore } from '@/lib/store';
import { Button } from './ui-custom';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const { t, language, isRtl } = useTranslation();
  const toggleLanguage = useAppStore((state) => state.toggleLanguage);
  const theme = useAppStore((state) => state.theme);
  const toggleTheme = useAppStore((state) => state.toggleTheme);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  useEffect(() => {
    document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
  }, [isRtl, language]);

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
  }, [theme]);

  const handleLogout = () => {
    localStorage.removeItem('beqolky_authenticated');
    window.location.href = '/beqolky/login';
  };

  const navItems = [
    { href: '/', icon: Store, label: 'sonbola.shop', external: true },
    { href: '/beqolky/inventory', icon: PackageSearch, label: language === 'ar' ? 'المخزن' : 'Storage' },
    { href: '/beqolky', icon: LayoutDashboard, label: t('dashboard'), exact: true },
    { href: '/beqolky/bookings', icon: CalendarCheck, label: language === 'ar' ? 'حجوزات الموقع' : 'Bookings' },
    { href: '/beqolky/facebook-bookings', icon: Facebook, label: language === 'ar' ? 'حجوزات فيسبوك' : 'FB Bookings' },
    { href: '/beqolky/instagram-bookings', icon: Instagram, label: language === 'ar' ? 'حجوزات انستقرام' : 'IG Bookings' },
    { href: '/beqolky/storefront-chats', icon: BotMessageSquare, label: language === 'ar' ? 'حجوزات بوت الموقع' : 'Bot Bookings' },

    { href: '/beqolky/bot-general-qa', icon: BookOpen, label: language === 'ar' ? 'قاعدة المعرفة' : 'Knowledge Base' },
    { href: '/beqolky/bot-training', icon: Brain, label: language === 'ar' ? 'تدريب البوت' : 'Bot Training' },
    { href: '/beqolky/themes', icon: Palette, label: language === 'ar' ? 'ثيمات المتجر' : 'Themes' },
    { href: '/beqolky/visitors', icon: MapPin, label: language === 'ar' ? 'زوار الموقع' : 'Visitors' },
    { href: '/beqolky/reports', icon: BarChart2, label: language === 'ar' ? 'التقارير' : 'Reports' },
    { href: '/beqolky/facebook-connect', icon: Facebook, label: language === 'ar' ? 'ربط فيسبوك' : 'Facebook' },
    { href: '/beqolky/instagram-bot', icon: Instagram, label: language === 'ar' ? 'بوت الانستقرام' : 'Instagram Bot' },
    { href: '/beqolky/usage', icon: DollarSign, label: language === 'ar' ? 'الاستهلاك' : 'Usage' },
    { href: '/beqolky/bot-settings', icon: Settings2, label: language === 'ar' ? 'اعدادات البوت' : 'Bot Settings' },
    { href: '/beqolky/interactive-menu', icon: ListOrdered, label: language === 'ar' ? 'القائمة التفاعلية' : 'Interactive Menu' },
    { href: '/beqolky/settings', icon: Settings, label: t('settings') },
  ];

  const toggleMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);

  return (
    <div className="flex h-screen bg-background mesh-bg text-foreground">
      {/* Sidebar (Desktop) */}
      <aside className={`hidden md:flex flex-col w-64 border-${isRtl ? 'l' : 'r'} border-white/10 bg-card/40 backdrop-blur-2xl transition-all duration-300 z-20`}>
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/20">
            <span className="font-bold text-white text-xl">AI</span>
          </div>
          <span className="font-bold text-lg tracking-tight text-gradient">Business Suite</span>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-2 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = item.exact ? location === item.href : location.startsWith(item.href) && !item.external;
            const cls = `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${isActive ? 'bg-primary/10 text-primary shadow-inner shadow-primary/5' : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'}`;
            return item.external ? (
              <a key={item.href} href={item.href} target="_blank" rel="noopener noreferrer" className={cls}>
                <item.icon className="w-5 h-5" />
                <span className="font-medium">{item.label}</span>
              </a>
            ) : (
              <Link key={item.href} href={item.href} className={cls}>
                <item.icon className={`w-5 h-5 transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`} />
                <span className="font-medium">{item.label}</span>
                {isActive && (
                  <motion.div layoutId="sidebar-indicator" className={`absolute ${isRtl ? 'right-0' : 'left-0'} w-1 h-8 bg-primary rounded-r-full`} />
                )}
              </Link>
            );
          })}
        </nav>
        
        <div className="p-4 mt-auto space-y-2">
          {/* Theme Toggle */}
          <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-white/5 border border-white/10">
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              {theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              {theme === 'dark' ? (language === 'ar' ? 'داكن' : 'Dark') : (language === 'ar' ? 'فاتح' : 'Light')}
            </span>
            <button
              onClick={toggleTheme}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-300 ${theme === 'light' ? 'bg-primary' : 'bg-muted'}`}
              aria-label="Toggle theme"
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-300 ${theme === 'light' ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
          {/* Language Toggle */}
          <Button variant="glass" className="w-full justify-between" onClick={toggleLanguage}>
            <span className="flex items-center gap-2">
              <Languages className="w-4 h-4" />
              {language === 'en' ? 'العربية' : 'English'}
            </span>
          </Button>
          {/* Logout */}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            {language === 'ar' ? 'تسجيل الخروج' : 'Logout'}
          </button>
        </div>
      </aside>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden" onClick={toggleMenu} />
      )}

      {/* Mobile Sidebar */}
      <aside className={`fixed inset-y-0 ${isRtl ? 'right-0' : 'left-0'} w-64 bg-card border-${isRtl ? 'l' : 'r'} border-white/10 z-50 transform transition-transform duration-300 md:hidden flex flex-col ${isMobileMenuOpen ? 'translate-x-0' : (isRtl ? 'translate-x-full' : '-translate-x-full')}`}>
        {/* Header */}
        <div className="p-4 flex justify-between items-center border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
              <span className="font-bold text-white">AI</span>
            </div>
            <span className="font-bold text-gradient">Suite</span>
          </div>
          <Button variant="ghost" size="icon" onClick={toggleMenu}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Nav links — scrollable */}
        <nav className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
          {navItems.map((item) => {
            const isActive = item.exact ? location === item.href : location.startsWith(item.href) && !item.external;
            const cls = `flex items-center gap-3 px-4 py-3 rounded-xl ${isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`;
            return item.external ? (
              <a key={item.href} href={item.href} target="_blank" rel="noopener noreferrer" onClick={toggleMenu} className={cls}>
                <item.icon className="w-5 h-5" />
                <span className="font-medium">{item.label}</span>
              </a>
            ) : (
              <Link key={item.href} href={item.href} onClick={toggleMenu} className={cls}>
                <item.icon className="w-5 h-5" />
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer — always visible at bottom */}
        <div className="flex-shrink-0 p-4 border-t border-white/10 space-y-2">
          <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-white/5 border border-white/10">
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              {theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              {theme === 'dark' ? (language === 'ar' ? 'داكن' : 'Dark') : (language === 'ar' ? 'فاتح' : 'Light')}
            </span>
            <button
              onClick={toggleTheme}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-300 ${theme === 'light' ? 'bg-primary' : 'bg-muted'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-300 ${theme === 'light' ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
          <Button variant="glass" className="w-full justify-center" onClick={() => { toggleLanguage(); toggleMenu(); }}>
            <Languages className="w-4 h-4 mr-2" />
            {language === 'en' ? 'العربية' : 'English'}
          </Button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            {language === 'ar' ? 'تسجيل الخروج' : 'Logout'}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden relative">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 border-b border-white/10 bg-background/50 backdrop-blur-md sticky top-0 z-30">
          <div className="flex items-center gap-2">
             <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
              <span className="font-bold text-white text-sm">AI</span>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={toggleMenu}>
            <Menu className="w-6 h-6" />
          </Button>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <motion.div
            key={location}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="max-w-7xl mx-auto h-full"
          >
            {children}
          </motion.div>
        </div>
      </main>
    </div>
  );
}
