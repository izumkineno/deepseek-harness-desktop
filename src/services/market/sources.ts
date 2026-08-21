// 薄封装：复用 dsh-market 纯逻辑层，浏览器侧安全
export {
  parseSourceUrl,
  parseGitHubRepository,
  parseGitHubRemote,
  githubRepoIdentity,
  githubRepoIdentities,
  githubRemoteIdentities,
  repoOf,
  gitAllowBuildsKey,
  installTargetFor,
  findInstalledAlias,
} from '@dshmarket/sources.ts'
