/**
 * 后端兼容层 — 统一封装 dsh-market 后端调用
 * 仅对接 packages/dsh-market，不经过 Rust
 * UI 通过此层访问 registry / profile / check 等
 *
 * 说明：为避免 WebView 侧 tsc 因 node:fs / js-yaml 报错，
 * 此文件在浏览器构建时仅作类型占位，真实 Node 调用由 wrapper.mjs 直接 import dsh-market/src/*。
 * 浏览器侧请通过 @market-compat/client (fetch) 访问。
 */

// 纯 re-export 供 Node sidecar 直接使用（动态 import，不参与浏览器 tsc）
// 浏览器侧不直接 import 此文件，避免拉入 node:fs
export type RegistryBackend = {
  loadRegistry: () => Promise<unknown>
  readInstalled: (profile: string, dir?: string) => unknown
}
