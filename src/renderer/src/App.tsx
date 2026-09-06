import { MemoryRouter as Router, Route, Routes } from 'react-router-dom';

import { AppLayout } from '@/components/app-layout';
import { Toaster } from '@/components/ui/sonner';
import { AccountProvider } from '@/lib/account';
import { BrowserProvider } from '@/lib/browser';
import { RenewProvider } from '@/lib/renew';

import { MAINTENANCE_MESSAGE, MAINTENANCE_MODE, MAINTENANCE_TITLE } from './config';
import Konfiguracija from './pages/Konfiguracija';
import ObnoviOglase from './pages/ObnoviOglase';
import Pregled from './pages/Pregled';
import SlikeOglasov from './pages/SlikeOglasov';

export default function App(): JSX.Element {
  if (MAINTENANCE_MODE) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-xl space-y-3 text-center">
          <h1 className="text-xl font-semibold">{MAINTENANCE_TITLE}</h1>
          <p className="text-muted-foreground whitespace-pre-line text-sm">{MAINTENANCE_MESSAGE}</p>
        </div>
      </div>
    );
  }

  return (
    <AccountProvider>
      <BrowserProvider>
        <RenewProvider>
          <Router>
            <Routes>
              <Route element={<AppLayout />}>
                <Route path="/" element={<Pregled />} />
                <Route path="/obnovi" element={<ObnoviOglase />} />
                <Route path="/slike" element={<SlikeOglasov />} />
                <Route path="/konfiguracija" element={<Konfiguracija />} />
              </Route>
            </Routes>
          </Router>
          <Toaster />
        </RenewProvider>
      </BrowserProvider>
    </AccountProvider>
  );
}
