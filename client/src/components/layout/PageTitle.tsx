import { createContext, type ReactNode, useContext, useEffect, useState } from 'react'

const APP_NAME = 'helpdesk'

const PageTitleContext = createContext<((title: string) => void) | null>(null)
const PageTitleValueContext = createContext('')

// The shell header renders the title as the page's only h1; pages set it via usePageTitle.
export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState('')

  useEffect(() => {
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME
  }, [title])

  return (
    <PageTitleContext.Provider value={setTitle}>
      <PageTitleValueContext.Provider value={title}>{children}</PageTitleValueContext.Provider>
    </PageTitleContext.Provider>
  )
}

export function usePageTitle(title: string): void {
  const setTitle = useContext(PageTitleContext)
  if (!setTitle) throw new Error('usePageTitle must be used inside PageTitleProvider')
  useEffect(() => {
    setTitle(title)
  }, [setTitle, title])
}

export function PageTitleHeading({ className }: { className?: string }) {
  const title = useContext(PageTitleValueContext)
  return <h1 className={className}>{title}</h1>
}
