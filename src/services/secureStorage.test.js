/* eslint-disable no-underscore-dangle */
jest.mock('expo-secure-store', () => {
  const store = new Map()
  return {
    setItemAsync: jest.fn(async (k, v) => {
      store.set(k, v)
    }),
    getItemAsync: jest.fn(async (k) => store.get(k) ?? null),
    deleteItemAsync: jest.fn(async (k) => {
      store.delete(k)
    }),
    __reset: () => store.clear(),
  }
})

const SecureStore = require('expo-secure-store')
const { saveTokens, loadTokens, clearTokens } = require('./secureStorage')

beforeEach(() => SecureStore.__reset())

describe('secureStorage', () => {
  it('round-trips tokens', async () => {
    await saveTokens('access-1', 'refresh-1')
    const got = await loadTokens()
    expect(got).toEqual({ access: 'access-1', refresh: 'refresh-1' })
  })

  it('returns null when nothing saved', async () => {
    expect(await loadTokens()).toBeNull()
  })

  it('clears tokens', async () => {
    await saveTokens('a', 'b')
    await clearTokens()
    expect(await loadTokens()).toBeNull()
  })
})
