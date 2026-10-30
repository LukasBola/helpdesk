import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import type { TicketStatus } from '@/lib/tickets-api'
import { cn } from '@/lib/utils'

// Full class names (not interpolated) so Tailwind can see them.
const STATUS_CLASSES: Record<TicketStatus, string> = {
  OPEN: 'bg-status-open text-status-open-fg',
  IN_PROGRESS: 'bg-status-in-progress text-status-in-progress-fg',
  RESOLVED: 'bg-status-resolved text-status-resolved-fg',
  CLOSED: 'bg-status-closed text-status-closed-fg',
}

export function TicketStatusBadge({
  status,
  className,
}: {
  status: TicketStatus
  className?: string
}) {
  const { t } = useTranslation()
  return (
    <Badge
      className={cn('border-transparent whitespace-nowrap', STATUS_CLASSES[status], className)}
    >
      {t(`status.${status}`)}
    </Badge>
  )
}
