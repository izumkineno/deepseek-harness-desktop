// @ts-nocheck - vendored dsh-market has its own strictness, shimmed via alias
import { useMemo } from 'react'
import { MarketSection } from '../../packages/dsh-market/src/client/MarketSection'
function createT(_lang: string) {
  return (key: string) => key
}

export default function MarketReuse() {
  const t = useMemo(() => createT('zh'), [])
  const locale = useMemo(() => ({
    subscribe: (_cb: () => void) => () => {},
    getSnapshot: () => ({ active: 'zh-CN' }),
  }), [])
  const theme = useMemo(() => ({
    setTheme: (_id: string) => {},
  }), [])
  const themeStore = useMemo(() => ({
    subscribe: (_cb: () => void) => () => {},
    getSnapshot: () => null,
  }), [])

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-canvas">
      <MarketSection t={t as any} locale={locale as any} theme={theme as any} themeStore={themeStore as any} />
    </div>
  )
}
