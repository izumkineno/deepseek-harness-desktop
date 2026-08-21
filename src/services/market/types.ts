export type { DshPlugin } from '@/hooks/use-dsh-plugins.ts'
export type { RegistryPlugin, Registry, MarketStatus, UpdateStatus } from './market-data.ts'
export type { OperationRecord } from './operations.ts'

export interface MarketRegistry {
  count: number
  categories: Record<string, Record<string, string | undefined>>
  plugins: import('./market-data.ts').RegistryPlugin[]
}

export interface BundleLayer { name: string; source: string; kind: string; directory?: string | null; patch_path?: string | null; error?: string | null; entries: string[]; parse_error?: string | null }
export interface DuplicateId { id: string; layers: string[]; count: number }
export interface CheckReport {
 ok: boolean
 errors: string[]
 warnings: string[]
 profile: string
 scanned_at: number
 bundles: BundleLayer[]
 rows: string[]
 duplicates: DuplicateId[]
 duplicate_names: string[]
 overrides: string[]
 orphans: string[]
 peer_mismatches: string[]
 multi_version: string[]
}
