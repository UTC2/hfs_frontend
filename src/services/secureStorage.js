import * as SecureStore from 'expo-secure-store'

const KEY = 'hfs.auth.tokens'

export const saveTokens = async (access, refresh) => {
  await SecureStore.setItemAsync(KEY, JSON.stringify({ access, refresh }))
}

export const loadTokens = async () => {
  const raw = await SecureStore.getItemAsync(KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!parsed.access || !parsed.refresh) return null
    return parsed
  } catch {
    return null
  }
}

export const clearTokens = async () => {
  await SecureStore.deleteItemAsync(KEY)
}
