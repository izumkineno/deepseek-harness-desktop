# 市场集成覆盖率 — 桌面端 vs `dsh-market`

> 快照：`deepseek-harness-desktop@0.6.12` vs `dsh-market@1.16.6`（子模块 `packages/dsh-market`，12,088 行）  
> 架构：`Tauri UI → market-compat (fetch) → Node 侧车 (wrapper.mjs 235 行) → dsh-market/src/*`，Rust 仅作进程管家（`market_sidecar.rs 183 行`，`CREATE_NEW_CONSOLE+SW_HIDE` + TCP 探活）。

调试侧车 `http://127.0.0.1:3099`，Harness 动态 `3011`，配置 `3080` 正式版 / `3081` 调试版。见 `src-tauri/src/service/market_sidecar.rs:38 node_bin()`。

## 1. 量化总览

| 分层 | 上游 | 桌面现状 | 代码复用 | 功能等价 |
|---|---|---|---|---|
| 纯逻辑 `registry/sources/compatibility/diagnostics/updates/check/profile` | 7 文件 2,143 行 | `wrapper.mjs` 直连 `import { loadRegistry, readInstalled, analyzeProfile, checkUpdates }` | **57%** | 60% |
| 编排 `install/verify/hot/themes/groups/patch/order/backup/gist` | 11 文件 3,850 行 | `install/uninstall` 仅 `spawn node bin.js plugin --profile web add/remove` 单命令，其余桩 `200 {ok}` | **9%** | 15% |
| Shell `dsh-cli/pnpm-compat/ndjson` | 3 文件 1,147 行 | 仅复用 `spawn`，`provisionPnpm/probePnpm/progress/allowBuilds/hoistRecovery` 缺失 | **5%** | 10% |
| WebServer `routes.ts 2,249 行 24 路由` | 24 路由 | 实装 8 个，桩 2 个，缺 14 个 | **33%** | 30% |
| Client/UI `client 1,705 + MarketSection 2,500` | `MarketSection.tsx` + 5 子面板 | `src/components/config-plugin.tsx 1,281 行` 用 HeroUI 重写（列表/排序/筛选） | **0% 复用** | 55% |
| **合计** | **12,088** | `wrapper 235 + client 201 + market_sidecar 183` | **约 18% 行** | **约 40% 功能** |

当前可验证状态（2026-08-21T10:29）：

```
[market-sidecar] spawn C:\Program Files\nodejs\node.exe .../wrapper.mjs --dsh-bin .../bin.js exists=true
[market-sidecar:out] listening on http://127.0.0.1:3099 pid=54308
[market-sidecar] health 127.0.0.1:3099 -> tcp ok
→ GET 3099/dsh-market/registry → 1837 plugins
→ GET 3099/dsh-market/check → 3 bundles 136 rows
→ POST 3099/dsh-market/install @liustack/modlens → exit=1 dsh: pnpm failed in profile directory
```

链路已通，止于 `pnpm` 自举（见 §3 P0）。

## 2. 24 路由全表（按 `packages/dsh-market/src/routes.ts` 注册顺序）

| # | 路由 | 方法 | 上游语义 | 桌面 | 缺口 |
|---|---|---|---|---|---|
| 1 | `/dsh-market/registry` | GET | `registry.ts` 精选 registry + 快照兜底 | ✅ wrapper:125 实装 | — |
| 2 | `/dsh-market/installed` | GET | 扫描 `profileDir + pnpm-lock.yaml + package.json` | ✅ 133 实装 | — |
| 3 | `/dsh-market/check` | GET | `check.ts 971 行` 全量体检（重名/风险/皮肤/兼容） | ✅ 141 实装 | — |
| 4 | `/dsh-market/updates` | GET | 逐个已装插件 `fetchNpmLatest + semver` | ✅ 150 实装 | — |
| 5 | `/dsh-market/bundle-order` | POST | `order.ts` `bundleStack` 重排 | ❌ | 拖拽排序、冲突合并 |
| 6 | `/dsh-market/use-skin` | POST | `themes.ts 125` 创建/切换皮肤 | ❌ | `createThemeManager` 整段缺 |
| 7 | `/dsh-market/toggle` | POST | `patch.ts` `enableRow/disableRow` 禁/启用 | ❌ | `config-plugin` 无开关 |
| 8 | `/dsh-market/groups` | POST | `groups.ts 111` 分组 CRUD | ❌ | 仅只读展示 |
| 9 | `/dsh-market/status` | GET | NDJSON 流 `dsh-cli.progress` | ❌ | 无安装进度条/实时日志 |
| 10 | `/dsh-market/logs` | GET | `log.ts 74` 结构化日志导出 | ❌ | — |
| 11 | `/dsh-market/update` | POST | 单插件更新（与安装区分通道/tag） | ✅ wrapper:175 实装（`add @latest`/`github:HEAD`，`force`→`--config.minimumReleaseAge=0`） | 通道 tag 仅 `latest`（市场自身通道略） |
| 12 | `/dsh-market/setup-pnpm` | POST | **核心**：`provisionPnpm/probePnpm` | ❌ | **当前 `pnpm failed` 根因，阻塞全部安装** |
| 13 | `/dsh-market/channel` | POST | 切换 `alpha/beta/stable`（`channels.ts 70`） | ❌ | — |
| 14 | `/dsh-market/self-uninstall` | POST | 自卸载（禁 `dsh-market` 自删） | ❌ | 仅抄了拦截 |
| 15 | `/dsh-market/restart` | POST | `restart.ts 303` `SIGUSR2/scheduleRestart` | ❌ | 桌面需优雅重启 |
| 16 | `/dsh-market/approve-builds` | POST | `patch.ts` `isTrustedModule/allowBuilds` 放行 `postinstall` | ❌ | 安全提示缺 |
| 17 | `/dsh-market/install` | POST | 最难：`install.ts 268` 的 `hoistRecovery/allowBuilds/gitAllowBuilds/validateAddedPlugins` + `dsh-cli.runDshPlugin` 进度流 | ⚠️ 半 — 仅 `spawn add spec` | 无 `trial/rollback/verify` |
| 18 | `/dsh-market/uninstall` | POST | `remove` + `removeFromGroups` | ⚠️ 半 | 未清分组 |
| 19 | `/dsh-market/rollback` | POST | 失败 `restoreManifestDeps` 回滚 | ❌ | 失败残留 |
| 20 | `/dsh-market/cancel` | POST | `AbortSignal` 取消活动 `DesktopOperation` | ⚠️ 桩 恒 `ok` | 非真取消 |
| 21 | `/dsh-market/backup` | GET/POST | `backup.ts 542` tar + 完整性 | ⚠️ 桩 `{data:"{}"}` | — |
| 22 | `/dsh-market/restore` | POST | backup 反向 | ❌ | 同上 |
| 23 | `/dsh-market/webdav` | POST | WebDAV 远端备份 `upload/download` | ❌ | — |
| 24 | `/dsh-market/gist` | POST | `gist.ts 359` `createGist/updateGist/verifyGistToken` | ❌ | — |

## 3. 未实现的深层语义（按源文件）

- `trial.ts 156 + hot.ts 491` — **试用**：`mountClientOnlyDeps/hotMount/cleanHotDir` 临时挂载不落盘，`purgeMarketState`。桌面无试用横幅；**难度高**（文件系统隔离）。
- `verify.ts 399 + compatibility.ts 253 + diagnostics.ts 84` — **装后校验**：`verifyActivation/checkClientBundle/hasHostHalf` + `introducedRisks`，当前 `install 200` 即算成功；**中**。
- `pnpm-compat.ts 183 + dsh-cli.ts:provisionPnpm` — **pnpm 自举**：走 corepack/捆绑二进制兜底 `dependencies/pnpm/bin/pnpm.cjs`，直接 `spawn node bin.js` 在国内网络下 `10:29 pnpm failed`；**高** — 唯一 P0。
- `order.ts 321 + patch.ts 451` — **排序与开关**：重装后顺序乱、无风险开关；**中**。
- `backup/gist/webdav 542+359` — 备份全家桩，Rust `service/market/backup.rs` 与 TS `backup.ts` 双轨但均未接入；**低**。
- `ndjson.ts 174 + dsh-cli progress` — **流式进度**：上游 `text/event-stream` 推 `InstallProgress`，桌面单次 15min `await`；**中**。
- `groups.ts 111 + settings.ts 86 + sources.ts 174 + themes.ts 125` — 元数据层；**低**。

## 4. 优先级 / 工作量

**P0 堵安装：** `setup-pnpm`（1 天）→ 在 `wrapper.runDshPlugin` 前补 `pnpm-compat:provisionPnpm`，否则所有 `spec` 均 `exit=1`。

**P1 闭环：** `update` 独立通道（0.5 天）、`rollback/cancel/status` 流（1.5 天）、`approve-builds`（0.5 天）、`verify` 回查（0.5 天）。

**P2 体验：** `toggle/groups/bundle-order/use-skin/logs`（2 天）、`backup/restore/webdav/gist`（1.5 天）、`trial/hot`（3 天）。

**追平合计：** 约 **10–12 人天**（含 Tauri 通知/主题对接）。`sidecar 100% Node` 架构已定，Rust 仅管家，后续增量只扩 `wrapper.mjs` 路由表 + `market-compat/src/client.ts` 的 `tryFetch` 映射。

> 结论：**最小可用已通**（读/检/更/直连 registry），**可安装卡在 pnpm 自举一处**；补 `setup-pnpm` 后 `install/uninstall` 即通，其余 14 路由属体验层，不堵发版主路径。

## 5. 文件地图

```
packages/dsh-market/src/{registry,profile,check,updates,sources,compatibility,diagnostics,themes,groups,patch,order,backup,gist,log,ndjson,net,restart,verify,trial,hot,install,dsh-cli,pnpm-compat,channels,settings,store}.ts
packages/market-compat/wrapper.mjs   — Node 侧车，业务 100% 在 Node，0% 在 Rust
packages/market-compat/src/client.ts — Tauri 侧 fetch 层，sidecar→harness→直连兜底，HTTP 4xx/5xx 不重试
src/components/config-plugin.tsx     — HeroUI 重实现（1,281 行）
src-tauri/src/service/market_sidecar.rs — 拉起 + stdout/stderr 转发 + TCP 探活
```

## 6. 复现

```powershell
pnpm tauri dev
# Rust 日志必出：
# [market-sidecar] spawn C:\Program Files\nodejs\node.exe .../wrapper.mjs --dsh-bin .../bin.js exists=true
# [market-sidecar:out] listening on http://127.0.0.1:3099
# [market-sidecar] health 127.0.0.1:3099 -> tcp ok

# 手动探安装：
& "C:\Program Files\nodejs\node.exe" "$env:APPDATA\io.github.hairyf.deepseek-harness-desktop\dependencies\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js" plugin --profile web add @liustack/modlens
# 国内兜底：
# ... add @liustack/modlens --registry https://registry.npmmirror.com
```
