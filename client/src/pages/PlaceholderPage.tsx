import type { LucideIcon } from 'lucide-react'

export function PlaceholderPage({ title, icon: Icon }: { title: string; icon: LucideIcon }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 rounded-2xl bg-white p-8 text-center shadow-soft">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-primary">
        <Icon className="h-6 w-6" aria-hidden />
      </div>
      <h1 className="text-lg font-semibold text-indigo-950">{title}</h1>
      <p className="text-sm text-muted-foreground">Wkrótce</p>
    </div>
  )
}
