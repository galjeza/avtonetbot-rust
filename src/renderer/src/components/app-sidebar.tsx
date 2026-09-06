import { Car, CircleAlert, Images, LayoutDashboard, RefreshCw, Settings } from 'lucide-react';
import { NavLink } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { formatDate, useAccount } from '@/lib/account';
import { useReadiness } from '@/lib/readiness';

const NAV = [
  { to: '/', label: 'Pregled', icon: LayoutDashboard, end: true },
  { to: '/obnovi', label: 'Obnovi oglase', icon: RefreshCw, end: false },
  { to: '/slike', label: 'Slike oglasov', icon: Images, end: false },
  { to: '/konfiguracija', label: 'Konfiguracija', icon: Settings, end: false },
];

export function AppSidebar(): JSX.Element {
  const { subscription, loading } = useAccount();
  const { ready, pending } = useReadiness();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <NavLink to="/">
                <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                  <Car className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">Avtonet Bot</span>
                  <span className="text-muted-foreground truncate text-xs">
                    Obnavljanje oglasov
                  </span>
                </div>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map(({ to, label, icon: Icon, end }) => {
                const blocked = to === '/obnovi' && !ready && !pending;
                return (
                  <SidebarMenuItem key={to}>
                    <NavLink to={to} end={end}>
                      {({ isActive }) => (
                        <SidebarMenuButton
                          isActive={isActive}
                          tooltip={blocked ? `${label} — ni na voljo` : label}
                        >
                          <Icon />
                          <span>{label}</span>
                          {blocked && <CircleAlert className="text-destructive ml-auto size-4" />}
                        </SidebarMenuButton>
                      )}
                    </NavLink>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Subscription gates every renewal, so it stays visible on every screen. */}
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="group-data-[collapsible=icon]:hidden">
              <div className="rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground text-xs">Naročnina</span>
                  {!loading && (
                    <Badge variant={subscription.isActive ? 'default' : 'destructive'}>
                      {subscription.isActive ? 'Aktivna' : 'Poteklá'}
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-sm">
                  {subscription.paidTo ? `Velja do ${formatDate(subscription.paidTo)}` : '—'}
                </p>
              </div>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
