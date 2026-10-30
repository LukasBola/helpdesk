import { LogOut } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useChangeLanguage } from '@/hooks/useLanguage'
import { useLogout } from '@/hooks/useLogout'
import type { SessionUser } from '@/lib/auth-client'

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(word => word[0].toUpperCase())
    .join('')
}

export function UserMenu({ user }: { user: SessionUser }) {
  const { t } = useTranslation()
  const logout = useLogout()
  const { change, error } = useChangeLanguage()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('auth.userMenu')}
        className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-indigo-300 to-teal-300 text-sm font-semibold text-indigo-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {initials(user.name)}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52 rounded-xl">
        <DropdownMenuLabel>
          <div className="truncate font-semibold">{user.name}</div>
          <div className="text-xs font-normal text-muted-foreground">
            {t(`shell.role.${user.role}`)}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="px-2 py-1">
          <LanguageSwitcher onChange={lng => void change(lng)} />
          {error && (
            <p role="alert" className="mt-1 text-xs text-rose-600">
              {t('language.saveError')}
            </p>
          )}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="min-h-11 cursor-pointer text-rose-600 focus:bg-rose-50 focus:text-rose-600"
          onSelect={() => void logout()}
        >
          <LogOut className="mr-2 h-4 w-4" aria-hidden />
          {t('auth.logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
