/**
 * 后端调用兼容层 — 类型
 * 仅对接 packages/dsh-market 上游，不与 Rust 绑定
 */
export type {
  RegistryPlugin,
  Registry,
  MarketStatus,
  UpdateStatus,
  LocalizedText,
  ThemeSnapshot,
  Translate,
} from '../../dsh-market/src/client/market-data.ts'

export type {
  DiagnosticReportV1,
} from '../../dsh-market/src/diagnostics.ts'

// Node 侧复杂类型在浏览器构建时用 any 占位，避免 js-yaml 拉入
export type BundleLayer = any
export type DuplicateId = any
export type CheckReport = any
export type CompatibilityRisk = any
