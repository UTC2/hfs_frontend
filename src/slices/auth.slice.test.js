/* eslint-disable global-require, import/no-extraneous-dependencies */
jest.mock('../api/auth', () => ({
  login: jest.fn(),
  register: jest.fn(),
  getProfile: jest.fn(),
}))
jest.mock('../services/secureStorage', () => ({
  saveTokens: jest.fn(),
  loadTokens: jest.fn(),
  clearTokens: jest.fn(),
}))

const { configureStore } = require('@reduxjs/toolkit')
const reducer = require('./auth.slice').default
const { login, logout, bootstrap } = require('./auth.slice')
const authApi = require('../api/auth')
const storage = require('../services/secureStorage')

const newStore = () => configureStore({ reducer: { auth: reducer } })

describe('auth.slice', () => {
  beforeEach(() => {
    authApi.login.mockReset()
    authApi.getProfile.mockReset()
    storage.saveTokens.mockReset()
    storage.loadTokens.mockReset()
    storage.clearTokens.mockReset()
  })

  it('login transitions idle → loading → authed', async () => {
    authApi.login.mockResolvedValue({ accessToken: 'A', refreshToken: 'R' })
    authApi.getProfile.mockResolvedValue({ id: 'u1', email: 'a@b.c' })
    const store = newStore()
    expect(store.getState().auth.status).toBe('idle')
    await store.dispatch(login({ email: 'a@b.c', password: 'pw' }))
    expect(store.getState().auth.status).toBe('authed')
    expect(store.getState().auth.user.email).toBe('a@b.c')
    expect(storage.saveTokens).toHaveBeenCalledWith('A', 'R')
  })

  it('login → error sets status=error and message', async () => {
    authApi.login.mockRejectedValue({
      response: { data: { error_key: 'ErrUsernameOrPasswordInvalid' } },
    })
    const store = newStore()
    await store.dispatch(login({ email: 'a@b.c', password: 'wrong' }))
    expect(store.getState().auth.status).toBe('error')
    expect(store.getState().auth.error).toBe('Wrong email or password')
  })

  it('logout clears storage and resets state', async () => {
    const store = newStore()
    authApi.login.mockResolvedValue({ accessToken: 'A', refreshToken: 'R' })
    authApi.getProfile.mockResolvedValue({ id: 'u1', email: 'a@b.c' })
    await store.dispatch(login({ email: 'a@b.c', password: 'pw' }))
    await store.dispatch(logout())
    expect(store.getState().auth.status).toBe('idle')
    expect(store.getState().auth.user).toBeNull()
    expect(storage.clearTokens).toHaveBeenCalled()
  })

  it('bootstrap with stored tokens hydrates user (and sets bootstrapped)', async () => {
    storage.loadTokens.mockResolvedValue({ access: 'A', refresh: 'R' })
    authApi.getProfile.mockResolvedValue({ id: 'u1', email: 'a@b.c' })
    const store = newStore()
    await store.dispatch(bootstrap())
    expect(store.getState().auth.status).toBe('authed')
    expect(store.getState().auth.user.id).toBe('u1')
    expect(store.getState().auth.bootstrapped).toBe(true)
  })

  it('bootstrap with no tokens lands at idle (and sets bootstrapped)', async () => {
    storage.loadTokens.mockResolvedValue(null)
    const store = newStore()
    await store.dispatch(bootstrap())
    expect(store.getState().auth.status).toBe('idle')
    expect(store.getState().auth.bootstrapped).toBe(true)
  })
})
