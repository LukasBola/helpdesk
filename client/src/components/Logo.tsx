import { cn } from '@/lib/utils'

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2 font-bold text-indigo-950', className)}>
      <div className="h-6 w-6 rounded-lg bg-brand" aria-hidden />
      <span>helpdesk</span>
    </div>
  )
}
