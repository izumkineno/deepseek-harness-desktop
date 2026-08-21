# market-compat — dsh-market 后端兼容层

`@desktop/market-compat` 是桌面端复刻 `dsh-market` UI 时的**唯一后端接入层**，仅对接 `packages/dsh-market`。

```
新 UI (heroui, config-plugin.tsx) ──► @market-compat ──► packages/dsh-market/src/*
                                        ▲
                                   纯逻辑 + 后端薄封装
```

**维护契约**：`dsh-market` 上游变更 → 只改 `packages/market-compat/src/*`，新 UI 零改动。

## 结构

```
src/
  types.ts   — 仅 re-export dsh-market 类型 (Registry, CheckReport…)
  pure.ts    — 透传纯函数 (avatarColor, visiblePlugins, installTargetFor…)
  backend.ts — 封装后端 (loadRegistry, readInstalled, analyzeProfile, checkUpdates…)
  index.ts   — 统一出口
```

不与 Rust 绑定，不定义 `MarketRegistry` 等 Rust 镜像类型。

## 使用

```ts
// UI 侧 — 不再直连 @dshmarket
import {
  avatarColor, visiblePlugins, installTargetFor,
  loadRegistry, analyzeProfile,
  type Registry, type CheckReport,
} from '@market-compat'

// 纯逻辑
const color = avatarColor(name)

// 后端（需在 Node sidecar 环境）
const registry = await loadRegistry()
const report = analyzeProfile(profileDir)
```

## 上游同步

```bash
git submodule update --remote packages/dsh-market
# 若 dsh-market 导出变更，仅改 packages/market-compat/src/* 对应 re-export
pnpm typecheck
```
