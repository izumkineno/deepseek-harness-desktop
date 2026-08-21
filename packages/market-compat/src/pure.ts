/**
 * 纯逻辑透传 — 复刻 UI 所需的 dsh-market 纯函数
 * 新 UI 仅依赖 @market-compat，不直连 @dshmarket
 * 上游变更仅改此文件
 */
export {
  avatarColor,
  formatCount,
  orderedCategories,
  pluginName,
  visiblePlugins,
  pageItems,
  TIME_RANGE_DAYS,
  pluginScreenshots,
  safeScreenshots,
  themePlugins,
  themeSwatch,
} from '../../dsh-market/src/client/market-data.ts'

export {
  parseSourceUrl,
  parseGitHubRepository,
  githubRepoIdentity,
  githubRepoIdentities,
  repoOf,
  gitAllowBuildsKey,
  installTargetFor,
  findInstalledAlias,
} from '../../dsh-market/src/sources.ts'

export {
  bucketOf,
  isSettled,
  needsUser,
  enqueue,
  patch,
  drop,
  clearSettled,
  summarize,
} from '../../dsh-market/src/client/operations.ts'

export type { PnpmFailure } from '../../dsh-market/src/pnpm-compat.ts'

// 浏览器安全：内联 pnpm-compat 纯函数，避免打包 node:fs
export function isTransientPnpmFailure(output: string): boolean {
  return /ERR_PNPM_FETCH_5\d\d|ERR_PNPM_META_FETCH_FAIL|FetchError|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|socket hang up|network timeout/i.test(output)
}
export function isFetchTimeoutFailure(output: string): boolean {
  return /operation was aborted due to timeout|TimeoutError|error \(23\)/i.test(output)
}
export function classifyPnpmFailure(output: string): import('../../dsh-market/src/pnpm-compat.ts').PnpmFailure | null {
  if (output.includes('ERR_PNPM_PUBLIC_HOIST_PATTERN_DIFF')) return { code: 'hoist-pattern-diff', recoverable: true, message: 'profile 的 node_modules 是旧版 pnpm 创建的，与当前 pnpm 的默认配置不兼容，需要重建后重试' }
  if (output.includes('ERR_PNPM_ADDING_TO_ROOT')) return { code: 'adding-to-root', recoverable: false, message: 'pnpm 拒绝在 workspace 根目录安装（缺少 -w）' }
  if (/--workspace-root may only be used inside a workspace/i.test(output)) return { code: 'not-a-workspace', recoverable: false, message: '-w was passed but the profile is not a pnpm workspace' }
  if (output.includes('ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION') || output.includes('ERR_PNPM_NO_MATURE_MATCHING_VERSION')) return { code: 'release-age-violation', recoverable: false, message: 'pnpm fresh-release 安全等待期拦截' }
  if (output.includes('ERR_PNPM_IGNORED_BUILDS')) return { code: 'ignored-builds', recoverable: false, message: '依赖需要执行构建脚本，被 pnpm 拦截' }
  if (output.includes('ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED')) return { code: 'git-prepare-not-allowed', recoverable: false, message: 'git 插件构建脚本被拦截' }
  if (output.includes('ERR_PNPM_FETCH_404')) return { code: 'fetch-404', recoverable: false, message: '依赖在 registry 上不存在' }
  if (isTransientPnpmFailure(output)) return { code: 'transient-network', recoverable: false, message: '网络临时失败' }
  if (isFetchTimeoutFailure(output)) return { code: 'fetch-timeout', recoverable: false, message: '下载超时' }
  if (output.includes('pnpm not found on PATH')) return { code: 'pnpm-missing', recoverable: false, message: '找不到 pnpm' }
  return null
}
