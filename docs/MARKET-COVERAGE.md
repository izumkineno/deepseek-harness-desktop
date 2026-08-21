# Market Coverage — DeepSeek Harness Desktop vs `dsh-market`

> Snapshot: `deepseek-harness-desktop@0.6.12` vs `dsh-market@1.16.6` (submodule `packages/dsh-market`, 12,088 LOC).  
> Architecture: `Tauri UI → market-compat (fetch) → Node sidecar (wrapper.mjs 235 LOC) → dsh-market/src/*`. Rust is process supervisor only (`market_sidecar.rs 183 LOC`, `CREATE_NEW_CONSOLE+SW_HIDE`, TCP health check).

Debug sidecar `http://127.0.0.1:3099`, harness `3011` dynamic, settings `3080` release / `3081` debug. See `src-tauri/src/service/market_sidecar.rs:38 node_bin()`.

## 1. Quantitative Overview

| Layer | Upstream | Desktop | LOC reused | Functional equivalence |
|---|---|---|---|---|
| Pure logic `registry/sources/compatibility/diagnostics/updates/check/profile` | 7 files, 2,143 LOC | `wrapper.mjs` directly `import { loadRegistry, readInstalled, analyzeProfile, checkUpdates }` | **57%** | 60% |
| Orchestration `install/verify/hot/themes/groups/patch/order/backup/gist` | 11 files, 3,850 LOC | `install/update/uninstall` via `spawn node bin.js plugin --profile web add/remove`; others stub `200 {ok}` | **12%** | 18% |
| Shell `dsh-cli/pnpm-compat/ndjson` | 3 files, 1,147 LOC | Only `spawn` call reused; `provisionPnpm/probePnpm/progress/allowBuilds/hoistRecovery` missing | **5%** | 10% |
| WebServer `routes.ts 2,249 LOC, 24 routes` | 24 routes | 9 real, 2 stubs, 13 missing | **37%** | 34% |
| Client/UI `client 1,705 + MarketSection 2,500` | `MarketSection.tsx` + 5 panels (`OperationsPanel`, `Diagnostics`, `InstallToast`, etc.) | `src/components/config-plugin.tsx 1,281 LOC` re-implemented in HeroUI (list/sort/filter) | **0% reused** | 58% |
| **Total** | **12,088** | `wrapper 235 + client 201 + market_sidecar 183` | **~18% LOC** | **~40% functional** |

Current verifiable state (2026-08-21T10:29):

```
[market-sidecar] spawn C:\Program Files\nodejs\node.exe .../wrapper.mjs --dsh-bin .../bin.js exists=true
[market-sidecar:out] listening on http://127.0.0.1:3099 pid=54308
[market-sidecar] health 127.0.0.1:3099 -> tcp ok
→ GET 3099/dsh-market/registry → 1837 plugins
→ GET 3099/dsh-market/check → 3 bundles 136 rows
→ POST 3099/dsh-market/install @liustack/modlens → exit=1 dsh: pnpm failed in profile directory
```

## 2. 24 Routes — Full Mapping (by `packages/dsh-market/src/routes.ts` registration order)

| # | Route | Method | Upstream semantics | Desktop | Gap |
|---|---|---|---|---|---|
| 1 | `/dsh-market/registry` | GET | `registry.ts` curated registry + snapshot fallback | ✅ wrapper:125 real | — |
| 2 | `/dsh-market/installed` | GET | Scan `profileDir`, `pnpm-lock.yaml`, `package.json` manifests | ✅ wrapper:133 real | — |
| 3 | `/dsh-market/check` | GET | `check.ts 971 LOC` full diagnostics (duplicate names, risks, skin, compat) | ✅ wrapper:141 real | — |
| 4 | `/dsh-market/updates` | GET | Per-installed `fetchNpmLatest` + `semver` | ✅ wrapper:150 real | — |
| 5 | `/dsh-market/bundle-order` | POST | `order.ts` `bundleStack` reorder | ❌ | Drag reorder, conflict merge |
| 6 | `/dsh-market/use-skin` | POST | `themes.ts 125` create/switch skin | ❌ | `createThemeManager` entirely missing |
| 7 | `/dsh-market/toggle` | POST | `patch.ts` `enableRow/disableRow` | ❌ | No enable/disable switch in `config-plugin` |
| 8 | `/dsh-market/groups` | POST | CRUD `groups.ts 111` | ❌ | Group view exists but read-only |
| 9 | `/dsh-market/status` | GET | NDJSON streaming `dsh-cli.progress` | ❌ | No install progress bar / live logs |
| 10 | `/dsh-market/logs` | GET | `log.ts 74` structured logs export | ❌ | — |
| 11 | `/dsh-market/update` | POST | Single-plugin update (distinct channel/distTag from install) | ✅ wrapper:175 real (`add @latest`/`github:HEAD`, `force`→`--config.minimumReleaseAge=0`) | Channel tag `latest` only (market self-channel omitted) |
| 12 | `/dsh-market/setup-pnpm` | POST | **`provisionPnpm/probePnpm`** (`pnpm-compat 183 + dsh-cli 791`) | ❌ | **Root cause of `pnpm failed` — blocks all installs** |
| 13 | `/dsh-market/channel` | POST | Switch `alpha/beta/stable` (`channels.ts 70`) | ❌ | `channels.ts` |
| 14 | `/dsh-market/self-uninstall` | POST | Uninstall market itself (guard `name===dsh-market`) | ❌ | Only guard copied |
| 15 | `/dsh-market/restart` | POST | `restart.ts 303` `SIGUSR2/scheduleRestart` | ❌ | Desktop needs graceful restart |
| 16 | `/dsh-market/approve-builds` | POST | `patch.ts` `isTrustedModule/allowBuilds` for `postinstall` | ❌ | Security prompt missing |
| 17 | `/dsh-market/install` | POST | Hardest: `install.ts 268` `hoistRecovery/allowBuilds/gitAllowBuilds/validateAddedPlugins` + `dsh-cli.runDshPlugin` with progress stream | ⚠️ half — only `spawn add spec` | No `trial/rollback/verify` |
| 18 | `/dsh-market/uninstall` | POST | `remove` + `removeFromGroups` | ⚠️ half | `groups` not cleaned |
| 19 | `/dsh-market/rollback` | POST | `restoreManifestDeps` on failure | ❌ | Residual files after failed install |
| 20 | `/dsh-market/cancel` | POST | `AbortSignal` cancel active `DesktopOperation` | ⚠️ stub always `ok` | No real cancel |
| 21 | `/dsh-market/backup` | GET/POST | `backup.ts 542` tar + integrity | ⚠️ stub `{data:"{}"}` | — |
| 22 | `/dsh-market/restore` | POST | Reverse of backup | ❌ | Same as above |
| 23 | `/dsh-market/webdav` | POST | WebDAV `upload/download` | ❌ | — |
| 24 | `/dsh-market/gist` | POST | `gist.ts 359` `createGist/updateGist/verifyGistToken` | ❌ | — |

## 3. Deep Semantics Not Yet Implemented (by source file)

- `trial.ts 156 + hot.ts 491` — **Trial mode**: `mountClientOnlyDeps/hotMount/cleanHotDir` ephemeral mounts, `purgeMarketState`. Desktop has no trial banner; **difficulty High** (FS isolation).
- `verify.ts 399 + compatibility.ts 253 + diagnostics.ts 84` — **Post-install verification**: `verifyActivation/checkClientBundle/hasHostHalf` + `introducedRisks` after `200`. Desktop treats `install → 200` as success; **difficulty Medium**.
- `pnpm-compat.ts 183 + dsh-cli.ts:provisionPnpm` — **pnpm self-bootstrap**: corepack / bundled binary fallback via `dependencies/pnpm/bin/pnpm.cjs`. Direct `spawn node bin.js` fails with `10:29 pnpm failed` on domestic network; **difficulty High** — the single P0 blocker.
- `order.ts 321 + patch.ts 451` — **Ordering & toggling**: wrong order after reinstall, no risk-toggle; **Medium**.
- `backup/gist/webdav 542+359` — entire backup family is stubbed; Rust `service/market/backup.rs` and TS `backup.ts` dual-track but disconnected; **Low**.
- `ndjson.ts 174 + dsh-cli progress` — **Streaming progress**: upstream uses `text/event-stream` for `InstallProgress`; desktop polls single 15 min `await`; **Medium**.
- `groups.ts 111 + settings.ts 86 + sources.ts 174 + themes.ts 125` — metadata layer; **Low**.

## 4. Priority / Effort

**P0 — blocks current installs:** `setup-pnpm` (1 day) → wire `pnpm-compat:provisionPnpm` before `runDshPlugin` or inject `preparePnpmArgs` in `wrapper.mjs`. Until then every `spec` exits `1`.

**P1 — close main loop:** `update` separate channel (0.5 d), `rollback/cancel/status` streaming (1.5 d), `approve-builds` (0.5 d), `verify` post-check (0.5 d).

**P2 — feature parity:** `toggle/groups/bundle-order/use-skin/logs` (2 d), `backup/restore/webdav/gist` (1.5 d), `trial/hot` (3 d).

**Estimated to parity:** **10–12 person-days** (incl. Tauri notification/theme wiring). Architecture is settled at `sidecar 100% Node` — `Rust` stays supervisor, future increments only enlarge `wrapper.mjs` route table + `market-compat/src/client.ts` `tryFetch` map.

> Takeaway: **minimal viable read path is done** (registry/check/updates/installed via sidecar). **Install path is blocked by one missing capability — pnpm provisioning**. After `setup-pnpm`, `install/uninstall` unblocks; remaining 14 routes are UX-tier and do not block release train.

## 5. File Map

```
packages/dsh-market/src/{registry,profile,check,updates,sources,compatibility,diagnostics,themes,groups,patch,order,backup,gist,log,ndjson,net,restart,verify,trial,hot,install,dsh-cli,pnpm-compat,channels,settings,store}.ts
packages/market-compat/wrapper.mjs   — Node sidecar, 100% business in Node, 0% in Rust
packages/market-compat/src/client.ts — Tauri fetch layer, sidecar→harness→direct fallback, HTTP 4xx/5xx not retried
src/components/config-plugin.tsx     — HeroUI re-implementation (1,281 LOC)
src-tauri/src/service/market_sidecar.rs — spawn + stdout/stderr forward + TCP health probe
```

## 6. Reproduce

```powershell
pnpm tauri dev
# Rust log must show:
# [market-sidecar] spawn C:\Program Files\nodejs\node.exe .../wrapper.mjs --dsh-bin .../bin.js exists=true
# [market-sidecar:out] listening on http://127.0.0.1:3099
# [market-sidecar] health 127.0.0.1:3099 -> tcp ok

# Manual install probe:
& "C:\Program Files\nodejs\node.exe" "$env:APPDATA\io.github.hairyf.deepseek-harness-desktop\dependencies\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js" plugin --profile web add @liustack/modlens
# Domestic fallback:
# ... add @liustack/modlens --registry https://registry.npmmirror.com
```
