import { useState, useEffect } from 'react';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { Eye, EyeOff, Lock, Languages } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { useTranslation } from '@/lib/i18n';

export default function AdminLogin() {
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const { login, loading, error } = useAdminAuth();
  const toggleLanguage = useAppStore((state) => state.toggleLanguage);
  const { language, isRtl } = useTranslation();

  useEffect(() => {
    document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
  }, [isRtl, language]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await login(password);
  };

  const text = {
    title:       language === 'ar' ? 'لوحة الإدارة'        : 'Admin Panel',
    label:       language === 'ar' ? 'كلمة المرور'          : 'Password',
    placeholder: language === 'ar' ? 'أدخل كلمة المرور'    : 'Enter password',
    submit:      language === 'ar' ? 'دخول'                 : 'Login',
    checking:    language === 'ar' ? 'جارٍ التحقق...'       : 'Verifying...',
    langLabel:   language === 'ar' ? 'English'              : 'العربية',
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background mesh-bg p-4">
      {/* Language toggle */}
      <button
        onClick={toggleLanguage}
        className="fixed top-4 right-4 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-white/70 hover:text-white text-xs font-medium transition-all backdrop-blur-sm"
      >
        <Languages size={14} />
        {text.langLabel}
      </button>

      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/30 mx-auto mb-4">
            <Lock size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">{text.title}</h1>
          <p className="text-muted-foreground text-sm mt-1">Sonbola.baby</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-card/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{text.label}</label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={text.placeholder}
                className="w-full h-11 px-4 pl-10 rounded-xl border border-white/10 bg-black/20 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors text-sm"
                required
                autoFocus
                dir="ltr"
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute top-1/2 -translate-y-1/2 left-3 text-muted-foreground hover:text-foreground"
              >
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-red-400 text-sm text-center bg-red-500/10 rounded-xl px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full h-11 rounded-xl bg-primary text-white font-bold text-sm disabled:opacity-50 hover:bg-primary/90 transition-colors"
          >
            {loading ? text.checking : text.submit}
          </button>
        </form>
      </div>
    </div>
  );
}
