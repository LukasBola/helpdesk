import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import type { TicketPriority } from '@/lib/tickets-api'
import { cn } from '@/lib/utils'

// Full class names (not interpolated) so Tailwind can see them.
const PRIORITY_CLASSES: Record<TicketPriority, string> = {
  LOW: 'bg-priority-low text-priority-low-fg',
  MEDIUM: 'bg-priority-medium text-priority-medium-fg',
  HIGH: 'bg-priority-high text-priority-high-fg',
  URGENT: 'bg-priority-urgent text-priority-urgent-fg',
}

export function TicketPriorityBadge({
  priority,
  className,
}: {
  priority: TicketPriority
  className?: string
}) {
  const { t } = useTranslation()
  return (
    <Badge
      className={cn('border-transparent whitespace-nowrap', PRIORITY_CLASSES[priority], className)}
    >
      {t(`priority.${priority}`)}
    </Badge>
  )
}
