'use client';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { configureChatStore } from '@/lib/client/chat-store';
import { useDismiss } from '@/lib/client/use-dismiss';
import { Footer } from './Footer';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { ShellContext, type ShellUser } from './shell-context';

export function AppShell({
  user,
  version,
  build,
  idleTimeoutMin,
  children,
}: {
  user: ShellUser;
  version: string;
  build: string;
  idleTimeoutMin: number;
  children: ReactNode;
}) {
  // the chat store (background streams) tells the sidebar when its list changed — new chat, new title, finished answer
  const queryClient = useQueryClient();
  useEffect(() => {
    configureChatStore({ onListChanged: () => void queryClient.invalidateQueries({ queryKey: ['chats'] }) });
  }, [queryClient]);
  // Mobile: drawer closed by default. Desktop (md+): visible by default, can be collapsed.
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  useDismiss(() => setMobileOpen(false), { active: mobileOpen }); // Escape closes the mobile drawer
  const toggleSidebar = () => {
    if (window.matchMedia('(min-width: 768px)').matches) setDesktopCollapsed((v) => !v);
    else setMobileOpen((v) => !v);
  };
  return (
    <ShellContext.Provider value={{ user }}>
      <div className="bg-page flex h-screen flex-col text-text print:block print:h-auto">
        <div className="flex min-h-0 flex-1 print:block">
          {/* mobile backdrop */}
          {mobileOpen && (
            <button
              type="button"
              aria-hidden="true"
              tabIndex={-1}
              className="fixed inset-0 z-30 bg-black/40 md:hidden"
              onClick={() => setMobileOpen(false)}
            />
          )}
          <div className="contents print:hidden"><Sidebar mobileOpen={mobileOpen} desktopCollapsed={desktopCollapsed} onNavigate={() => setMobileOpen(false)} /></div>
          <div className="flex min-w-0 flex-1 flex-col print:block">
            <div className="contents print:hidden"><Header onToggleSidebar={toggleSidebar} /></div>
            <main className="flex min-h-0 flex-1 flex-col print:block">{children}</main>
          </div>
        </div>
        <div className="contents print:hidden"><Footer version={version} build={build} idleTimeoutMin={idleTimeoutMin} /></div>
      </div>
    </ShellContext.Provider>
  );
}
