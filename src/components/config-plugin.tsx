import { ArrowUpRightFromSquare, Check, ChevronDown, ChevronUp, CircleInfo, Copy, Magnifier, TriangleExclamation, Xmark } from '@gravity-ui/icons'
import { Button, Chip, Input, ListBox, Select, Spinner, Surface, Tooltip } from '@heroui/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { invoke } from '@tauri-apps/api/core'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { If, Then, Else } from 'react-if-lite'
import { useDshPlugins } from '@/hooks/use-dsh-plugins.ts'
import { toast } from '@/utils'
import { market } from '@market-compat'
import {
  avatarColor as avColor,
  formatCount,
  orderedCategories,
  pluginName,
  visiblePlugins,
  pageItems,
  TIME_RANGE_DAYS,
  installTargetFor,
} from '@market-compat'
import type { UpdateStatus } from '@market-compat'
const UI_LOG = '[market-ui]'
function uiLog(level: 'info' | 'warn' | 'error', msg: string, extra?: unknown) {
  const line = `${UI_LOG} ${msg}`
  if (level === 'error') console.error(line, extra ?? '')
  else if (level === 'warn') console.warn(line, extra ?? '')
  else console.log(line, extra ?? '')
}
type SortField = 'downloads' | 'stars' | 'added'
type SortDir = 'desc' | 'asc'
type TimeRange = 'all' | 'day' | 'week' | 'month' | 'quarter' | 'year'
type InstalledView = 'list' | 'groups'
// primitives: MarketLogo (brand mark) — official style monochrome, follows theme
// ─────────────────────────────────────────────────────────────────────────────
function MarketLogo({ size = 22, animated = false }: { size?: number; animated?: boolean }) {
  return (
    <span aria-hidden="true" className="inline-flex shrink-0 text-[#4f6ef7]" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={animated ? 'animate-[dshmPlug_1.5s_cubic-bezier(.4,0,.2,1)_infinite]' : undefined} style={animated ? { transformBox: 'fill-box', transformOrigin: '50% 50%' } as any : undefined}>
        <rect x="1" y="1" width="14" height="14" rx="2" fill="currentColor" opacity={0.12} />
        <rect x="3" y="3" width="4" height="4" rx="0.8" fill="currentColor" />
        <rect x="9" y="3" width="4" height="4" rx="0.8" fill="currentColor" opacity={0.6} />
        <rect x="3" y="9" width="4" height="4" rx="0.8" fill="currentColor" opacity={0.6} />
        <rect x="9" y="9" width="4" height="4" rx="0.8" fill="currentColor" />
      </svg>
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Pill — category chip, mirrors primitives.Pill
// ─────────────────────────────────────────────────────────────────────────────
function Pill({ active, children, onClick }: { active?: boolean; children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      data-chip="1"
      onClick={onClick}
      className={
        active
          ? 'shrink-0 inline-flex items-center h-7 px-3.5 rounded-full text-[12px] font-semibold bg-[#4f6ef7] text-white shadow-sm cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f6ef7] focus-visible:ring-offset-1 whitespace-nowrap'
          : 'shrink-0 inline-flex items-center h-7 px-3.5 rounded-full text-[12px] font-medium bg-white border border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900 cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f6ef7] focus-visible:ring-offset-1 whitespace-nowrap'
      }
    >
      {children}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// OwnerAvatar — 16px GitHub avatar with fallback initial tile, 1:1 from dsh-market
// ─────────────────────────────────────────────────────────────────────────────
function OwnerAvatar({ name, owner }: { name: string; owner: string }) {
  const [failed, setFailed] = useState(false)
  if (failed || !owner) {
    return (
      <div
        className="size-4 rounded-full grid place-items-center font-bold text-white text-[9px] shrink-0"
        style={{ background: avColor(name) }}
        aria-hidden="true"
      >
        {name.replace(/^dsh[-_]/i, '').charAt(0).toUpperCase() || 'P'}
      </div>
    )
  }
  return (
    <img
      className="size-4 rounded-full shrink-0 object-cover bg-slate-100 ring-1 ring-black/5"
      src={`https://github.com/${encodeURIComponent(owner)}.png?size=64`}
      alt={`${owner} avatar`}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CardDesc — 5-line fixed slot (90px) so grid rows align, mirrors dsh-market
// ─────────────────────────────────────────────────────────────────────────────
function CardDesc({ text }: { text: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  if (!text) return <p className="text-[12px] leading-[18px] text-slate-400 m-0 min-h-[18px]">—</p>
  return (
    <div className="flex gap-1 items-start">
      <p className={open ? 'text-[12px] leading-[18px] text-[#8b93a1] m-0 flex-1' : 'text-[12px] leading-[18px] text-[#8b93a1] m-0 flex-1 overflow-hidden [display:-webkit-box] [-webkit-line-clamp:5] [-webkit-box-orient:vertical] h-[90px]'}>
        {text}
      </p>
      <button
        type="button"
        aria-label={open ? t('market.desc.collapse') : t('market.desc.expand')}
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        className="shrink-0 size-5 grid place-items-center rounded text-[#8b93a1] hover:text-[#4f6ef7] cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f6ef7]"
      >
        {open ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CardShot — curated screenshots per card, 3 thumb limit, 132x88 contain
// ─────────────────────────────────────────────────────────────────────────────
const CARD_SHOT_LIMIT = 3
function CardShot({ plugin, onOpen }: { plugin: any; onOpen: (shots: string[], index: number) => void }) {
  const [broken, setBroken] = useState<string[]>([])
  const shots: string[] = Array.isArray(plugin.screenshots) ? plugin.screenshots : []
  const visible = shots.filter((s: string) => !broken.includes(s)).slice(0, CARD_SHOT_LIMIT)
  if (visible.length === 0) return null
  // strip invalid hosts quickly? reuse safe logic but keep simple: show what we have
  return (
    <div className="flex gap-1.5 overflow-x-auto py-0.5 -mx-1 px-1" style={{ scrollbarWidth: 'thin' }}>
      {visible.map((src: string, i: number) => (
        <button
          key={src + i}
          type="button"
          onClick={() => onOpen(visible, i)}
          className="flex-none rounded-lg overflow-hidden border border-slate-200 bg-[#f3f4f6] hover:border-[#4f6ef7]/30 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f6ef7]"
          style={{ width: 132, height: 88 }}
        >
          <img
            src={src}
            alt={`screenshot ${i + 1}`}
            loading="lazy"
            onError={() => setBroken(p => (p.includes(src) ? p : [...p, src]))}
            className="w-[132px] h-[88px] object-contain bg-white block"
          />
        </button>
      ))}
    </div>
  )
}

// ScreenshotStrip for confirm dialog — larger strip
function ScreenshotStrip({ plugin, onOpen }: { plugin: any; onOpen: (shots: string[], index: number) => void }) {
  const shots: string[] = Array.isArray(plugin.screenshots) ? plugin.screenshots : []
  if (shots.length === 0) return null
  return (
    <div className="flex gap-2 overflow-x-auto py-1" style={{ scrollbarWidth: 'thin' }}>
      {shots.slice(0, 6).map((src: string, i: number) => (
        <button
          key={src + i}
          type="button"
          onClick={() => onOpen(shots, i)}
          className="flex-none rounded-lg overflow-hidden border border-slate-200 bg-[#f3f4f6] cursor-pointer"
          style={{ width: 220, height: 150 }}
        >
          <img src={src} alt={`shot ${i + 1}`} loading="lazy" className="w-[220px] h-[150px] object-cover block" />
        </button>
      ))}
    </div>
  )
}

function ScreenshotLightbox({ shots, startIndex, onClose }: { shots: string[]; startIndex: number; onClose: () => void; t: any }) {
  const [idx, setIdx] = useState(startIndex)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') setIdx(v => (v - 1 + shots.length) % shots.length)
      if (e.key === 'ArrowRight') setIdx(v => (v + 1) % shots.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shots.length, onClose])
  return (
    <div className="fixed inset-0 z-[10000] bg-[rgba(0,0,0,0.85)] flex items-center justify-center cursor-zoom-out" onClick={onClose} role="dialog" aria-modal="true">
      <button aria-label="close" className="absolute top-4 right-4 size-9 rounded-full grid place-items-center bg-white/10 text-white hover:bg-white/20 cursor-pointer" onClick={onClose}>×</button>
      {shots.length > 1 && (
        <>
          <button aria-label="prev" className="absolute left-4 top-1/2 -translate-y-1/2 size-11 rounded-full grid place-items-center bg-white/10 text-white hover:bg-white/20 cursor-pointer" onClick={e => { e.stopPropagation(); setIdx(v => (v - 1 + shots.length) % shots.length) }}><ChevronDown className="size-5 rotate-90" /></button>
          <button aria-label="next" className="absolute right-4 top-1/2 -translate-y-1/2 size-11 rounded-full grid place-items-center bg-white/10 text-white hover:bg-white/20 cursor-pointer" onClick={e => { e.stopPropagation(); setIdx(v => (v + 1) % shots.length) }}><ChevronDown className="size-5 -rotate-90" /></button>
        </>
      )}
      <img src={shots[idx]} alt={`preview ${idx + 1}`} className="max-w-[90vw] max-h-[85vh] object-contain rounded bg-white cursor-default" onClick={e => e.stopPropagation()} />
      {shots.length > 1 && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-2">
          {shots.map((_, i) => (
            <button key={i} onClick={e => { e.stopPropagation(); setIdx(i) }} className={i === idx ? 'size-1.5 rounded-full bg-white' : 'size-1.5 rounded-full bg-white/40'} />
          ))}
        </div>
      )}
    </div>
  )
}

function FilterMenu({
  sortField, sortDir, timeRange,
  onSortField, onSortDir, onTimeRange, t,
}: {
  sortField: SortField; sortDir: SortDir; timeRange: TimeRange
  onSortField: (v: SortField) => void; onSortDir: (v: SortDir) => void; onTimeRange: (v: TimeRange) => void; t: any
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen(v => !v)}
        className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:border-slate-300 hover:text-slate-900 cursor-pointer transition-colors"
      >
        <Magnifier className="size-3.5" />
        {t('market.filter', { defaultValue: '筛选' })}
        <ChevronDown className="size-3" />
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-30 w-[260px] rounded-xl border border-slate-200 bg-white shadow-xl p-2 flex flex-col gap-2">
          <div className="px-2 pt-1 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">{t('market.filterSort', { defaultValue: '排序字段' })}</div>
          <div className="flex gap-1.5 px-1">
            {(['downloads', 'stars', 'added'] as SortField[]).map(f => (
              <button key={f} onClick={() => onSortField(f)} className={sortField === f ? 'flex-1 h-7 rounded-full bg-[#4f6ef7] text-white text-xs font-semibold' : 'flex-1 h-7 rounded-full bg-slate-100 text-slate-700 text-xs font-medium hover:bg-slate-200'}>{t(`market.sort.${f}`)}</button>
            ))}
          </div>
          <div className="px-2 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">{t('market.filterDir', { defaultValue: '排序方向' })}</div>
          <div className="flex gap-1.5 px-1">
            {(['desc', 'asc'] as SortDir[]).map(d => (
              <button key={d} onClick={() => onSortDir(d)} className={sortDir === d ? 'flex-1 h-7 rounded-full bg-[#4f6ef7] text-white text-xs font-semibold' : 'flex-1 h-7 rounded-full bg-slate-100 text-slate-700 text-xs font-medium hover:bg-slate-200'}>{t(`market.sort.${d}`)}</button>
            ))}
          </div>
          <div className="px-2 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">{t('market.filterTime', { defaultValue: '发布时间范围' })}</div>
          <div className="grid grid-cols-2 gap-1 px-1">
            {(['all', 'day', 'week', 'month', 'quarter', 'year'] as TimeRange[]).map(r => (
              <button key={r} onClick={() => onTimeRange(r)} className={timeRange === r ? 'h-7 rounded-full bg-[#4f6ef7] text-white text-xs font-semibold' : 'h-7 rounded-full bg-slate-100 text-slate-700 text-xs font-medium hover:bg-slate-200'}>{t(`market.time.${r}`)}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Pager({ currentPage, totalPages, pageSize, onGoToPage, onChangePageSize, t }: {
  currentPage: number; totalPages: number; pageSize: number
  onGoToPage: (n: number) => void; onChangePageSize: (n: number) => void; t: any
}) {
  if (totalPages <= 1) return null
  const items = pageItems(currentPage, totalPages)
  return (
    <div className="flex items-center justify-between gap-3 mt-4 flex-wrap">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span>{t('market.pageInfo', { defaultValue: `第 ${currentPage} / ${totalPages} 页` }).replace('{0}', String(currentPage)).replace('{1}', String(totalPages))}</span>
        <Select selectedKey={String(pageSize)} onSelectionChange={k => onChangePageSize(Number(k))} className="w-[110px]">
          <Select.Trigger className="h-7 rounded-lg text-xs"><Select.Value /><Select.Indicator /></Select.Trigger>
          <Select.Popover><ListBox><ListBox.Item id="24">24 / {t('market.perPage', { defaultValue: '每页' })}</ListBox.Item><ListBox.Item id="48">48 / {t('market.perPage', { defaultValue: '每页' })}</ListBox.Item><ListBox.Item id="96">96 / {t('market.perPage', { defaultValue: '每页' })}</ListBox.Item></ListBox></Select.Popover>
        </Select>
      </div>
      <div className="flex items-center gap-1 flex-wrap">
        <Button size="sm" variant="ghost" isDisabled={currentPage === 1} onPress={() => onGoToPage(1)} className="h-7 px-2 text-xs">{t('market.firstPage', { defaultValue: '首页' })}</Button>
        <Button size="sm" variant="ghost" isDisabled={currentPage === 1} onPress={() => onGoToPage(currentPage - 1)} className="h-7 px-2 text-xs">{t('market.prevPage', { defaultValue: '上一页' })}</Button>
        {items.map((it, i) => it === '…' ? <span key={'e' + i} className="text-xs text-slate-400 px-1">…</span> : (
          <Button key={it} size="sm" variant={it === currentPage ? 'primary' : 'ghost'} onPress={() => onGoToPage(it as number)} className={it === currentPage ? 'h-7 min-w-7 bg-slate-900 text-white' : 'h-7 min-w-7'}>{it}</Button>
        ))}
        <Button size="sm" variant="ghost" isDisabled={currentPage === totalPages} onPress={() => onGoToPage(currentPage + 1)} className="h-7 px-2 text-xs">{t('market.nextPage', { defaultValue: '下一页' })}</Button>
        <Button size="sm" variant="ghost" isDisabled={currentPage === totalPages} onPress={() => onGoToPage(totalPages)} className="h-7 px-2 text-xs">{t('market.lastPage', { defaultValue: '末页' })}</Button>
      </div>
    </div>
  )
}

function usePagination(count: number, resetDeps: readonly unknown[], scrollToTop: () => void) {
  const PAGE_SIZES = [24, 48, 96]
  const DEFAULT_PAGE_SIZE = 24
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [currentPage, setCurrentPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(count / pageSize))
  useEffect(() => { setCurrentPage(1) }, [...resetDeps])
  useEffect(() => { if (currentPage > totalPages) setCurrentPage(totalPages) }, [totalPages, currentPage])
  const goToPage = useCallback((n: number) => { setCurrentPage(Math.max(1, Math.min(totalPages, n))); scrollToTop() }, [totalPages, scrollToTop])
  const changePageSize = useCallback((n: number) => { if (PAGE_SIZES.includes(n)) { setPageSize(n); setCurrentPage(1); scrollToTop() } }, [scrollToTop])
  return { currentPage, totalPages, pageSize, goToPage, changePageSize }
}

function SkeletonCard() {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col gap-3 animate-pulse">
      <div className="flex gap-3">
        <div className="size-4 rounded-full bg-slate-200 mt-1" />
        <div className="flex-1 space-y-2"><div className="h-4 bg-slate-200 rounded w-3/5" /><div className="h-3 bg-slate-100 rounded w-2/5" /></div>
        <div className="h-7 w-16 bg-slate-200 rounded-full" />
      </div>
      <div className="h-[90px] bg-slate-100 rounded" />
      <div className="h-6 bg-slate-100 rounded" />
    </div>
  )
}

export function ConfigPlugin() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language.startsWith('zh') ? 'zh' : 'en'
  const { plugins: installed, loading: installedLoading, refresh: refreshInstalled } = useDshPlugins()
  const qc = useQueryClient()

  // top-level tab — discover / themes / installed / backup / diagnostics ; backup+diagnostics under Advanced
  const [tab, setTab] = useState<'discover' | 'themes' | 'installed' | 'backup' | 'diagnostics'>('discover')
  const [q, setQ] = useState('')
  const [qThemes, setQThemes] = useState('')
  const [qInstalled, setQInstalled] = useState('')
  const [category, setCategory] = useState<string>('all')
  const [sortField, setSortField] = useState<SortField>('downloads')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [timeRange, setTimeRange] = useState<TimeRange>('all')
  const [themeSortField, setThemeSortField] = useState<SortField>('downloads')
  const [themeSortDir, setThemeSortDir] = useState<SortDir>('desc')
  const [themeTimeRange, setThemeTimeRange] = useState<TimeRange>('all')
  const [catsOpen, setCatsOpen] = useState(false)
  const [installedView, setInstalledView] = useState<InstalledView>('list')
  const [lightbox, setLightbox] = useState<{ shots: string[]; index: number } | null>(null)
  const [confirming, setConfirming] = useState<any | null>(null)
  const [showTop, setShowTop] = useState(false)
  const [version, setVersion] = useState<string | null>(null)

  const [pendingUninstall, setPendingUninstall] = useState<Set<string>>(() => new Set())
  const [pendingUpdate, setPendingUpdate] = useState<Set<string>>(() => new Set())

  // ── update 1:1 状态 — 镜像 dsh-market MarketSection ──
  const [updates, setUpdates] = useState<Record<string, UpdateStatus>>({})
  const [updatingName, setUpdatingName] = useState<string | null>(null)
  const [updatedNames, setUpdatedNames] = useState<string[]>([])
  const [updatingAll, setUpdatingAll] = useState(false)
  const [staleName, setStaleName] = useState<string | null>(null)
  const [installError, setInstallError] = useState<string | null>(null)
  const [buildsSkipped, setBuildsSkipped] = useState<{ plugin?: any; updateName?: string; names: string[] } | null>(null)
  const [compatibilityNotice, setCompatibilityNotice] = useState<any | null>(null)
  const [rollingBack, setRollingBack] = useState(false)
  const [progressPct, setProgressPct] = useState<number | null>(null); void progressPct
  void setProgressPct

  // cats measuring — mirrors dsh-market stickyHead + visibleCats budget
  const [visibleCats, setVisibleCats] = useState<number | null>(null)
  const [visibleCatsOneRow, setVisibleCatsOneRow] = useState<number | null>(null)
  const catsWrapRef = useRef<HTMLDivElement | null>(null)
  const [catsStuck, setCatsStuck] = useState(false)
  const [catsSentinel, setCatsSentinel] = useState<HTMLDivElement | null>(null)
  const catsAutoCollapsedRef = useRef(false)
  const bodyRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => { uiLog('info', 'ConfigPlugin mount', { lang, installedCount: installed.length }); return () => uiLog('info', 'ConfigPlugin unmount') }, [])
  useEffect(() => { uiLog('info', `tab → ${tab}`, { category, sortField, sortDir, timeRange }) }, [tab, category, sortField, sortDir, timeRange])
  useEffect(() => { if (q || qThemes || qInstalled) uiLog('info', `search q=${q} qThemes=${qThemes} qInstalled=${qInstalled}`) }, [q, qThemes, qInstalled])

  const { data: registry, isLoading: registryLoading, error: registryError } = useQuery({
    queryKey: ['market-registry'],
    queryFn: async () => {
      uiLog('info', 'query registry start')
      const t0 = performance.now()
      try {
        const r = await market.loadRegistry()
        uiLog('info', `query registry ok ${performance.now() - t0}ms`, { count: (r as any)?.count, plugins: (r as any)?.plugins?.length, categories: Object.keys((r as any)?.categories ?? {}).length })
        return r
      } catch (e) { uiLog('error', 'query registry fail', String(e).slice(0, 800)); throw e }
    },
    staleTime: 5 * 60 * 1000,
  })
  useEffect(() => { if (registry) uiLog('info', `registry data`, { count: (registry as any)?.count }); if (registryError) uiLog('error', 'registry error', String(registryError).slice(0, 600)) }, [registry, registryError])
  const { data: check, isLoading: checkLoading, refetch: refetchCheck } = useQuery({
    queryKey: ['market-check'],
    queryFn: async () => {
      uiLog('info', 'query check start')
      try { const r = await market.check(); uiLog('info', `query check ok`, { bundles: (r as any)?.bundles?.length, ok: (r as any)?.summary?.ok }); return r } catch (e) { uiLog('error', 'query check fail', String(e).slice(0, 600)); throw e }
    },
  })

  useEffect(() => {
    invoke<any>('get_runtime_info').then(r => { const v = (r as any)?.dsh_version ?? (r as any)?.version; if (typeof v === 'string' && v) { setVersion(v); uiLog('info', `runtime version ${v}`) } }).catch(e => uiLog('warn', 'get_runtime_info fail', String(e).slice(0, 300)))
  }, [])

  const { data: updatesData, refetch: refetchUpdates } = useQuery({
    queryKey: ['market-updates'],
    queryFn: async () => {
      uiLog('info', 'query updates start')
      try { const r = await market.updates(); uiLog('info', `query updates ok ${Object.keys(r).length} entries`); return r } catch (e) { uiLog('error', 'query updates fail', String(e).slice(0, 600)); throw e }
    },
    staleTime: 30_000,
  })
  useEffect(() => { if (updatesData) { setUpdates(updatesData); uiLog('info', `updatesData set ${Object.keys(updatesData).length}`) } }, [updatesData])
  // 兜底：定时拉一下，避免 stale 标记漏掉（与原版 30min TTL 对齐，桌面侧轻量 60s 轮询一次仅在 installed 变化后）
  useEffect(() => {
    uiLog('info', `refetchUpdates trigger installed.length=${installed.length}`)
    void refetchUpdates()
  }, [installed.length, refetchUpdates])

  const installMut = useMutation({
    mutationFn: async (spec: string) => {
      uiLog('info', `installMut start spec=${spec.slice(0, 400)}`)
      const t0 = performance.now()
      try { const r = await market.install([spec]); uiLog('info', `installMut ok ${performance.now() - t0}ms spec=${spec.slice(0, 200)}`); return r } catch (e) { uiLog('error', `installMut fail spec=${spec.slice(0, 200)}`, String(e).slice(0, 800)); throw e }
    },
    onSuccess: () => {
      uiLog('info', 'installMut onSuccess')
      toast(t('market.install.success'), { color: 'success' } as any)
      qc.invalidateQueries({ queryKey: ['market-registry'] })
      void refreshInstalled()
      void refetchCheck()
      setConfirming(null)
    },
    onError: (e: unknown) => {
      const raw = String((e as any)?.message ?? e ?? '')
      const msg = humanOutput(raw).slice(-1200)
      uiLog('error', 'installMut onError', msg.slice(0, 800))
      // pnpm 自举失败给更可操作的提示，hint 已由 wrapper 注入 stderr 末尾
      if (/pnpm/i.test(msg) || msg.includes('pnpm failed')) {
        const hint = msg.includes('[hint]') ? msg.split('[hint]').pop()!.trim() : 'pnpm 执行失败，请检查网络/镜像或在终端执行 corepack enable'
        setInstallError(`${t('market.installFail' as any, { defaultValue: '安装失败' })} — ${hint.slice(0, 600)}`)
      } else {
        setInstallError(humanOutput(raw).slice(-800))
      }
      toast(msg.slice(-800), { color: 'danger' } as any)
    },
  })
  const isBusy = installMut.isPending || pendingUninstall.size > 0 || pendingUpdate.size > 0 || updatingName !== null || updatingAll
  const registryByName = useMemo(() => {
    const m = new Map<string, any>()
    if (!registry) return m
    for (const pl of (registry as any).plugins ?? []) {
      const n = String(pl.name ?? '').toLowerCase()
      if (n) m.set(n, pl)
      const npm = String((pl as any).npm ?? '').toLowerCase()
      if (npm) m.set(npm, pl)
    }
    return m
  }, [registry])

  function specForInstalled(id: string, name: string): string {
    const entry = registryByName.get(id.toLowerCase()) ?? registryByName.get(name.toLowerCase())
    if (entry) {
      try { const tt = (installTargetFor as any)({ url: String(entry.url ?? ''), npm: (entry as any).npm }); if (typeof tt === 'string' && tt) return tt } catch {}
      const raw = String(entry.install ?? entry.name ?? id).trim()
      if (raw.includes(' add ')) { const seg = raw.slice(raw.lastIndexOf(' add ') + 5).trim().split(/\s+/)[0]; if (seg) return seg }
      return String(entry.install ?? entry.name ?? id)
    }
    return id
  }

  async function handleUninstall(id: string) {
    const key = id.toLowerCase()
    uiLog('info', `handleUninstall start id=${id} key=${key} isBusy=${isBusy}`)
    if (isBusy) { uiLog('warn', `handleUninstall skip isBusy id=${id}`); return }
    try { if (typeof window !== 'undefined' && !window.confirm(`${t('market.uninstall.confirm')}\n${t('market.uninstall.confirmDesc')}\n\n${id}`)) { uiLog('info', `handleUninstall cancel confirm id=${id}`); return } } catch {}
    setPendingUninstall(prev => new Set(prev).add(key))
    setInstallError(null)
    const t0 = performance.now()
    try {
      uiLog('info', `handleUninstall → market.uninstall id=${id}`)
      await market.uninstall([id])
      uiLog('info', `handleUninstall ok ${performance.now() - t0}ms id=${id}`)
      toast(t('market.uninstall.success'), { color: 'success' } as any)
      qc.invalidateQueries({ queryKey: ['market-registry'] })
      void refreshInstalled()
      void refetchCheck()
      void refetchUpdates()
    } catch (e) { const msg = String(e); uiLog('error', `handleUninstall fail id=${id}`, msg.slice(0, 800)); setInstallError(msg); toast(msg, { color: 'danger' } as any) }
    finally { setPendingUninstall(prev => { const n = new Set(prev); n.delete(key); return n }); uiLog('info', `handleUninstall finally pendingUninstall size=${pendingUninstall.size}`) }
  }

  // ── 1:1 原版 doUpdate / doUpdateAll / stale / buildsSkipped / compatibility ──
  const installedIds = useMemo(() => installed.map(p => String((p as any).id ?? (p as any).name ?? '').toLowerCase()).filter(Boolean), [installed])
  const selfName = useMemo(() => {
    if (installedIds.includes('dshmarket')) return 'dshmarket'
    if (installedIds.includes('dsh-market')) return 'dsh-market'
    return 'dsh-market'
  }, [installedIds])
  const installedOtherCount = useMemo(() => installed.filter(p => { const id = String((p as any).id ?? (p as any).name ?? '').toLowerCase(); return id !== 'dshmarket' && id !== 'dsh-market' }).length, [installed])
  const hasUpdates = useMemo(() => Object.keys(updates).some(name => {
    const lower = name.toLowerCase()
    if (lower === selfName.toLowerCase()) return false
    if (updatedNames.includes(name) || updatedNames.includes(lower)) return false
    const s = (updates as any)[name]
    return !!(s && (s.updateAvailable || s.update_available))
  }), [updates, selfName, updatedNames])
  const updatableNames = useMemo(() => Object.keys(updates).filter(name => {
    const lower = name.toLowerCase()
    if (lower === selfName.toLowerCase()) return false
    if (updatedNames.includes(name) || updatedNames.includes(lower)) return false
    const s = (updates as any)[name]
    return !!(s && (s.updateAvailable || s.update_available))
  }), [updates, selfName, updatedNames])

  function humanOutput(raw: string): string {
    return raw.split('\n').map(s => s.trim()).filter(Boolean).join('\n')
  }

  async function doUpdate(name: string, force = false) {
    void force
    uiLog('info', `doUpdate start name=${name} force=${force} isBusy=${isBusy} updatingName=${updatingName}`)
    if (isBusy && updatingName !== name) { uiLog('warn', `doUpdate skip isBusy name=${name}`); return }
    setInstallError(null)
    setStaleName(null)
    setBuildsSkipped(null)
    setUpdatingName(name)
    const key = name.toLowerCase()
    setPendingUpdate(prev => new Set(prev).add(key))
    const spec = specForInstalled(name, name)
    uiLog('info', `doUpdate spec=${spec} for ${name}`)
    const t0 = performance.now()
    try {
      await market.update([name], { force })
      uiLog('info', `doUpdate ok ${performance.now() - t0}ms name=${name} force=${force}`)
      setUpdatedNames(prev => prev.includes(name) ? prev : [...prev, name])
      toast(t('market.update.success'), { color: 'success' } as any)
      qc.invalidateQueries({ queryKey: ['market-registry'] })
      void refreshInstalled()
      void refetchCheck()
      void refetchUpdates()
      if (staleName === name) setStaleName(null)
    } catch (e: unknown) {
      const raw = String((e as any)?.message ?? e)
      const msg = raw
      uiLog('error', `doUpdate fail name=${name} ${performance.now() - t0}ms`, msg.slice(0, 800))
      if (msg.includes('409') || msg.toLowerCase().includes('busy')) {
        if (msg.toLowerCase().includes('agent')) setInstallError(t('market.agentBusyUpdate' as any, { defaultValue: '有 agent 正在运行，请稍后再试' }))
        else setInstallError(t('market.busyWait' as any, { defaultValue: '已有操作正在进行，请稍后' }))
        toast(msg, { color: 'danger' } as any)
        return
      }
      if (msg.toLowerCase().includes('stale') || msg.includes(' fresh ') || msg.includes('26h')) {
        uiLog('warn', `doUpdate stale name=${name}`)
        setStaleName(name)
      }
      if (msg.toLowerCase().includes('allowbuilds') || msg.toLowerCase().includes('ignoredbuilds') || msg.toLowerCase().includes('build')) {
        const m = /allowBuilds|ignoredBuilds/i.test(msg)
        if (m) { uiLog('warn', `doUpdate buildsSkipped name=${name}`); setBuildsSkipped({ updateName: name, names: [name] }) }
      }
      if (msg.toLowerCase().includes('compat') || msg.toLowerCase().includes('shadow') || msg.toLowerCase().includes('broken')) {
        uiLog('warn', `doUpdate compatibilityNotice name=${name}`, msg.slice(0, 400))
        setCompatibilityNotice({ risks: [{ plugin: name }], rollbackId: name, raw: msg })
      }
      const detail = humanOutput(msg).slice(-600)
      setInstallError(t('market.updateFail' as any, { defaultValue: '更新失败' }) + ': ' + name + ' — ' + detail)
      toast(detail, { color: 'danger' } as any)
    } finally {
      setPendingUpdate(prev => { const n = new Set(prev); n.delete(key); return n })
      setUpdatingName(cur => cur === name ? null : cur)
      uiLog('info', `doUpdate finally name=${name} pendingUpdate=${pendingUpdate.size}`)
    }
  }
  async function handleUpdate(id: string, spec: string) {
    void spec
    return doUpdate(id)
  }
  void handleUpdate
  async function doUpdateAll() {
    uiLog('info', `doUpdateAll start updatingAll=${updatingAll} isBusy=${isBusy} count=${updatableNames.length}`, updatableNames.slice(0, 10))
    if (updatingAll || isBusy) { uiLog('warn', `doUpdateAll skip`); return }
    const names = [...updatableNames]
    setInstallError(null)
    const t0 = performance.now()
    try {
      for (const n of names) {
        uiLog('info', `doUpdateAll → ${n}`)
        await doUpdate(n)
        {
          const { promise, resolve } = (Promise as any).withResolvers()
          setTimeout(resolve, 120)
          await promise
        }
      }
      uiLog('info', `doUpdateAll ok ${performance.now() - t0}ms`)
    } catch (e) { uiLog('error', `doUpdateAll fail`, String(e).slice(0, 600)); throw e } finally {
      setUpdatingAll(false)
      uiLog('info', `doUpdateAll finally`)
    }
  }
  async function doRollback(rollbackId: string) {
    uiLog('info', `doRollback start rollbackId=${rollbackId}`)
    setRollingBack(true)
    setInstallError(null)
    const t0 = performance.now()
    try {
      await market.install([rollbackId])
      uiLog('info', `doRollback ok ${performance.now() - t0}ms`)
      setCompatibilityNotice(null)
      void refreshInstalled()
      void refetchUpdates()
    } catch (e) { const msg = String(e); uiLog('error', `doRollback fail`, msg.slice(0, 600)); setInstallError(msg) } finally { setRollingBack(false); uiLog('info', `doRollback finally`) }
  }

  const categories = useMemo(() => { if (!registry) return []; return Object.keys((registry as any).categories ?? {}) }, [registry])

  // measuring cats chips — 2-row collapsed budget, 1-row when stuck
  useLayoutEffect(() => { setVisibleCats(null); setVisibleCatsOneRow(null) }, [lang, categories.length])
  useLayoutEffect(() => {
    if (catsOpen || visibleCats !== null) return
    const el = catsWrapRef.current
    if (el === null) return
    const chips = [...el.children].filter((c): c is HTMLElement => (c as HTMLElement).dataset?.chip === '1')
    if (chips.length === 0) return
    const first = chips[0]!
    const rowThreeTop = first.offsetTop + (first.offsetHeight + 6) * 2 - 3
    let fits = 0
    for (const c of chips) if ((c as HTMLElement).offsetTop < rowThreeTop) fits += 1
    setVisibleCats(fits >= chips.length ? fits : Math.max(1, fits - 1))
    const rowTwoTop = first.offsetTop + first.offsetHeight + 6 - 3
    let fitsOne = 0
    for (const c of chips) if ((c as HTMLElement).offsetTop < rowTwoTop) fitsOne += 1
    setVisibleCatsOneRow(fitsOne >= chips.length ? fitsOne : Math.max(1, fitsOne - 1))
  }, [catsOpen, visibleCats, registry])

  useEffect(() => {
    if (catsSentinel === null || typeof IntersectionObserver === 'undefined') return
    const obs = new IntersectionObserver(([entry]) => setCatsStuck(entry !== undefined && !entry.isIntersecting), { root: bodyRef.current, threshold: 0 })
    obs.observe(catsSentinel)
    return () => obs.disconnect()
  }, [catsSentinel])
  useLayoutEffect(() => {
    if (catsStuck) { if (catsOpen) { setCatsOpen(false); catsAutoCollapsedRef.current = true } }
    else if (catsAutoCollapsedRef.current) { setCatsOpen(true); catsAutoCollapsedRef.current = false }
  }, [catsStuck])

  const scrollToTop = useCallback(() => {
    const el = bodyRef.current
    if (el) { if (typeof el.scrollTo === 'function') el.scrollTo({ top: 0, behavior: 'smooth' as any }); else el.scrollTop = 0 }
  }, [])

  const plugins = useMemo(() => {
    if (!registry) return []
    const sort = `${sortField}-${sortDir}`
    const sinceDays = timeRange === 'all' ? undefined : TIME_RANGE_DAYS[timeRange as unknown as Exclude<TimeRange, 'all'>]
    return visiblePlugins((registry as any).plugins ?? [], { category, query: q, lang, sort: sort as any, sinceDays: sinceDays as any })
  }, [registry, category, q, lang, sortField, sortDir, timeRange])

  const themePlugins = useMemo(() => {
    if (!registry) return []
    const sort = `${themeSortField}-${themeSortDir}`
    const sinceDays = themeTimeRange === 'all' ? undefined : TIME_RANGE_DAYS[themeTimeRange as unknown as Exclude<TimeRange, 'all'>]
    return visiblePlugins((registry as any).plugins ?? [], { category: 'theme', query: qThemes, lang, sort: sort as any, sinceDays: sinceDays as any })
  }, [registry, qThemes, lang, themeSortField, themeSortDir, themeTimeRange])

  const anyThemePlugins = useMemo(() => {
    if (!registry) return []
    return (registry as any).plugins.filter((p: any) => p.category === 'theme')
  }, [registry])

  const pagination = usePagination(plugins.length, [q, category, sortField, sortDir, timeRange], scrollToTop)
  const themePagination = usePagination(themePlugins.length, [qThemes, themeSortField, themeSortDir, themeTimeRange], scrollToTop)

  const pagePlugins = plugins.slice((pagination.currentPage - 1) * pagination.pageSize, pagination.currentPage * pagination.pageSize)
  const themePagePlugins = themePlugins.slice((themePagination.currentPage - 1) * themePagination.pageSize, themePagination.currentPage * themePagination.pageSize)

  const installedSet = useMemo(() => {
    const s = new Set<string>()
    for (const p of installed) {
      const id = String((p as any).id ?? (p as any).name ?? '')
      if (id) s.add(id.toLowerCase())
      const name = String((p as any).name ?? '')
      if (name) s.add(name.toLowerCase())
    }
    return s
  }, [installed])


  function openLightbox(list: string[], idx: number) { setLightbox({ shots: list, index: idx }) }

  // card renderer 1:1
  function pluginCard(p: any) {
    const safeName = String(p.name ?? p.install ?? '')
    const safeOwner = String(p.owner ?? '')
    const safeUrl = String(p.url ?? '')
    const derived = (() => {
      try { const t = (installTargetFor as any)({ url: safeUrl, npm: (p as any).npm }); if (typeof t === 'string' && t) return t } catch {}
      const raw = String(p.install ?? safeName).trim()
      if (raw.includes(' add ')) { const seg = raw.slice(raw.lastIndexOf(' add ') + 5).trim().split(/\s+/)[0]; if (seg) return seg }
      return String(p.install ?? safeName)
    })()
    const safeInstall = derived
    const rowKey = safeUrl || `${safeOwner}/${safeName}::${safeInstall}`
    const installedHere = installedSet.has(safeName.toLowerCase()) || installedSet.has(safeInstall.toLowerCase()) || installedSet.has(derived.toLowerCase())
    const descMap = (p.description ?? {}) as Record<string, string>
    const desc = descMap[lang] ?? descMap.en ?? descMap.zh ?? ''
    const replEntry = p.deprecated === true && p.replacement ? (registry as any)?.plugins?.find((r: any) => r.name === p.replacement) : undefined
    const isBusyCard = installMut.isPending
    return (
      <div key={rowKey} className="bg-white border border-[#e5e7eb] rounded-xl p-3 flex flex-col gap-3 self-start">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="min-w-0 flex-1">
            <a href={safeUrl} target="_blank" rel="noreferrer" title={safeName} className="inline-flex items-center gap-1.5 max-w-full font-semibold text-[15px] leading-[22px] text-slate-900 hover:text-[#4f6ef7] hover:underline underline-offset-4 decoration-[#4f6ef7]/30">
              <span className="truncate">{pluginName(safeName)}</span>
              {p.deprecated === true && <span className="shrink-0 inline-flex items-center border border-amber-300 bg-amber-50 text-amber-700 rounded px-1.5 py-0.5 text-[11px] font-semibold leading-4">已废弃</span>}
            </a>
            <div className="flex items-center gap-1.5 min-w-0 mt-0.5 flex-wrap">
              <OwnerAvatar name={safeName} owner={safeOwner} />
              <span className="text-[11px] text-[#9ca3af] truncate max-w-[120px] min-w-[44px] flex-[0_1_auto]" title={safeOwner}>{safeOwner}</span>
              {typeof p.downloads === 'number' && (
                <Tooltip><span className="text-[11px] text-[#9ca3af] whitespace-nowrap tabular-nums">· ↓ {formatCount(p.downloads as number)}</span><Tooltip.Content>{String(p.downloads)} downloads</Tooltip.Content></Tooltip>
              )}
              {typeof p.stars === 'number' && (
                <Tooltip><span className="text-[11px] text-[#9ca3af] whitespace-nowrap tabular-nums">· ★ {formatCount(p.stars as number)}</span><Tooltip.Content>{String(p.stars)} stars</Tooltip.Content></Tooltip>
              )}
            </div>
            {p.added && <div className="text-[11px] text-[#9ca3af] mt-0.5">{p.added}</div>}
          </div>
          <span className="flex-1" />
          <div className="shrink-0 inline-flex items-center">
            {installedHere
              ? <span className="text-xs font-semibold text-emerald-600 whitespace-nowrap">{t('market.installed.badge')}</span>
              : (
                <Button
                  size="sm"
                  onPress={() => setConfirming(p)}
                  isDisabled={isBusyCard}
                  className="min-w-[64px] h-7 rounded-full bg-[#4f6ef7] text-white text-xs font-semibold hover:bg-[#425ad5] disabled:opacity-60"
                >
                  {installMut.isPending ? <span className="inline-flex items-center gap-1"><Spinner size="sm" color="current" />{t('market.installing')}</span> : t('market.install')}
                </Button>
              )}
          </div>
        </div>

        <CardDesc text={desc} />
        <CardShot plugin={p} onOpen={openLightbox} />
        {p.deprecated === true && (
          <div className="text-xs leading-[18px] text-amber-800 bg-[#fdf3e3] border border-[#f3e3c3] rounded-lg px-2.5 py-2 flex items-start gap-2">
            <TriangleExclamation className="size-3.5 mt-0.5 shrink-0" /> <span className="flex-1 min-w-0">⚠️ {t('market.deprecated.warn')} {replEntry && <a href={replEntry.url} target="_blank" rel="noreferrer" className="underline decoration-amber-300 hover:text-amber-900">{t('market.replacement')}: {replEntry.name}</a>}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center h-6 px-2 rounded bg-[#f3f4f6] border border-slate-200 text-slate-600 text-[11px] font-medium">{(registry as any)?.categories?.[p.category]?.[lang] ?? p.category}</span>
          <span className="flex-1" />
        </div>
      </div>
    )
  }

  // theme card mirrors discover but with theme-specific foot later; reuse pluginCard for installed themes
  function themePluginCard(p: any) {
    return pluginCard(p)
  }


  return (
    <div className="flex flex-col h-full min-w-0 text-slate-900 relative bg-[#fcfcfd]">
      {/* head — 1:1 from MarketSection.tsx .head */}
      <div className="flex flex-col gap-3 px-4 pt-2 pb-1.5 -mx-1 bg-white border-b border-slate-200/70">
        <div className="flex items-center gap-2.5">
          <MarketLogo size={22} />
          <h3 className="text-[16px] leading-6 font-medium m-0 tracking-tight text-slate-900">{t('market.title', { defaultValue: '插件市场' })}</h3>
          <a href="https://github.com/dsh-market/dsh-market" target="_blank" rel="noreferrer" title="dsh-market · GitHub" className="text-xs leading-5 text-[#8b93a1] no-underline hover:text-[#4f6ef7] hover:underline shrink-0">dsh-market</a>
          {version && <span className="text-xs leading-5 text-[#8b93a1] tabular-nums shrink-0" title={String(t('market.versionHint' as any))}>v{version}</span>}
          <span className="flex-1" />
          {(() => {
            const s = (updates as any)[selfName]
            const avail = !!(s && (s.updateAvailable || s.update_available))
            const done = updatedNames.includes(selfName) || updatedNames.includes(selfName.toLowerCase())
            if (!avail || done) return null
            const busy = updatingName !== null || isBusy
            return (
              <Button size="sm" isDisabled={!!busy} onPress={() => { setTab('installed'); void doUpdate(selfName) }} className="h-7 rounded-full bg-[#4f6ef7] text-white text-xs px-3">
                {updatingName === selfName ? t('market.updating') : t('market.marketUpdate' as any, { defaultValue: '升级市场' })}
              </Button>
            )
          })()}
          {updatableNames.length >= 2 && (
            <Button size="sm" isDisabled={!!updatingAll || !!updatingName || isBusy} onPress={() => { setTab('installed'); void doUpdateAll() }} className="h-7 rounded-full bg-[#4f6ef7] text-white text-xs px-3">
              {updatingAll ? t('market.updating') : `${t('market.updateAll' as any, { defaultValue: '全部更新' })} (${updatableNames.length})`}
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs leading-[18px] text-[#8b93a1]">
          <span>{t('market.subtitle')}</span>
          <a href="https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md" target="_blank" rel="noreferrer" className="text-[11px] text-[#8b93a1] no-underline hover:text-[#4f6ef7] hover:underline whitespace-nowrap">{t('market.submit', { defaultValue: '想要收录插件？' })}</a>
          <span className="flex-1" />
          <Button
            size="sm"
            variant="ghost"
            className="h-7 rounded-lg border border-slate-200 text-xs text-slate-600 hover:border-slate-300 hover:text-slate-900"
            onPress={() => toast('导出日志：请到 设置 → 运行日志 导出', { color: 'primary' } as any)}
          >
            {t('market.exportLog' as any, { defaultValue: '导出日志' })}
          </Button>
        </div>

        {/* tabs — .tabs */}
        <div className="flex gap-0.5 border-b border-slate-200 items-end -mb-1.5" role="tablist">
          <button
            role="tab"
            aria-selected={tab === 'discover'}
            onClick={() => setTab('discover')}
            className={tab === 'discover' ? 'border-0 bg-transparent text-[13px] px-3 py-[7px] cursor-pointer border-b-2 border-[#4f6ef7] text-[#4f6ef7] font-semibold -mb-px' : 'border-0 bg-transparent text-[13px] text-[#6b7280] px-3 py-[7px] cursor-pointer border-b-2 border-transparent hover:text-slate-900'}
          >
            {t('market.tab.discover')}
          </button>
          <button
            role="tab"
            aria-selected={tab === 'themes'}
            onClick={() => setTab('themes')}
            className={tab === 'themes' ? 'border-0 bg-transparent text-[13px] px-3 py-[7px] cursor-pointer border-b-2 border-[#4f6ef7] text-[#4f6ef7] font-semibold -mb-px' : 'border-0 bg-transparent text-[13px] text-[#6b7280] px-3 py-[7px] cursor-pointer border-b-2 border-transparent hover:text-slate-900'}
          >
            {t('market.tabThemes' as any, { defaultValue: '主题' })}
          </button>
          <button
            role="tab"
            aria-selected={tab === 'installed'}
            onClick={() => { setTab('installed'); void refreshInstalled() }}
            className={tab === 'installed' ? 'border-0 bg-transparent text-[13px] px-3 py-[7px] cursor-pointer border-b-2 border-[#4f6ef7] text-[#4f6ef7] font-semibold -mb-px inline-flex items-center gap-1.5' : 'border-0 bg-transparent text-[13px] text-[#6b7280] px-3 py-[7px] cursor-pointer border-b-2 border-transparent hover:text-slate-900 inline-flex items-center gap-1.5'}
          >
            {t('market.tab.installed')} {installedOtherCount > 0 ? `(${installedOtherCount})` : ''}
            {hasUpdates && <span className="size-1.5 rounded-full bg-red-500 inline-block ml-1" />}
          </button>
          <button
            role="tab"
            aria-selected={tab === 'backup' || tab === 'diagnostics'}
            onClick={() => { if (tab !== 'backup' && tab !== 'diagnostics') setTab('backup') }}
            className={tab === 'backup' || tab === 'diagnostics' ? 'border-0 bg-transparent text-[13px] px-3 py-[7px] cursor-pointer border-b-2 border-[#4f6ef7] text-[#4f6ef7] font-semibold -mb-px' : 'border-0 bg-transparent text-[13px] text-[#6b7280] px-3 py-[7px] cursor-pointer border-b-2 border-transparent hover:text-slate-900'}
          >
            {t('market.tabAdvanced' as any, { defaultValue: '高级' })}
          </button>
          <span className="flex-1" />
          {/* Operations entry placeholder — mirrors dsh-market OperationsPanel trigger */}
          <span className="inline-flex items-center gap-1 text-xs text-slate-500 pr-1 hidden sm:inline-flex">
            <span className="size-1.5 rounded-full bg-slate-300" /> {t('market.operations.title', { defaultValue: '操作队列' })}
          </span>
        </div>

        {/* subTabs under Advanced */}
        <If cond={tab === 'backup' || tab === 'diagnostics'}>
          <div className="flex gap-0.5 items-end -mt-1">
            <button onClick={() => setTab('backup')} className={tab === 'backup' ? 'border-0 bg-transparent text-[13px] px-3 py-[7px] cursor-pointer border-b-2 border-[#4f6ef7] text-[#4f6ef7] font-semibold -mb-px' : 'border-0 bg-transparent text-[13px] text-[#6b7280] px-3 py-[7px] cursor-pointer border-b-2 border-transparent'}>{t('market.tabBackup' as any, { defaultValue: '备份与恢复' })}</button>
            <button onClick={() => setTab('diagnostics')} className={tab === 'diagnostics' ? 'border-0 bg-transparent text-[13px] px-3 py-[7px] cursor-pointer border-b-2 border-[#4f6ef7] text-[#4f6ef7] font-semibold -mb-px' : 'border-0 bg-transparent text-[13px] text-[#6b7280] px-3 py-[7px] cursor-pointer border-b-2 border-transparent'}>{t('market.tab.diagnostics')}</button>
            <span className="flex-1" />
          </div>
        </If>

        {/* banners — 1:1 .banner stack（仅恢复更新相关三条，其余随 capability 逐步补齐） */}
        {buildsSkipped !== null && (
          <div className="flex items-center gap-2 bg-[#fdf3e3] border border-[#f3e3c3] rounded-lg px-3 py-2 text-xs">
            <TriangleExclamation className="size-3.5 shrink-0 text-amber-700" />
            <span className="flex-1 min-w-0">{t('market.buildsSkipped' as any, { defaultValue: '该插件需要运行构建脚本' })} {buildsSkipped.names.join(', ')}</span>
            <Button size="sm" isDisabled={!!isBusy} className="h-7 rounded-full bg-[#4f6ef7] text-white text-xs" onPress={() => {
              const { updateName, names, plugin } = buildsSkipped
              setBuildsSkipped(null)
              // 桌面侧 allowBuilds 透过 market_install 重试已在 Rust 侧自动处理；此处直接重试对应更新
              if (updateName) void doUpdate(updateName, true)
              else if (plugin) installMut.mutate(String((plugin as any).install ?? (plugin as any).name ?? names[0] ?? ''))
              else toast('已放行构建脚本，请重试', { color: 'primary' } as any)
            }}>{t('market.approveBuilds' as any, { defaultValue: '放行构建脚本并重试' })}</Button>
          </div>
        )}
        {compatibilityNotice !== null && (
          <div className="flex items-center gap-2 bg-[#fdf3e3] border border-[#f3e3c3] rounded-lg px-3 py-2 text-xs">
            <TriangleExclamation className="size-3.5 shrink-0 text-amber-700" />
            <span className="flex-1 min-w-0"><b>{t('market.compatRiskBanner' as any, { defaultValue: '检测到兼容性风险' })}</b> {String((compatibilityNotice as any).raw ?? (compatibilityNotice as any).risks?.[0]?.plugin ?? '')}</span>
            <Button size="sm" variant="ghost" className="h-7 rounded-full border border-slate-200 text-xs" onPress={() => setTab('diagnostics')}>{t('market.goDiagnose' as any, { defaultValue: '去诊断页修复' })}</Button>
            <Button size="sm" isDisabled={rollingBack} className="h-7 rounded-full bg-[#4f6ef7] text-white text-xs" onPress={() => void doRollback(String((compatibilityNotice as any).rollbackId ?? ''))}>{rollingBack ? t('market.rollingBack' as any, { defaultValue: '回滚中…' }) : t('market.rollbackNow' as any, { defaultValue: '一键回滚' })}</Button>
          </div>
        )}
        {installError !== null && (
          <div className="flex flex-col gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-xs text-red-700">
            <div className="flex items-start gap-2">
              <TriangleExclamation className="size-4 shrink-0 mt-0.5" />
              <span className="flex-1 min-w-0 break-all whitespace-pre-wrap">{installError}</span>
              <button onClick={() => setInstallError(null)} className="shrink-0 size-6 rounded-full hover:bg-red-100 grid place-items-center text-red-600"><Xmark className="size-3.5" /></button>
            </div>
            <div className="flex gap-2 flex-wrap">
              {staleName !== null && (
                <Button size="sm" className="h-7 rounded-full bg-[#4f6ef7] text-white text-xs" onPress={() => staleName && void doUpdate(staleName, true)}>{t('market.updateNow' as any, { defaultValue: '立即更新' })}</Button>
              )}
              <Button size="sm" variant="ghost" className="h-7 rounded-full border border-slate-200 bg-white text-xs text-slate-700" onPress={() => { void invoke('read_run_logs').then((txt: any) => { const blob=new Blob([String(txt)],{type:'text/plain'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='dsh-market-log.txt'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),2000) }).catch(()=>toast('导出失败', {color:'danger'} as any)) }}>{t('market.exportLog' as any, { defaultValue: '导出日志' })}</Button>
            </div>
          </div>
        )}
      </div>

      {/* body — .body */}
      <div
        ref={bodyRef}
        onScroll={e => setShowTop((e.currentTarget as HTMLDivElement).scrollTop > 400)}
        className="flex-1 overflow-y-auto overflow-x-hidden px-1 py-3 space-y-3 min-w-0"
      >
        <If cond={tab === 'discover'}>
          <Then>
            <If cond={registryLoading}>
              <Then>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
                  {Array.from({ length: 6 }).map((_, i) => (<SkeletonCard key={i} />))}
                </div>
              </Then>
              <Else>
                <If cond={!!registryError}>
                  <Then>
                    <div className="flex flex-col items-center gap-3 py-12 text-center">
                      <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{String(registryError)}</div>
                      <Button size="sm" variant="ghost" onPress={() => qc.invalidateQueries({ queryKey: ['market-registry'] })}>重试</Button>
                    </div>
                  </Then>
                  <Else>
                    <div ref={setCatsSentinel} />
                    {/* stickyHead */}
                    <div className="sticky top-[-1px] z-[5] bg-[#f7f8fa] -mx-1 px-1 pt-px">
                      {/* ::before strip is visual; emulate via extra top bg */}
                      <div className="absolute left-0 right-0 bottom-full h-3.5 bg-[#f7f8fa] pointer-events-none" aria-hidden="true" />
                      <div className="flex px-1 pb-1.5">
                        <div className="relative flex-1">
                          <Magnifier className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-[#8b93a1] pointer-events-none" />
                          <Input
                            value={q}
                            onChange={e => setQ((e.target as HTMLInputElement).value)}
                            placeholder={String(t('market.search.placeholder'))}
                            aria-label={String(t('market.search.placeholder'))}
                            className="pl-8 h-8 w-full bg-white border border-slate-200 rounded-lg text-sm"
                          />
                          {q && (
                            <button onClick={() => setQ('')} aria-label="clear" className="absolute right-1.5 top-1/2 -translate-y-1/2 size-6 grid place-items-center rounded-full text-[#8b93a1] hover:text-slate-700 cursor-pointer">
                              <Xmark className="size-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="px-1 pt-1 pb-1 -mx-1">
                        <div className="flex gap-2 items-start">
                          <div ref={catsWrapRef} className={visibleCats === null ? 'flex gap-1.5 flex-wrap flex-1 min-w-0 items-center max-h-[62px] overflow-hidden' : 'flex gap-1.5 flex-wrap flex-1 min-w-0 items-center'}>
                            {(() => {
                              const budget = catsStuck ? visibleCatsOneRow : visibleCats
                              const ordered = orderedCategories(categories, category, catsOpen, budget)
                              const shown = catsOpen || budget === null ? ordered : ordered.slice(0, Math.max(0, (budget ?? 12) - 1))
                              return (
                                <>
                                  <Pill active={category === 'all'} onClick={() => setCategory('all')}>{t('market.category.all')} ({formatCount((registry as any)?.count ?? 0)})</Pill>
                                  {shown.map((id: string) => (
                                    <Pill key={id} active={category === id} onClick={() => setCategory(id)}>{(registry as any)?.categories?.[id]?.[lang] ?? id}</Pill>
                                  ))}
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onPress={() => { catsAutoCollapsedRef.current = false; setCatsOpen(v => !v) }}
                                    className="h-[26px] min-h-[26px] px-2 text-[#6b7280] text-xs shrink-0"
                                  >
                                    {catsOpen ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                                    {catsOpen ? t('market.cats.less') : t('market.cats.more')}
                                  </Button>
                                </>
                              )
                            })()}
                          </div>
                          <FilterMenu sortField={sortField} sortDir={sortDir} timeRange={timeRange} onSortField={setSortField} onSortDir={setSortDir} onTimeRange={setTimeRange} t={t} />
                        </div>
                      </div>
                    </div>

                    <If cond={plugins.length === 0}>
                      <Then><div className="text-center text-sm text-[#9ca3af] py-12">{t('market.search.empty')}</div></Then>
                      <Else>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 items-start mt-2">
                          {pagePlugins.map((p: any) => pluginCard(p))}
                        </div>
                        <Pager currentPage={pagination.currentPage} totalPages={pagination.totalPages} pageSize={pagination.pageSize} onGoToPage={pagination.goToPage} onChangePageSize={pagination.changePageSize} t={t} />
                      </Else>
                    </If>
                  </Else>
                </If>
              </Else>
            </If>
          </Then>
        </If>

        <If cond={tab === 'themes'}>
          <Then>
            {/* themes mirrors discover but category locked to theme + no cats row */}
            <div className="flex px-1 pb-2">
              <div className="relative flex-1">
                <Magnifier className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-[#8b93a1] pointer-events-none" />
                <Input value={qThemes} onChange={e => setQThemes((e.target as HTMLInputElement).value)} placeholder={String(t('market.search.placeholder'))} className="pl-8 h-8 w-full bg-white border border-slate-200 rounded-lg text-sm" />
              </div>
            </div>
            <div className="flex justify-end px-1 pb-2">
              <FilterMenu sortField={themeSortField} sortDir={themeSortDir} timeRange={themeTimeRange} onSortField={setThemeSortField} onSortDir={setThemeSortDir} onTimeRange={setThemeTimeRange} t={t} />
            </div>
            <If cond={registryLoading}>
              <Then><div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">{Array.from({ length: 4 }).map((_, i) => (<SkeletonCard key={i} />))}</div></Then>
              <Else>
                <If cond={anyThemePlugins.length === 0}>
                  <Then><div className="text-center text-sm text-[#9ca3af] py-12">{t('market.themeEmpty' as any, { defaultValue: '目录中暂无主题' })}</div></Then>
                  <Else>
                    <If cond={themePlugins.length === 0}>
                      <Then><div className="text-center text-sm text-[#9ca3af] py-12">{t('market.search.empty')}</div></Then>
                      <Else>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 items-start">
                          {themePagePlugins.map((p: any) => themePluginCard(p))}
                        </div>
                        <Pager currentPage={themePagination.currentPage} totalPages={themePagination.totalPages} pageSize={themePagination.pageSize} onGoToPage={themePagination.goToPage} onChangePageSize={themePagination.changePageSize} t={t} />
                      </Else>
                    </If>
                  </Else>
                </If>
              </Else>
            </If>
          </Then>
        </If>

        <If cond={tab === 'installed'}>
          <Then>
            {/* viewBar + search — .viewBar / .tabSearchRow */}
            <div className="flex gap-0.5 items-center border border-slate-200 rounded-lg p-0.5 w-fit mb-3">
              <button onClick={() => setInstalledView('list')} className={installedView === 'list' ? 'px-3 py-1 rounded-md bg-[#eef0f4] text-slate-900 text-xs font-semibold' : 'px-3 py-1 rounded-md text-xs text-[#6b7280] hover:text-[#4f6ef7]'}>{t('market.tabList' as any, { defaultValue: '列表' })}</button>
              <button onClick={() => setInstalledView('groups')} className={installedView === 'groups' ? 'px-3 py-1 rounded-md bg-[#eef0f4] text-slate-900 text-xs font-semibold' : 'px-3 py-1 rounded-md text-xs text-[#6b7280] hover:text-[#4f6ef7]'}>{t('market.tabGroups' as any, { defaultValue: '分组' })}</button>
            </div>
            <div className="flex px-1 pb-2">
              <div className="relative flex-1">
                <Magnifier className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-[#8b93a1] pointer-events-none" />
                <Input value={qInstalled} onChange={e => setQInstalled((e.target as HTMLInputElement).value)} placeholder={String(t('market.search.placeholder'))} className="pl-8 h-8 w-full bg-white border border-slate-200 rounded-lg text-sm" />
                {qInstalled && <button onClick={() => setQInstalled('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 size-6 grid place-items-center rounded-full text-[#8b93a1] hover:text-slate-700"><Xmark className="size-3.5" /></button>}
              </div>
            </div>

            <If cond={installedView === 'groups'}>
              <Then>
                <div className="bg-white border border-slate-200 rounded-xl p-4 text-center text-sm text-slate-500">
                  分组功能（每组独立启用/停用）已在原版 dsh-market 中提供，桌面端预留 UI，执行层待对接 Rust market_groups 命令。
                </div>
                <div className="text-xs text-slate-500 mt-2 px-1">已安装仅用于展示：请在 列表 视图中管理，已安装 {installed.length} 个插件。</div>
              </Then>
              <Else>
                <If cond={installedLoading}>
                  <Then><div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">{Array.from({ length: 4 }).map((_, i) => (<div key={i} className="bg-white border border-slate-200 rounded-xl p-3 animate-pulse h-24" />))}</div></Then>
                  <Else>
                    <If cond={installed.length === 0}>
                      <Then><div className="text-center text-sm text-slate-500 py-12 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">{t('market.installed.empty')}</div></Then>
                      <Else>
                        {(() => {
                          const needle = qInstalled.trim().toLowerCase()
                          const filtered = installed.filter((p: any) => {
                            if (!needle) return true
                            const name = String((p as any).name ?? (p as any).id ?? '').toLowerCase()
                            if (name.includes(needle)) return true
                            const spec = String((p as any).id ?? '').toLowerCase()
                            if (spec.includes(needle)) return true
                            const desc = String((p as any).description ?? '').toLowerCase()
                            if (desc.includes(needle)) return true
                            return false
                          })
                          if (filtered.length === 0) return <div className="text-center text-sm text-[#9ca3af] py-12">{t('market.search.empty')}</div>
                          return (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 items-start">
                              {filtered.map((p: any) => {
                                const safeName = String((p as any).name ?? (p as any).id ?? '')
                                const ver = String((p as any).version ?? '')
                                const desc = String((p as any).description ?? '')
                                const repo = String((p as any).repo_url ?? (p as any).repoUrl ?? '')
                                const bundled = !!(p as any).bundled
                                const safeId = String((p as any).id ?? safeName)
                                const key = safeId.toLowerCase()
                                const status: any = (updates as any)[safeId] ?? (updates as any)[safeName] ?? (updates as any)[key] ?? null
                                const isUpdated = updatedNames.includes(safeId) || updatedNames.includes(safeName) || updatedNames.includes(key)
                                const isUpdating = updatingName !== null && updatingName.toLowerCase() === key
                                const isProtected = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@deepseek-ai/dsh-headless'].includes(key)
                                // progressPct 复用头部状态，行内仅文字+取消占位
                                return (
                                  <div key={(p as any).id ?? safeName} className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col gap-2.5 min-w-0">
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2">
                                        <span className="font-semibold text-[13px] text-slate-900 truncate flex-1 min-w-0" title={safeName}>{safeName} {ver && <span className="text-[11px] text-[#9ca3af] font-normal">v{ver}</span>} {bundled && <Chip size="sm" color="success" variant="soft" className="ml-1 text-[10px] h-5">{t('market.bundled')}</Chip>}</span>
                                        {/* 状态点：与原版 StateDot 对齐，简化为实心圆 */}
                                        <span className="size-2 rounded-full bg-emerald-500 shrink-0" title="live" />
                                      </div>
                                      <div className="text-[11px] text-[#9ca3af] font-mono truncate" title={repo}>{repo || specForInstalled(safeId, safeName)}</div>
                                      {desc && <div className="text-xs leading-[18px] text-[#6b7280] line-clamp-2 mt-1">{desc}</div>}
                                      {/* 行内 progress：与原版 .progress 对齐，仅在更新中显示 */}
                                      {isUpdating && (
                                        <div className="flex items-center gap-2 bg-[#f3f4f6] border border-slate-200 rounded-lg px-2.5 py-2 text-xs text-slate-600 mt-2">
                                          <Spinner size="sm" color="current" />
                                          <Button size="sm" variant="ghost" isDisabled className="h-6 px-2 text-xs" onPress={() => market.cancel().catch(()=>{})}>{t('market.cancelOp' as any, { defaultValue: '取消' })}</Button>
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-slate-100">
                                      {/* 左侧 stateTag 占位（与原版 irowActions 左组对齐） */}
                                      <span className="inline-flex items-center gap-1.5 h-5 px-2 rounded-full text-[11px] font-medium bg-[#f3f4f6] text-[#6b7280] border border-slate-200">
                                        <span className="size-1.5 rounded-full bg-emerald-500" />{t('market.switchOnLabel' as any, { defaultValue: '启用中' })}
                                      </span>
                                      <span className="flex-1" />
                                      {/* 右侧更新槽位 — 1:1 原版五态 */}
                                      {isUpdated ? (
                                        <span className="inline-flex items-center h-6 px-2.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200" title={String(t('market.updated' as any))}>{t('market.updated' as any, { defaultValue: '✓ 已更新，重启后生效' })}</span>
                                      ) : isUpdating ? (
                                        <Button size="sm" isDisabled className="h-7 rounded-full bg-amber-500 text-white text-xs px-3">{t('market.updating')}</Button>
                                      ) : status && (status.updateAvailable || status.update_available) ? (
                                        <Button size="sm" isDisabled={!!updatingName || !!updatingAll || isBusy} onPress={() => void doUpdate(safeId)} className="h-7 rounded-full bg-[#4f6ef7] text-white text-xs px-4 font-semibold">{t('market.update')}</Button>
                                      ) : status && status.kind === 'linked' ? (
                                        <span className="inline-flex items-center h-6 px-2.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200" title={String(t('market.linkedDev' as any))}>{t('market.linkedDev' as any, { defaultValue: '本地开发链接' })}</span>
                                      ) : (
                                        <span className="inline-flex items-center h-6 px-2.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200" title={String(t('market.upToDate' as any))}>{t('market.upToDate' as any, { defaultValue: '已是最新' })}</span>
                                      )}
                                      <If cond={!isProtected}>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          isDisabled={isBusy}
                                          onPress={() => handleUninstall(safeId)}
                                          className="h-7 px-3 rounded-full text-xs text-slate-600 hover:text-red-600 hover:bg-red-50 border border-transparent"
                                        >
                                          {pendingUninstall.has(key) ? <span className="inline-flex items-center gap-1"><Spinner size="sm" color="current" />{t('market.uninstalling')}</span> : t('market.uninstall')}
                                        </Button>
                                      </If>
                                      <Tooltip>
                                        <Button size="sm" variant="ghost" isIconOnly aria-label={t('market.repo')} onPress={() => repo && invoke('open_external_url', { url: repo }).catch(() => {})} className="rounded-full size-7 hover:bg-slate-100">
                                          <ArrowUpRightFromSquare className="size-3.5" />
                                        </Button>
                                        <Tooltip.Content>{repo}</Tooltip.Content>
                                      </Tooltip>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )
                        })()}
                      </Else>
                    </If>
                  </Else>
                </If>
              </Else>
            </If>
          </Then>
        </If>

        <If cond={tab === 'backup'}>
          <Then>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <section className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-3">
                <h3 className="text-sm font-semibold m-0">{t('market.backupLocal' as any, { defaultValue: '本地文件' })}</h3>
                <p className="text-xs leading-[18px] text-[#6b7280] m-0">{t('market.backupHint' as any, { defaultValue: '仅包含插件清单和配置' })}</p>
                <p className="text-xs leading-[18px] text-amber-700 m-0">⚠️ {t('market.credsWarning' as any, { defaultValue: '备份包含可能含密钥的文件' })}</p>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" onPress={() => market.backupExport().then((json) => {
                    const blob = new Blob([typeof json === 'string' ? json : JSON.stringify(json, null, 2)], { type: 'application/json' })
                    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'dsh-profile-backup.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000)
                  }).catch(e => toast(String(e), { color: 'danger' } as any))} className="rounded-full">导出备份</Button>
                  <Button size="sm" variant="ghost" className="rounded-full border border-slate-200" onPress={() => toast('导入：选择 JSON 文件后预览', { color: 'primary' } as any)}>导入并预览</Button>
                </div>
              </section>
              <section className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-3">
                <h3 className="text-sm font-semibold m-0">WebDAV</h3>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="ghost" className="rounded-full border border-slate-200 text-xs" onPress={() => toast('WebDAV 预设：坚果云 / Koofr / Nextcloud', { color: 'primary' } as any)}>服务商预设</Button>
                </div>
                <Input placeholder="备份文件 URL" className="h-8 text-sm" />
                <Input placeholder="用户名（可选）" className="h-8 text-sm" />
                <Input placeholder="密码（可选）" type="password" className="h-8 text-sm" />
                <div className="flex gap-2">
                  <Button size="sm" className="rounded-full">上传备份</Button>
                  <Button size="sm" variant="ghost" className="rounded-full border border-slate-200">从 WebDAV 恢复</Button>
                </div>
                <p className="text-xs text-amber-700 m-0">⚠️ 备份包含可能含密钥的文件，WebDAV 前请确认目标可信。</p>
              </section>
              <section className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-3 md:col-span-2">
                <h3 className="text-sm font-semibold m-0">GitHub Gist</h3>
                <Input placeholder="GitHub token（仅本次会话内存）" type="password" className="h-8 text-sm" />
                <Input placeholder="Gist ID 或链接（留空新建私有 Gist）" className="h-8 text-sm" />
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="ghost" className="rounded-full border border-slate-200">验证连接</Button>
                  <Button size="sm" className="rounded-full">导出到 Gist…</Button>
                  <Button size="sm" variant="ghost" className="rounded-full border border-slate-200">从 Gist 导入</Button>
                </div>
                <p className="text-xs text-[#6b7280] m-0">与本地导出不同，Gist 用于跨机器同步；Token 仅会话内存，不落盘；单文件上限 1 MB。</p>
              </section>
            </div>
          </Then>
        </If>

        <If cond={tab === 'diagnostics'}>
          <Then>
            <div className="flex flex-col gap-3">
              {/* summary strip — mirrors .diagSummary */}
              <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap items-center gap-3 text-xs">
                <span className="inline-flex items-center gap-1.5 text-[#6b7280]"><CircleInfo className="size-3.5" /> {check?.profile ?? 'profile: web'}</span>
                <span className="text-[#9ca3af] font-mono text-xs truncate max-w-[320px]">{check?.scannedAt ? new Date(check.scannedAt).toLocaleString() : ''}</span>
                <span className="ml-auto inline-flex items-center gap-1.5">
                  <span className={(check as any)?.summary?.ok ?? (check as any)?.ok ? 'inline-flex items-center gap-1 h-6 px-2.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200' : 'inline-flex items-center gap-1 h-6 px-2.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200'}>
                    {(check as any)?.summary?.ok ?? (check as any)?.ok ? <Check className="size-3.5" /> : <TriangleExclamation className="size-3.5" />} {(check as any)?.summary?.ok ?? (check as any)?.ok ? t('market.diagnostics.ok') : `${((check as any)?.summary?.errors ?? (check as any)?.errors?.length ?? 0) + (check?.duplicates?.length ?? 0)} issues`}
                  </span>
                  <Button size="sm" variant="ghost" isIconOnly aria-label="refresh" onPress={() => refetchCheck()} isDisabled={!!checkLoading} className="size-7 rounded-lg border border-slate-200"><Copy className="size-3.5 rotate-90" /></Button>
                </span>
              </div>

              <If cond={!!check && ((check.errors?.length ?? 0) > 0 || (check.warnings?.length ?? 0) > 0)}>
                <div className="flex flex-col gap-2">
                  {((check as any)?.summary?.errors ?? (check as any)?.errors ?? []).map((e: string, i: number) => (<div key={'e' + i} role="alert" className="flex gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5"><TriangleExclamation className="size-4 shrink-0 mt-0.5" /><span className="break-all font-mono">{String(e)}</span></div>))}
                  {((check as any)?.summary?.warnings ?? (check as any)?.warnings ?? []).map((w: string, i: number) => (<div key={'w' + i} className="flex gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5"><CircleInfo className="size-4 shrink-0 mt-0.5" /><span className="break-all font-mono">{String(w)}</span></div>))}
                </div>
              </If>

              <If cond={checkLoading}>
                <Then><div className="flex items-center gap-2 text-sm text-slate-600 p-6 bg-white border border-slate-200 rounded-xl"><Spinner size="sm" />{t('market.loading')}</div></Then>
                <Else>
                  <If cond={!check}>
                    <Then><div className="text-sm text-slate-500 p-8 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/50">{t('market.loading')}</div></Then>
                    <Else>
                      <Surface className="p-4 flex flex-col gap-3 rounded-xl border-slate-200">
                        <div className="flex items-center gap-2"><h5 className="text-sm font-semibold">Bundles</h5><span className="text-xs px-2 py-1 rounded-full bg-slate-100 border border-slate-200 tabular-nums">{(check?.bundles ?? []).length} layer{(check?.bundles ?? []).length === 1 ? '' : 's'}</span><span className="ml-auto text-xs px-2 py-1 rounded-full bg-slate-900 text-white tabular-nums">{(check?.rows ?? []).length} rows</span></div>
                        <If cond={(check?.bundles ?? []).length === 0}>
                          <Then><div className="text-sm text-slate-500 py-6 text-center border border-dashed rounded-xl">— No bundle layers</div></Then>
                          <Else>
                            <div className="flex flex-col gap-3">
                              {(check?.bundles ?? []).map((b: any, idx: number) => (
                                <div key={idx} className="border border-slate-200 rounded-xl p-3 bg-slate-50/50 flex flex-col gap-2">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-semibold">{String(b.name)}</span>
                                    <Chip size="sm" variant="soft" color={b.kind === 'official' ? 'default' : 'accent'}>{String(b.kind)}</Chip>
                                    <span className="text-xs font-mono text-slate-500 bg-white border border-slate-200 rounded-full px-2 py-1 truncate max-w-[180px]" title={String(b.source)}>{String(b.source)}</span>
                                    <span className="ml-auto text-xs font-mono px-2.5 py-1 rounded-full bg-slate-900 text-white">{(b.entries ?? []).length} entries</span>
                                  </div>
                                  <If cond={!!b.directory}><div className="text-xs font-mono text-slate-600 bg-white border border-slate-200 rounded-lg px-2.5 py-2 break-all">dir: {String(b.directory)}</div></If>
                                  <If cond={!!b.patch_path}><div className="text-xs font-mono text-slate-600 bg-white border border-slate-200 rounded-lg px-2.5 py-2 break-all">patch: {String(b.patch_path)}</div></If>
                                  <If cond={!!b.parse_error}><div role="alert" className="flex gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5"><TriangleExclamation className="size-4 shrink-0" /><span className="break-all font-mono">{String(b.parse_error)}</span></div></If>
                                  <If cond={(b.entries ?? []).length > 0}>
                                    <div className="flex flex-wrap gap-1.5 pt-1">
                                      {(b.entries ?? []).slice(0, 24).map((e: string, i: number) => (<span key={i} className="text-xs font-mono bg-white border border-slate-200 rounded-full px-2.5 py-1">{String(e)}</span>))}
                                      <If cond={(b.entries ?? []).length > 24}><span className="text-xs text-slate-500 self-center">+{(b.entries ?? []).length - 24} more</span></If>
                                    </div>
                                  </If>
                                </div>
                              ))}
                            </div>
                          </Else>
                        </If>
                      </Surface>

                      <Surface className="p-4 flex flex-col gap-3 rounded-xl border-slate-200">
                        <div className="flex items-center gap-2"><h5 className="text-sm font-semibold">{t('market.diagnostics.duplicates')}</h5><span className="ml-auto min-w-6 h-6 px-2 rounded-full bg-slate-900 text-white text-xs font-semibold grid place-items-center">{(check?.duplicates ?? []).length}</span></div>
                        <If cond={(check?.duplicates ?? []).length === 0}>
                          <Then><div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-3"><Check className="size-4" /> {t('market.diagnostics.clean')}</div></Then>
                          <Else>
                            <div className="flex flex-col gap-2">
                              {(check?.duplicates ?? []).map((d: any) => (
                                <div key={String(d.id)} className="flex items-center gap-3 pl-3 pr-3 py-3 border-l-4 border-amber-400 bg-amber-50 rounded-r-xl">
                                  <span className="font-mono text-sm font-semibold text-amber-900 truncate flex-1">{String(d.id)}</span>
                                  <span className="shrink-0 inline-flex items-center justify-center h-6 px-2 rounded-full bg-amber-900 text-white text-xs font-bold">×{String(d.count)}</span>
                                </div>
                              ))}
                            </div>
                          </Else>
                        </If>
                      </Surface>

                      <Surface className="p-4 flex flex-col gap-3 rounded-xl border-slate-200">
                        <div className="flex items-center gap-2"><h5 className="text-sm font-semibold">Patches</h5><span className="text-xs font-mono text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-2 py-1">orphans {(check?.orphans ?? []).length} · overrides {(check?.overrides ?? []).length} · duplicateNames {(check?.duplicateNames ?? []).length}</span></div>
                        <If cond={(check?.orphans ?? []).length > 0}>
                          <div className="flex flex-col gap-2"><span className="text-xs font-semibold text-amber-800 flex items-center gap-1.5"><TriangleExclamation className="size-3.5" /> Orphans</span>{(check?.orphans ?? []).map((m: any, i: number) => (<div key={i} className="text-xs font-mono text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 break-all">{String(m)}</div>))}</div>
                        </If>
                        <If cond={(check?.overrides ?? []).length > 0}>
                          <div className="flex flex-col gap-2"><span className="text-xs font-semibold text-slate-700">Overrides</span>{(check?.overrides ?? []).map((m: any, i: number) => (<div key={i} className="text-xs font-mono text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 break-all">{String(m)}</div>))}</div>
                        </If>
                        <If cond={(check?.orphans ?? []).length === 0 && (check?.overrides ?? []).length === 0 && (check?.duplicateNames ?? []).length === 0}>
                          <div className="text-sm text-slate-500 py-2 flex items-center gap-2"><Check className="size-4 text-emerald-600" /> No orphan or override issues</div>
                        </If>
                      </Surface>

                      <Surface className="p-4 flex flex-col gap-3 rounded-xl border-slate-200">
                        <div className="flex items-center gap-2"><h5 className="text-sm font-semibold">{t('market.diagnostics.peer')}</h5><span className="ml-auto min-w-6 h-6 px-2 rounded-full bg-slate-900 text-white text-xs font-semibold grid place-items-center">{(check?.peerMismatches ?? []).length}</span></div>
                        <If cond={(check?.peerMismatches ?? []).length === 0}>
                          <Then><div className="text-sm text-slate-500 flex items-center gap-2"><Check className="size-4 text-emerald-600" /> No peer conflicts</div></Then>
                          <Else><div className="flex flex-col gap-2">{(check?.peerMismatches ?? []).map((m: any, i: number) => (<div key={i} className="text-xs font-mono text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 break-all">{String(m)}</div>))}</div></Else>
                        </If>
                        <div className="flex items-center gap-2 pt-3 border-t border-slate-200"><h5 className="text-sm font-semibold">Multi-Version</h5><span className="ml-auto min-w-6 h-6 px-2 rounded-full bg-slate-100 border border-slate-200 text-xs font-semibold grid place-items-center">{(check?.multiVersion ?? []).length}</span></div>
                        <If cond={(check?.multiVersion ?? []).length === 0}>
                          <Then><div className="text-sm text-slate-500 flex items-center gap-2"><Check className="size-4 text-emerald-600" /> No multi-version core packages</div></Then>
                          <Else><div className="flex flex-col gap-2">{(check?.multiVersion ?? []).map((m: any, i: number) => (<div key={i} className="text-xs font-mono text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 break-all">{String(m)}</div>))}</div></Else>
                        </If>
                      </Surface>
                    </Else>
                  </If>
                </Else>
              </If>
            </div>
          </Then>
        </If>
      </div>

      {/* confirm install dialog — mirrors MarketSection confirm Modal */}
      {confirming && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setConfirming(null)} />
          <div className="relative bg-white rounded-2xl border border-slate-200 shadow-xl max-w-[560px] w-full max-h-[85vh] overflow-y-auto p-5 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <h4 className="text-sm font-semibold m-0">{t('market.confirmTitle' as any, { defaultValue: '安装' })} {confirming.name}?</h4>
              <button onClick={() => setConfirming(null)} className="size-7 rounded-full hover:bg-slate-100 grid place-items-center text-slate-500"><Xmark className="size-4" /></button>
            </div>
            <div className="flex items-center gap-2">
              <OwnerAvatar name={String(confirming.name)} owner={String(confirming.owner ?? '')} />
              <span className="text-xs text-[#9ca3af]">{String(confirming.owner ?? '')}</span>
              <span className="flex-1" />
              <span className="text-xs px-2 py-1 rounded-full bg-slate-100 border border-slate-200">{(registry as any)?.categories?.[confirming.category]?.[lang] ?? confirming.category}</span>
            </div>
            {confirming.added && <div className="text-[11px] text-[#9ca3af]">{t('market.published' as any, { defaultValue: '发布于' })} {String(confirming.added)}</div>}
            <CardDesc text={String((confirming.description?.[lang] ?? confirming.description?.en ?? ''))} />
            <ScreenshotStrip plugin={confirming} onOpen={openLightbox} />
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-mono text-[11px] break-all">{String(confirming.install ?? '')}</div>
            <p className="text-xs text-amber-700 flex items-center gap-1 m-0">⚠️ {String(t('market.confirmWarn' as any, { defaultValue: '插件是社区第三方代码' }))}</p>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 mt-1">
              <Button variant="ghost" size="sm" onPress={() => setConfirming(null)} className="rounded-full">{t('market.cancel')}</Button>
              <Button size="sm" onPress={() => confirming && installMut.mutate(String(installTargetFor({ url: String(confirming.url ?? ''), npm: (confirming as any).npm }) || confirming.install || confirming.name))} isDisabled={installMut.isPending} className="rounded-full bg-[#4f6ef7] text-white">
                {installMut.isPending ? <span className="inline-flex items-center gap-1"><Spinner size="sm" color="current" />{t('market.installing')}</span> : t('market.confirm')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* lightbox */}
      {lightbox && (
        <ScreenshotLightbox shots={lightbox.shots} startIndex={lightbox.index} onClose={() => setLightbox(null)} t={t} />
      )}

      {/* back-to-top — .top */}
      {showTop && (
        <button
          aria-label={String(t('market.backTop' as any, { defaultValue: '回到顶部' }))}
          onClick={() => bodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' as any })}
          className="absolute right-4 bottom-4 z-20 size-9 rounded-full bg-white border border-slate-200 shadow-lg grid place-items-center text-slate-600 hover:text-slate-900 hover:border-slate-300 cursor-pointer"
        >
          <ChevronUp className="size-4" />
        </button>
      )}
    </div>
  )
}
