#!/usr/bin/env node
/**
 * DesktopHost - dsh-market 宿主替换 (Scheme C)
 * 后端 0 改：直接复用 packages/dsh-market/lib/routes.js 的 mountMarketRoutes
 * 宿主从 dsh(cordis) 换为 desktop(Node http)，独立于 dsh web 进程
 */
import http from 'node:http'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
const PORT = Number(process.env.MARKET_PORT || 3082)
const PROFILE = process.env.DSH_PROFILE || 'web'
// 复用桌面与官方一致的 DSH_HOME 解析
function dshDataDir() {
  const env = process.env.DSH_HOME
  if (env && env.trim()) return env
  return join(homedir(), '.dsh')
}
const profileDir = join(dshDataDir(), 'profiles', PROFILE)

// 动态导入编译后的 market 路由（保持后端 0 改）
const { mountMarketRoutes } = await import('../dsh-market/lib/routes.js')

// 最小 MarketHost 实现：仅 webServer + loader + on + logger
// 参考 src/index.ts:MarketHost 与 src/routes.ts:MarketHost
const routes = [] // {kind, path, handler, dispose?}

const host = {
  webServer: {
    register(route) {
      routes.push(route)
      return () => {
        const idx = routes.indexOf(route)
        if (idx !== -1) routes.splice(idx, 1)
      }
    },
  },
  loader: {
    entries() {
      // 返回空：themes/client-only 逻辑会自行扫描 node_modules
      return []
    },
  },
  // cordis 插件生命周期：market 会监听 internal/plugin 做热禁用回补，无此事件仅丢失次要能力
  on() {
    return () => {}
  },
  logger: {
    info(msg) { console.log(`[market] ${msg}`) },
    warn(msg) { console.warn(`[market:warn] ${msg}`) },
  },
  // desktopProfiles 缺席时走普通 DSH 分支（见 index.ts:63）
  // 如需走 Desktop 分支，可在此注入 desktopProfiles/desktopPnpm
}

const config = {
  profile: PROFILE,
  // Host-authoritative 目录：与 src-tauri/src/config/runtime.rs:get_dsh_data_path() 一致
  profileDirectory: profileDir,
  allowRestart: false, // 桌面接管重启，market 不直接拉起新进程
}

// 挂载所有 /dsh-market/* 路由（后端 0 改）
let disposeRoutes
try {
  disposeRoutes = mountMarketRoutes(host, config, undefined, undefined)
  console.log(`[DesktopHost] dsh-market mounted for profile=${PROFILE} dir=${profileDir} routes=${routes.length}`)
} catch (e) {
  console.error('[DesktopHost] mount failed', e)
  process.exit(1)
}

// HTTP 分发：精确匹配 + 前缀匹配
function matchRoute(pathname) {
  // exact 优先
  for (const r of routes) {
    if (r.kind === 'exact' && r.path === pathname) return r
  }
  for (const r of routes) {
    if (r.kind === 'prefix' && pathname.startsWith(r.path)) return r
  }
  return null
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`)
  const pathname = url.pathname

  // 健康探针（桌面侧检测 sidecar 存活，不经 market 路由）
  if (pathname === '/__market_health') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true, profile: PROFILE, routes: routes.length }))
    return
  }

  // 静态：独立市场 UI（A 路径：iframe 可直接逛）
  if (req.method === 'GET' && (pathname === '/' || pathname === '/market' || pathname === '/market/')) {
    try {
      const htmlPath = new URL('./standalone.html', import.meta.url)
      const html = readFileSync(htmlPath, 'utf8')
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
      res.end(html)
      return
    } catch (e) {
      res.writeHead(500, { 'content-type': 'text/plain' })
      res.end('standalone.html missing: ' + String(e))
      return
    }
  }
  // 静态：dsh-market 资产（如需要）
  if (pathname.startsWith('/assets/')) {
    try {
      const assetPath = join(profileDir, '..', '..', '..', 'packages/dsh-market', pathname.replace(/^\//, ''))
      // 回退：相对 host.mjs 的包路径
      const tryPaths = [
        new URL('../dsh-market' + pathname, import.meta.url),
        new URL('../../packages/dsh-market' + pathname, import.meta.url),
      ]
      for (const p of tryPaths) {
        try {
          const data = readFileSync(p)
          const ext = pathname.split('.').pop()
          const ct = ext === 'svg' ? 'image/svg+xml' : ext === 'png' ? 'image/png' : 'application/octet-stream'
          res.writeHead(200, { 'content-type': ct, 'cache-control': 'public, max-age=86400' })
          res.end(data)
          return
        } catch {}
      }
    } catch {}
  }

  const route = matchRoute(pathname)
  if (!route) {
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'not found', path: pathname }))
    return
  }

  try {
    const maybePromise = route.handler(req, res)
    if (maybePromise && typeof maybePromise.then === 'function') {
      maybePromise.catch((err) => {
        console.error('[route error]', route.path, err)
        if (!res.headersSent) {
          res.writeHead(500, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: String(err?.message || err) }))
        }
      })
    }
  } catch (err) {
    console.error('[route sync error]', route.path, err)
    if (!res.headersSent) {
      res.writeHead(500, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: String(err?.message || err) }))
    }
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[DesktopHost] listening http://127.0.0.1:${PORT} (independent of dsh:${process.env.DSH_PORT || 3080})`)
  // 通知父进程（Tauri sidecar 管理）就绪
  if (process.send) process.send({ type: 'ready', port: PORT })
})

function shutdown() {
  console.log('[DesktopHost] shutting down')
  try { disposeRoutes?.() } catch {}
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 3000).unref()
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
process.on('message', (msg) => {
  if (msg && msg.type === 'shutdown') shutdown()
})

// 确保 profile 目录存在（dsh 未安装时也能浏览）
import { mkdirSync } from 'node:fs'
try {
  if (!existsSync(profileDir)) {
    console.log(`[DesktopHost] profile dir missing, creating ${profileDir}`)
    mkdirSync(profileDir, { recursive: true })
  }
} catch {}
