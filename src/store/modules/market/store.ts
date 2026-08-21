import { invoke } from '@tauri-apps/api/core'
import { defineStore } from 'valtio-define'

/**
 * 市场视图状态（独立于 harness，与 dsh web 进程隔离）
 * Scheme C：宿主替换，后端 0 改，桌面为宿主，sidecar 3082 与 dsh 3080/3081 隔离
 */
export const market = defineStore({
  state: () => ({
    active: false as boolean,
    marketAlive: false as boolean,
    marketPort: 3082 as number,
    statusJson: null as string | null,
    error: null as string | null,
    loading: false as boolean,
  }),
  actions: {
    setActive(v: boolean) {
      this.active = v
    },
    async refreshStatus() {
      this.loading = true
      this.error = null
      try {
        const json = await invoke<string>('proxy_market_request', {
          path: '/dsh-market/status',
          method: 'GET',
        })
        this.statusJson = json
        this.marketAlive = true
      } catch (e) {
        this.error = String(e)
        this.marketAlive = false
      } finally {
        this.loading = false
      }
    },
    async checkHealth() {
      try {
        const v = await invoke<{ port: number, alive: boolean }>('get_market_status')
        this.marketPort = v.port
        this.marketAlive = v.alive
        return v
      } catch {
        return { port: 3082, alive: false }
      }
    },
  },
})
