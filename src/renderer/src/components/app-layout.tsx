import { Outlet, useLocation } from 'react-router-dom';

import { AppSidebar } from '@/components/app-sidebar';
import { Separator } from '@/components/ui/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';

const TITLES: Record<string, string> = {
  '/': 'Pregled',
  '/obnovi': 'Obnovi oglase',
  '/slike': 'Slike oglasov',
  '/konfiguracija': 'Konfiguracija',
};

export function AppLayout(): JSX.Element {
  const { pathname } = useLocation();

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <h1 className="text-sm font-medium">{TITLES[pathname] ?? 'Avtonet Bot'}</h1>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto w-full max-w-6xl">
            <Outlet />
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
