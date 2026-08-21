/**
 * @desktop/market-compat — dsh-market 后端兼容层
 * 本工程复刻 dsh-market UI 时的所有后端/纯逻辑均经此层
 * 后续维护：仅改新 UI + 此兼容层
 */
export * from './types.ts'
export * from './pure.ts'
export * from './backend.ts'
export { market } from './client.ts'
