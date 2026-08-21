/**
 * market sidecar — Node 驱动的 dsh-market 后端
 * 由 Rust 仅作进程管家拉起 (CREATE_NEW_CONSOLE+SW_HIDE)，业务 100% 在 Node
 * 直接 import packages/dsh-market/src/* 原代码，不经 Rust 业务层
 *
 * 启动: node --experimental-strip-types wrapper.mjs --port 3099 --profile-dir <path> [--dsh-bin <path>]
 */

import http from 'node:http'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { loadRegistry } from '../dsh-market/src/registry.ts'
import { readInstalled, setAllowBuilds } from '../dsh-market/src/profile.ts'
import { analyzeProfile } from '../dsh-market/src/check.ts'
import { checkUpdates } from '../dsh-market/src/updates.ts'

const args = process.argv.slice(2)
const portIdx = args.indexOf('--port')
const port = portIdx >= 0 ? Number(args[portIdx + 1]) : 3099
const dirIdx = args.indexOf('--profile-dir')
const profileDir = dirIdx >= 0 ? args[dirIdx + 1] : undefined
const dshBinIdx = args.indexOf('--dsh-bin')
const dshBin = dshBinIdx >= 0 ? args[dshBinIdx + 1] : undefined
const profileName = 'web'

const LOG_PREFIX = '[market-sidecar]'
function ts() { return new Date().toISOString().slice(11, 23) }
function log(level, msg, extra) {
  const line = `${ts()} ${LOG_PREFIX} ${msg}`
  if (level === 'error') console.error(line, extra ?? '')
  else if (level === 'warn') console.warn(line, extra ?? '')
  else console.log(line, extra ?? '')
}

function json(res, code, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' })
  res.end(body)
}

function nodeExe() {
  const a0 = process.argv0
  if (a0 && a0 !== '' && existsSync(a0)) return a0
  return process.execPath
}

async function probePnpm() {
  return new Promise(resolve => {
    const child = spawn('pnpm', ['--version'], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, CI: 'true' } })
    let out = ''
    child.stdout?.on('data', c => { out += c.toString() })
    child.stderr?.on('data', c => { out += c.toString() })
    child.on('error', err => resolve({ ok: false, output: err.message }))
    child.on('close', code => resolve({ ok: code === 0, output: out.trim().slice(-2000) }))
    setTimeout(() => { try { child.kill() } catch {} ; resolve({ ok: false, output: out + '\ntimeout' }) }, 5000)
  })
}

function diagnoseProfileDir(dir) {
  if (!dir) return 'profileDir=undefined'
  try {
    const files = readdirSync(dir).slice(0, 20).join(', ')
    const pkg = existsSync(join(dir, 'package.json')) ? 'package.json:yes' : 'package.json:no'
    const lock = existsSync(join(dir, 'pnpm-lock.yaml')) ? 'pnpm-lock:yes' : 'pnpm-lock:no'
    const ws = existsSync(join(dir, 'pnpm-workspace.yaml')) ? 'ws:yes' : 'ws:no'
    return `files=[${files}] ${pkg} ${lock} ${ws}`
  } catch (e) {
    return `diagnose fail: ${String(e).slice(0, 200)}`
  }
}

function runDshPlugin(pluginArgs) {
  return new Promise(resolve => {
    const useDshBin = dshBin && existsSync(dshBin)
    const file = useDshBin ? nodeExe() : 'dsh'
    const fileArgs = useDshBin
      ? [...process.execArgv, dshBin, 'plugin', '--profile', profileName, ...pluginArgs]
      : ['plugin', '--profile', profileName, ...pluginArgs]
    const viaShell = !useDshBin && process.platform === 'win32'
    const env = { ...process.env, CI: 'true' }
    log('info', `spawn ${file} ${fileArgs.join(' ')} viaShell=${viaShell}`)
    let child
    if (viaShell) {
      const comspec = process.env.ComSpec ?? 'cmd.exe'
      const quote = (s) => /[\s"&|<>^()%!]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
      const cmdLine = `"${[file, ...fileArgs].map(quote).join(' ')}"`
      child = spawn(comspec, ['/d', '/s', '/c', cmdLine], {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } else {
      child = spawn(file, fileArgs, { env, stdio: ['ignore', 'pipe', 'pipe'] })
    }
    let stdout = '', stderr = ''
    const timer = setTimeout(() => {
      try {
        if (child.pid) {
          if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
          else child.kill('SIGKILL')
        }
      } catch {}
    }, 15 * 60 * 1000)
    timer.unref?.()
    child.stdout?.on('data', c => { stdout = (stdout + c.toString()).slice(-256 * 1024) })
    child.stderr?.on('data', c => { stderr = (stderr + c.toString()).slice(-64 * 1024) })
    child.on('error', err => {
      clearTimeout(timer)
      resolve({ exitCode: 127, stdout, stderr: `${stderr}\n${err.message}`, timedOut: false })
    })
    child.on('close', code => {
      clearTimeout(timer)
      resolve({ exitCode: code, stdout, stderr, timedOut: false })
    })
  })
}

log('info', `boot node=${process.version} cwd=${process.cwd()} port=${port} profileDir=${profileDir ?? 'web'} wrapper=${import.meta.url} dshBin=${dshBin ?? 'auto'} exists=${dshBin ? existsSync(dshBin) : 'n/a'}`)
log('info', `args=${JSON.stringify(args)}`)

const server = http.createServer(async (req, res) => {
  const t0 = Date.now()
  const method = req.method ?? 'GET'
  const rawUrl = req.url ?? '/'
  const url = new URL(rawUrl, `http://127.0.0.1:${port}`)
  const path = url.pathname
  const query = url.search

  let bodyText = ''
  if (method === 'POST') {
    bodyText = await new Promise(resolve => {
      let data = ''
      req.on('data', chunk => { data += chunk.toString(); if (data.length > 64 * 1024) data = data.slice(-64 * 1024) })
      req.on('end', () => resolve(data))
    })
  }

  log('info', `→ ${method} ${path}${query} body=${bodyText.slice(0, 600)}`)

  if (method === 'OPTIONS') {
    res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' })
    res.end()
    return
  }
  res.setHeader('access-control-allow-origin', '*')

  try {
    if (path === '/dsh-market/registry' && method === 'GET') {
      log('info', `handle registry profileDir=${profileDir ?? 'web'}`)
      const r = await loadRegistry()
      const size = JSON.stringify(r).length
      log('info', `← 200 registry count=${r?.count ?? '?'} plugins=${r?.plugins?.length ?? '?'} ${size}B ${Date.now() - t0}ms`)
      json(res, 200, r)
      return
    }
    if (path === '/dsh-market/installed' && method === 'GET') {
      log('info', `handle installed profile=web dir=${profileDir ?? 'default'}`)
      const m = readInstalled('web', profileDir)
      const keys = Object.keys(m)
      log('info', `← 200 installed ${keys.length} pkgs ${Date.now() - t0}ms`, keys.slice(0, 10))
      json(res, 200, { installed: m })
      return
    }
    if (path === '/dsh-market/check' && method === 'GET') {
      log('info', `handle check dir=${profileDir ?? 'web'}`)
      const report = await analyzeProfile(profileDir ?? 'web')
      const summary = report?.summary ?? {}
      log('info', `← 200 check ok=${summary.ok} bundles=${report?.bundles?.length} rows=${report?.rows?.length} ${Date.now() - t0}ms`)
      if (summary.errors?.length) log('warn', `check errors ${summary.errors.length}`, summary.errors.slice(0, 3))
      json(res, 200, report)
      return
    }
    if (path === '/dsh-market/updates' && method === 'GET') {
      log('info', `handle updates dir=${profileDir ?? 'web'}`)
      const u = await checkUpdates(profileDir ?? 'web')
      log('info', `← 200 updates ${Object.keys(u).length} entries ${Date.now() - t0}ms`, Object.keys(u).slice(0, 10))
      json(res, 200, u)
      return
    }
    if (path === '/dsh-market/install' && method === 'POST') {
      let spec = ''
      try {
        const j = JSON.parse(bodyText || '{}')
        spec = j.spec ?? j.target ?? j.name ?? (Array.isArray(j.specs) ? j.specs[0] : '') ?? (Array.isArray(j.ids) ? j.ids[0] : '') ?? ''
      } catch {}
      if (!spec || typeof spec !== 'string') {
        log('warn', `install missing spec body=${bodyText.slice(0, 400)}`)
        json(res, 200, { ok: false, error: 'missing spec' })
        return
      }
      log('info', `handle install spec=${spec.slice(0, 400)}`)
      const result = await runDshPlugin(['add', spec])
      const ok = result.exitCode === 0
      const rawOut = (result.stdout ?? '') + '\n' + (result.stderr ?? '')
      const snippet = rawOut.slice(-3000)
      log(ok ? 'info' : 'error', `← 200 install spec=${spec} exit=${result.exitCode} ${Date.now() - t0}ms`, snippet)
      if (!ok) {
        // —— 自动处理 pnpm 默认拦截的 build 脚本（node-pty 等）——
        if (rawOut.includes('ERR_PNPM_IGNORED_BUILDS') && rawOut.includes('Ignored build scripts:')) {
          try {
            const m = rawOut.match(/Ignored build scripts:\s*([^\n]+)/)
            const rawList = m ? m[1] : ''
            const pkgs = rawList.split(',').map(s => s.trim().split('@')[0]).map(s => s.trim()).filter(s => s && /^[A-Za-z0-9@/_.-]+$/.test(s))
            const targets = pkgs.length ? pkgs : (rawOut.includes('node-pty') ? ['node-pty'] : [])
            if (targets.length) {
              log('info', `install auto-approve builds ${targets.join(',')} for ${spec}`)
              const approved = setAllowBuilds('web', targets, profileDir)
              log('info', `approved builds: ${approved.slice(0, 10).join(',')}`)
              const retry = await runDshPlugin(['add', spec])
              const retryOk = retry.exitCode === 0
              const retryRaw = (retry.stdout ?? '') + '\n' + (retry.stderr ?? '')
              log(retryOk ? 'info' : 'error', `← retry install spec=${spec} exit=${retry.exitCode} ${Date.now() - t0}ms`, retryRaw.slice(-2000))
              if (retryOk) {
                json(res, 200, { ok: true, exitCode: retry.exitCode, stdout: retry.stdout.slice(-8000), stderr: retry.stderr.slice(-8000), installed: readInstalled('web', profileDir) })
                return
              }
              const pnpmProbe2 = await probePnpm()
              const profileDiag2 = diagnoseProfileDir(profileDir)
              const diag2 = `pnpm probe: ${pnpmProbe2.ok ? 'ok' : 'fail'} ${pnpmProbe2.output.slice(0, 800)} | ${profileDiag2} | retry builds ${targets.join(',')} | node=${process.version}`
              log('warn', `install diagnose (retry)`, diag2)
              const fullStderr2 = [(retry.stderr ?? ''), `\n[diagnose] ${diag2}`, `\n[retry-raw] ${retryRaw.slice(-1000)}`].join('').slice(-8000)
              json(res, 200, { ok: false, exitCode: retry.exitCode, stdout: retry.stdout.slice(-8000), stderr: fullStderr2, installed: readInstalled('web', profileDir) })
              return
            }
          } catch (e) {
            log('warn', `auto-approve builds fail ${String(e).slice(0, 400)}`)
          }
        }
        // 深挖：pnpm 是否可用、profile 目录状态、最近 pnpm 日志
        const pnpmProbe = await probePnpm()
        const profileDiag = diagnoseProfileDir(profileDir)
        const diag = `pnpm probe: ${pnpmProbe.ok ? 'ok' : 'fail'} ${pnpmProbe.output.slice(0, 800)} | ${profileDiag} | node=${process.version} cwd=${process.cwd()}`
        log('warn', `install diagnose`, diag)
        let pnpmLogSnippet = ''
        try {
          if (profileDir) {
            const candidates = [join(profileDir, 'pnpm-debug.log'), join(profileDir, '.pnpm-debug.log'), join(profileDir, 'node_modules/.pnpm/lock.yaml')]
            for (const p of candidates) {
              if (existsSync(p)) {
                const txt = readFileSync(p, 'utf8').slice(-2000)
                pnpmLogSnippet = `file:${p.slice(-60)}:${txt.slice(-1200)}`
                break
              }
            }
          }
        } catch {}
        let hint = ''
        if (rawOut.includes('ERR_PNPM_IGNORED_BUILDS')) {
          hint = `检测到 pnpm 拦截了构建脚本（${rawOut.match(/Ignored build scripts:[^\n]+/)?.[0] ?? 'node-pty'}），已自动放行并重试。请稍后查看是否安装成功。`
        } else if (!pnpmProbe.ok && !rawOut.includes('Progress:')) {
          hint = `pnpm 不可用（${pnpmProbe.output.slice(0, 200)}）。请先在终端执行 corepack enable && corepack prepare pnpm@latest --activate，或 npm i -g pnpm，或检查杀软是否拦截 pnpm。 / pnpm not found — run 'corepack enable && corepack prepare pnpm@latest --activate' or 'npm i -g pnpm'.`
        } else if (rawOut.includes('ERR_PNPM') || rawOut.includes('ERR_')) {
          hint = `pnpm 执行失败，详见日志：${snippet.slice(-800)}`
        } else if (rawOut.includes('timeout') || rawOut.includes('ETIMEDOUT') || rawOut.includes('FETCH')) {
          hint = `网络超时（国内镜像可能更快）。可重试，或在终端执行：dsh plugin --profile web add ${spec} --registry https://registry.npmmirror.com`
        }
        const fullStderr = [result.stderr ?? '', `\n[diagnose] ${diag}`, pnpmLogSnippet ? `\n[pnpm-log] ${pnpmLogSnippet}` : '', hint ? `\n[hint] ${hint}` : ''].join('').slice(-8000)
        json(res, 200, { ok, exitCode: result.exitCode, stdout: result.stdout.slice(-8000), stderr: fullStderr, installed: readInstalled('web', profileDir) })
        return
      }
      json(res, 200, { ok, exitCode: result.exitCode, stdout: result.stdout.slice(-8000), stderr: result.stderr.slice(-8000), installed: readInstalled('web', profileDir) })
      return
    }
    if (path === '/dsh-market/update' && method === 'POST') {
      let name = '', force = false
      try {
        const j = JSON.parse(bodyText || '{}')
        name = j.name ?? j.spec ?? j.id ?? j.target ?? (Array.isArray(j.ids) ? j.ids[0] : '') ?? (Array.isArray(j.names) ? j.names[0] : '') ?? ''
        if (!name && Array.isArray(j) && typeof j[0] === 'string') name = j[0]
        force = j.force === true || j.immediate === true
      } catch {}
      if (!name || typeof name !== 'string') {
        log('warn', `update missing name body=${bodyText.slice(0, 400)}`)
        json(res, 200, { ok: false, error: 'missing name' })
        return
      }
      const installed = readInstalled('web', profileDir)
      const spec = installed[name]
      if (spec === undefined) {
        log('warn', `update not installed name=${name}`)
        json(res, 200, { ok: false, error: `plugin is not installed: ${name}` })
        return
      }
      if (spec.startsWith('link:') || spec.startsWith('file:')) {
        json(res, 200, { ok: false, error: 'locally linked plugins update from their checkout' })
        return
      }
      const isGit = spec.startsWith('github:')
      const target = isGit ? spec.replace(/#.*$/, '') : `${name}@latest`
      const addArgs = force ? ['add', '--config.minimumReleaseAge=0', target] : ['add', target]
      log('info', `handle update name=${name} spec=${spec.slice(0, 200)} -> ${target} force=${force}`)
      const result = await runDshPlugin(addArgs)
      const ok = result.exitCode === 0
      const snippet = (result.stderr || result.stdout).slice(-3000)
      log(ok ? 'info' : 'error', `← 200 update name=${name} exit=${result.exitCode} ${Date.now() - t0}ms`, snippet)
      const stderr = result.stderr ?? ''
      const stdout = result.stdout ?? ''
      const isStale = !ok && /stale|did not change|not newer/i.test(stderr + stdout)
      const hasIgnoredBuilds = /ignoredBuilds|allowBuilds|ERR_PNPM_IGNORED_BUILDS/i.test(stderr + stdout)
      json(res, 200, {
        ok,
        exitCode: result.exitCode,
        stdout: stdout.slice(-8000),
        stderr: stderr.slice(-8000),
        stale: isStale || undefined,
        ignoredBuilds: hasIgnoredBuilds ? [{ name, reason: 'ignoredBuilds' }] : undefined,
        installed: readInstalled('web', profileDir),
      })
      return
    }
    if (path === '/dsh-market/uninstall' && method === 'POST') {
      let name = ''
      try {
        const j = JSON.parse(bodyText || '{}')
        name = j.name ?? j.id ?? j.spec ?? j.target ?? (Array.isArray(j.ids) ? j.ids[0] : '') ?? (Array.isArray(j.names) ? j.names[0] : '') ?? ''
        if (!name && Array.isArray(j) && typeof j[0] === 'string') name = j[0]
      } catch {}
      if (!name || typeof name !== 'string') {
        log('warn', `uninstall missing name body=${bodyText.slice(0, 400)}`)
        json(res, 200, { ok: false, error: 'missing name', body: bodyText.slice(0, 400) })
        return
      }
      if (name === 'dsh-market' || name === 'dshmarket') {
        json(res, 200, { ok: false, error: 'the market cannot uninstall itself' })
        return
      }
      const installed = readInstalled('web', profileDir)
      if (installed[name] === undefined) {
        log('warn', `uninstall not installed name=${name} installed=${Object.keys(installed).slice(0, 10)}`)
        json(res, 200, { ok: false, error: `plugin is not installed: ${name}` })
        return
      }
      log('info', `handle uninstall name=${name}`)
      const result = await runDshPlugin(['remove', name])
      const ok = result.exitCode === 0
      log(ok ? 'info' : 'error', `← 200 uninstall name=${name} exit=${result.exitCode} ${Date.now() - t0}ms`, (result.stderr || result.stdout).slice(-600))
      json(res, 200, { ok, exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr, installed: readInstalled('web', profileDir) })
      return
    }
    if (path === '/dsh-market/cancel' && method === 'POST') {
      log('info', `handle cancel`)
      json(res, 200, { ok: true })
      return
    }
    if (path === '/dsh-market/backup' && method === 'POST') {
      const isExport = bodyText.includes('"export"')
      log('info', `handle backup ${isExport ? 'export' : 'import'} ${bodyText.length}B`)
      json(res, 200, { data: '{}' })
      return
    }
    if (path === '/health' || path === '/dsh-market/health') {
      json(res, 200, { ok: true, port, profileDir: profileDir ?? 'web', dshBin: dshBin ?? 'auto', uptime: process.uptime() })
      return
    }

    log('warn', `← 404 ${method} ${path} ${Date.now() - t0}ms`)
    json(res, 404, { error: `not found ${path}` })
  } catch (e) {
    const msg = String(e?.stack ?? e)
    log('error', `← 500 ${method} ${path} ${Date.now() - t0}ms`, msg.slice(0, 2000))
    json(res, 500, { error: String(e) })
  }
})

server.on('error', err => {
  log('error', `server error ${err.message}`, err.stack?.slice(0, 2000))
})

server.listen(port, '127.0.0.1', () => {
  log('info', `listening on http://127.0.0.1:${port} profileDir=${profileDir ?? 'web'} pid=${process.pid}`)
})
