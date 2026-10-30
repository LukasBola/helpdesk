import { Menu } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Outlet } from 'react-router-dom'

import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useLanguageSync } from '@/hooks/useLanguage'

import { PageTitleHeading, PageTitleProvider } from './PageTitle'
import { SidebarNav } from './SidebarNav'
import { UserMenu } from './UserMenu'

// Rendered only inside ProtectedRoute, so an active user is always present.
export function AppShell() {
  const { t } = useTranslation()
  const user = useCurrentUser()
  useLanguageSync(user.locale)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const isAdmin = user.role === 'ADMIN'
  const firstName = user.name.split(/\s+/)[0]

  return (
    <div className="min-h-screen bg-app p-3 md:flex md:gap-4 md:p-4">
      <aside className="hidden w-56 shrink-0 flex-col gap-6 rounded-2xl bg-white p-4 shadow-soft md:sticky md:top-4 md:flex md:h-[calc(100vh-2rem)]">
        <Logo className="px-2 pt-1" />
        <SidebarNav isAdmin={isAdmin} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <PageTitleProvider>
          <header className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 shrink-0 bg-white shadow-soft md:hidden"
                    aria-label={t('nav.openMenu')}
                  >
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent
                  side="left"
                  className="w-72 rounded-r-2xl p-4"
                  aria-describedby={undefined}
                >
                  <SheetTitle asChild>
                    <div>
                      <Logo className="mb-6 px-2 pt-1" />
                    </div>
                  </SheetTitle>
                  <SidebarNav isAdmin={isAdmin} onNavigate={() => setDrawerOpen(false)} />
                </SheetContent>
              </Sheet>

              <div className="min-w-0 flex-1">
                <p className="text-sm text-muted-foreground">{t('shell.greeting')}</p>
                <p className="truncate text-lg font-bold text-indigo-950">{firstName} 👋</p>
              </div>

              <UserMenu user={user} />
            </div>
            <PageTitleHeading className="text-xl font-bold text-indigo-950" />
          </header>

          <main className="min-w-0">
            <Outlet />
          </main>
        </PageTitleProvider>
      </div>
    </div>
  )
}
