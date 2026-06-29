import { useState } from 'react';
import { Instagram } from 'lucide-react';
import { BookingSection, PrintModal } from '@/pages/bookings';
import { useTranslation } from '@/lib/i18n';

export default function InstagramBookings() {
  const [printBooking, setPrintBooking] = useState<any | null>(null);
  const { language } = useTranslation();
  const ar = language === 'ar';

  return (
    <div className="space-y-8">
      {printBooking && <PrintModal booking={printBooking} onClose={() => setPrintBooking(null)} />}

      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#f9a825,#e91e8c,#9c27b0)', border: '1px solid rgba(233,30,140,0.35)' }}>
          <Instagram className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-foreground">{ar ? 'حجوزات انستقرام' : 'Instagram Bookings'}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{ar ? 'الطلبات الواردة من دايركت انستقرام' : 'Orders from Instagram Direct'}</p>
        </div>
      </div>

      <BookingSection
        title={ar ? 'حجوزات انستقرام' : 'Instagram Bookings'}
        icon={<Instagram className="w-5 h-5 text-pink-400" />}
        source="facebook"
        platform="instagram"
        accentClass="bg-pink-500/10 border-pink-500/30 text-pink-300"
        printBooking={printBooking}
        setPrintBooking={setPrintBooking}
      />
    </div>
  );
}
