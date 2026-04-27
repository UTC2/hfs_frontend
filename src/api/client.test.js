/* eslint-disable global-require, import/no-extraneous-dependencies */
jest.mock('../services/secureStorage', () => ({
  loadTokens: jest.fn(),
  saveTokens: jest.fn(),
  clearTokens: jest.fn(),
}))

const MockAdapter = require('axios-mock-adapter')
const {
  loadTokens,
  saveTokens,
  clearTokens,
} = require('../services/secureStorage')
const { client } = require('./client')

let mock
beforeEach(() => {
  mock = new MockAdapter(client)
  loadTokens.mockResolvedValue({ access: 'A', refresh: 'R' })
  saveTokens.mockClear()
  clearTokens.mockClear()
})
afterEach(() => mock.restore())

describe('axios client', () => {
  it('attaches Bearer access token', async () => {
    mock.onGet('/profile').reply((cfg) => {
      expect(cfg.headers.Authorization).toBe('Bearer A')
      return [200, { data: { id: 'u1' } }]
    })
    const res = await client.get('/profile')
    expect(res.data.data.id).toBe('u1')
  })

  it('refreshes on 401 ErrInvalidToken and retries', async () => {
    let calls = 0
    mock.onGet('/profile').reply(() => {
      calls += 1
      if (calls === 1) {
        return [401, { error_key: 'ErrInvalidToken', message: 'invalid token' }]
      }
      return [200, { data: { id: 'u1' } }]
    })
    mock.onPost('/refresh').reply(200, {
      data: {
        access_token: { token: 'NEW_A', expiry: 900 },
        refresh_token: { token: 'NEW_R', expiry: 2592000 },
      },
    })
    const res = await client.get('/profile')
    expect(res.data.data.id).toBe('u1')
    expect(saveTokens).toHaveBeenCalledWith('NEW_A', 'NEW_R')
    expect(calls).toBe(2)
  })

  it('clears tokens and propagates when refresh fails', async () => {
    mock.onGet('/profile').reply(401, { error_key: 'ErrInvalidToken' })
    mock.onPost('/refresh').reply(401, { error_key: 'ErrInvalidToken' })
    await expect(client.get('/profile')).rejects.toBeDefined()
    expect(clearTokens).toHaveBeenCalled()
  })

  it('does not refresh on non-token 401 (e.g., wrong password)', async () => {
    mock
      .onPost('/login')
      .reply(401, { error_key: 'ErrUsernameOrPasswordInvalid' })
    await expect(client.post('/login', {})).rejects.toBeDefined()
    expect(mock.history.post.filter((r) => r.url === '/refresh')).toHaveLength(
      0,
    )
  })
})
