/**
 * UI 侧后端客户端 — Node 驱动
 * 流程：Tauri 前端页 → market 兼容层(fetch) → dsh-market 源码(Node HTTP)
 * 不经 Rust 业务 invoke，Rust 仅作 Node 进程管家 + CSP 放行
 */
import type { CheckReport, Registry, UpdateStatus } from './types.ts'

const SIDECAR_PORT = 3099
// Harness 实际端口可能是 Setting 里的 3080/3081，也可能是运行时动态的 3011（见 workflow 日志 pid=53220 port=3011）
const HARNESS_PORTS = [3080, 3081, 3011]

const LOG_PREFIX = '[market-compat]'
function log(level: 'info' | 'warn' | 'error', msg: string, extra?: unknown) {
  const line = `${LOG_PREFIX} ${msg}`
  if (level === 'error') console.error(line, extra ?? '')
  else if (level === 'warn') console.warn(line, extra ?? '')
  else console.log(line, extra ?? '')
}

function sidecarUrl(path: string): string {
  return `http://127.0.0.1:${SIDECAR_PORT}${path}`
}

function harnessUrl(path: string, port: number): string {
  return `http://127.0.0.1:${port}${path}`
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const method = init?.method ?? 'GET'
  log('info', `→ ${method} ${url}`)
  const t0 = performance.now()
  const res = await fetch(url, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  })
  const dt = (performance.now() - t0).toFixed(0)
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    log('warn', `✗ ${method} ${url} → ${res.status} ${dt}ms`, txt.slice(0, 300))
    throw new Error(`FETCH_${res.status}: ${url} ${txt.slice(0, 300)}`)
  }
  const data = (await res.json()) as T
  const size = JSON.stringify(data).length
  log('info', `✓ ${method} ${url} → ${res.status} ${dt}ms ${size}B`)
  return data
}

// 依次尝试：sidecar → harness(3080) → harness(3081)
// 仅在网络层失败（Failed to fetch）时回退；HTTP 4xx/5xx 是业务响应，不回退，避免掩盖真实错误
async function tryFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const urls = [sidecarUrl(path), ...HARNESS_PORTS.map(p => harnessUrl(path, p))]
  let lastErr: unknown
  for (const u of urls) {
    try {
      return await fetchJson<T>(u, init)
    } catch (e) {
      const msg = String(e)
      if (msg.includes('FETCH_')) throw e
      lastErr = e
    }
  }
  throw lastErr
}

// registry 额外回退：直连远端（无本地服务时 dev 可用）
async function fetchRegistryDirect(): Promise<Registry> {
  const url = 'https://awesome-dsh-plugin.com/plugins.json'
  log('info', `fallback direct ${url}`)
  const t0 = performance.now()
  const res = await fetch(url, { headers: { accept: 'application/json' } })
  if (!res.ok) {
    log('error', `direct registry → ${res.status}`)
    throw new Error(`REMOTE_${res.status}`)
  }
  const j = await res.json()
  const dt = (performance.now() - t0).toFixed(0)
  log('info', `direct registry ✓ ${dt}ms count=${(j as any)?.count ?? (Array.isArray(j) ? j.length : '?')}`)
  if (j && typeof j === 'object' && 'plugins' in j) return j as Registry
  if (Array.isArray(j)) return { count: j.length, categories: {}, plugins: j } as unknown as Registry
  throw new Error('REMOTE_BAD_SHAPE')
}

const mockCheck: CheckReport = {
  profile: 'web',
  scannedAt: Date.now(),
  bundles: [],
  rows: [],
  duplicates: [],
  duplicateNames: [],
  overrides: [],
  orphans: [],
  peerMismatches: [],
  multiVersion: [],
  orderConflicts: [],
  suggestedOrder: null,
  summary: { ok: true, errors: [], warnings: [] },
} as unknown as CheckReport

export const market = {
  loadRegistry(): Promise<Registry> {
    log('info', 'market.loadRegistry()')
    return tryFetch<Registry>('/dsh-market/registry')
      .then(r => {
        log('info', `loadRegistry ok count=${(r as any)?.count} plugins=${(r as any)?.plugins?.length}`)
        return r
      })
      .catch(e => {
        log('warn', 'loadRegistry sidecar/harness failed, fallback direct', String(e).slice(0, 300))
        return fetchRegistryDirect()
      })
  },
  readInstalled(): Promise<Record<string, string>> {
    log('info', 'market.readInstalled()')
    return tryFetch<Record<string, string>>('/dsh-market/installed')
      .then(r => {
        if (r && typeof r === 'object' && 'installed' in r) {
          const v = (r as unknown as { installed: Record<string, string> }).installed
          log('info', `readInstalled ok ${Object.keys(v).length} pkgs`)
          return v
        }
        log('info', `readInstalled ok ${Object.keys(r as object).length} pkgs`)
        return r
      })
      .catch(e => {
        log('warn', 'readInstalled failed, return empty', String(e).slice(0, 200))
        return {}
      })
  },
  check(): Promise<CheckReport> {
    log('info', 'market.check()')
    return tryFetch<CheckReport>('/dsh-market/check')
      .then(r => {
        log('info', `check ok bundles=${(r as any)?.bundles?.length} rows=${(r as any)?.rows?.length}`)
        return r
      })
      .catch(e => {
        log('warn', 'check failed, return mock empty', String(e).slice(0, 200))
        return mockCheck
      })
  },
  install(specs: string[]): Promise<void> {
    log('info', `market.install ${JSON.stringify(specs).slice(0, 400)}`)
    return tryFetch<{ ok?: boolean; error?: string; stderr?: string; stdout?: string }>('/dsh-market/install', {
      method: 'POST',
      body: JSON.stringify({ specs, spec: specs[0] }),
    }).then(r => {
      // wrapper 始终 200，用 ok 区分；兼容旧 harness 直接 void
      if (r && typeof r === 'object' && 'ok' in r && (r as { ok: boolean }).ok === false) {
        const msg = (r as { error?: string; stderr?: string }).error ?? (r as { stderr?: string }).stderr ?? 'install failed'
        log('error', `install failed exit`, msg.slice(0, 500))
        throw new Error(msg)
      }
      log('info', 'install ok')
    })
  },
  uninstall(ids: string[]): Promise<void> {
    const name = ids[0] ?? ''
    return tryFetch<{ ok?: boolean; error?: string; stderr?: string; stdout?: string }>('/dsh-market/uninstall', {
      method: 'POST',
      body: JSON.stringify({ ids, name, id: name }),
    }).then(r => {
      if (r && typeof r === 'object' && 'ok' in r && (r as { ok: boolean }).ok === false) {
        const msg = (r as { error?: string; stderr?: string }).error ?? (r as { stderr?: string }).stderr ?? 'uninstall failed'
        log('error', `uninstall failed`, msg.slice(0, 500))
        throw new Error(msg)
      }
      log('info', 'uninstall ok')
    })
  },
  update(ids: string[], opts?: { force?: boolean }): Promise<{ ok: boolean; stale?: boolean; ignoredBuilds?: unknown; stderr?: string; stdout?: string; exitCode?: number }> {
    log('info', `market.update ${JSON.stringify(ids).slice(0, 400)} force=${opts?.force ?? false}`)
    const name = ids[0] ?? ''
    if (!name) return Promise.reject(new Error('missing name'))
    return tryFetch<{ ok?: boolean; error?: string; stderr?: string; stdout?: string; exitCode?: number; stale?: boolean; ignoredBuilds?: unknown }>('/dsh-market/update', {
      method: 'POST',
      body: JSON.stringify({ name, ids, id: name, force: !!opts?.force }),
    }).then(r => {
      if (r && typeof r === 'object' && 'ok' in r && (r as { ok: boolean }).ok === false) {
        // 将 stale/ignoredBuilds 也带在错误上，供 UI 分支
        const msg = (r as { error?: string; stderr?: string }).error ?? (r as { stderr?: string }).stderr ?? 'update failed'
        const err: any = new Error(msg)
        if ((r as any).stale) err.stale = true
        if ((r as any).ignoredBuilds) err.ignoredBuilds = (r as any).ignoredBuilds
        if ((r as any).stderr) err.stderr = (r as any).stderr
        log('error', `update failed`, msg.slice(0, 500))
        throw err
      }
      // 成功也透出 stale/ignoredBuilds，供上层无需抛错也能判
      if (r && typeof r === 'object' && (r as any).stale) {
        log('warn', `update stale name=${name}`)
      }
      if (r && typeof r === 'object' && (r as any).ignoredBuilds) {
        log('warn', `update ignoredBuilds name=${name}`)
      }
      log('info', 'update ok')
      return r as any
    })
  },
  cancel(): Promise<void> {
    return tryFetch<void>('/dsh-market/cancel', { method: 'POST', body: '{}' })
  },
  updates(): Promise<Record<string, UpdateStatus>> {
    log('info', 'market.updates()')
    return tryFetch<Record<string, UpdateStatus>>('/dsh-market/updates')
      .then(r => {
        log('info', `updates ok ${Object.keys(r).length} entries`)
        return r
      })
      .catch(e => {
        log('warn', 'updates failed, return empty', String(e).slice(0, 200))
        return {}
      })
  },
  backupExport(): Promise<string> {
    log('info', 'market.backupExport()')
    return tryFetch<{ data: string } | string>('/dsh-market/backup', {
      method: 'POST',
      body: JSON.stringify({ action: 'export' }),
    }).then(r => (typeof r === 'string' ? r : JSON.stringify(r)))
  },
  backupImport(data: string): Promise<void> {
    log('info', `market.backupImport ${data.length}B`)
    return tryFetch<void>('/dsh-market/backup', {
      method: 'POST',
      body: JSON.stringify({ action: 'import', data }),
    })
  },
}
