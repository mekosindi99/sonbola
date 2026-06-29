import { useState } from 'react';
import { Facebook } from 'lucide-react';
import { BookingSection, PrintModal } from '@/pages/bookings';
import { useTranslation } from '@/lib/i18n';

export default function FacebookBookings() {
  const [printBooking, setPrintBooking] = useState<any | null>(null);
  const { language } = useTranslation();
  const ar = language === 'ar';

  return (
    <div className="space-y-8">
      {printBooking && <PrintModal booking={printBooking} onClose={() => setPrintBooking(null)} />}

      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center">
          <Facebook className="w-6 h-6 text-blue-400" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-foreground">{ar ? 'حجوزات فيسبوك' : 'Facebook Bookings'}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{ar ? 'الطلبات الواردة من ماسنجر فيسبوك' : 'Orders from Facebook Messenger'}</p>
        </div>
      </div>

      <BookingSection
        title={ar ? 'حجوزات فيسبوك' : 'Facebook Bookings'}
        icon={<Facebook className="w-5 h-5 text-blue-400" />}
        source="facebook"
        platform="facebook"
        accentClass="bg-blue-500/10 border-blue-500/30 text-blue-300"
        printBooking={printBooking}
        setPrintBooking={setPrintBooking}
      />
    </div>
  );
}
