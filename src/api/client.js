/* eslint-disable no-underscore-dangle, import/prefer-default-export */
import axios from 'axios'
import { loadTokens, saveTokens, clearTokens } from '../services/secureStorage'

const baseURL = process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:8080/v1'

export const client = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 10000,
})

client.interceptors.request.use(async (config) => {
  const tokens = await loadTokens()
  if (tokens?.access) {
    // eslint-disable-next-line no-param-reassign
    config.headers.Authorization = `Bearer ${tokens.access}`
  }
  return config
})

let refreshing = null

client.interceptors.response.use(
  (res) => res,
  async (error) => {
    const status = error.response?.status
    const key = error.response?.data?.error_key
    const original = error.config

    const isTokenExpired = status === 401 && key === 'ErrInvalidToken'
    const isRefreshRequest = original?.url?.endsWith('/refresh')
    if (!isTokenExpired || original._retried || isRefreshRequest) {
      return Promise.reject(error)
    }

    // eslint-disable-next-line no-underscore-dangle
    original._retried = true

    try {
      if (!refreshing) {
        refreshing = (async () => {
          const tokens = await loadTokens()
          const res = await client.post('/refresh', {
            refresh_token: tokens?.refresh,
          })
          const access = res.data.data.access_token.token
          const refresh = res.data.data.refresh_token.token
          await saveTokens(access, refresh)
          return access
        })()
      }
      const newAccess = await refreshing
      original.headers.Authorization = `Bearer ${newAccess}`
      return client(original)
    } catch (refreshErr) {
      await clearTokens()
      return Promise.reject(refreshErr)
    } finally {
      refreshing = null
    }
  },
)
