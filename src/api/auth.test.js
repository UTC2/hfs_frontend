/* eslint-disable global-require, import/no-extraneous-dependencies */
jest.mock('../services/secureStorage', () => ({
  loadTokens: jest.fn().mockResolvedValue(null),
  saveTokens: jest.fn(),
  clearTokens: jest.fn(),
}))

const MockAdapter = require('axios-mock-adapter')
const { client } = require('./client')
const auth = require('./auth')

let mock
beforeEach(() => {
  mock = new MockAdapter(client)
})
afterEach(() => mock.restore())

describe('auth API', () => {
  it('login posts credentials and returns tokens', async () => {
    mock.onPost('/login').reply((cfg) => {
      expect(JSON.parse(cfg.data)).toEqual({ email: 'a@b.c', password: 'pw' })
      return [
        200,
        {
          data: {
            access_token: { token: 'A', expiry: 900 },
            refresh_token: { token: 'R', expiry: 2592000 },
          },
        },
      ]
    })
    const out = await auth.login({ email: 'a@b.c', password: 'pw' })
    expect(out).toEqual({ accessToken: 'A', refreshToken: 'R' })
  })

  it('register posts user data and returns user id', async () => {
    mock.onPost('/register').reply((cfg) => {
      const body = JSON.parse(cfg.data)
      expect(body.email).toBe('a@b.c')
      return [200, { data: 'user-uid-123' }]
    })
    const out = await auth.register({
      email: 'a@b.c',
      password: 'pw',
      first_name: 'A',
      last_name: 'B',
    })
    expect(out.userId).toBe('user-uid-123')
  })

  it('getProfile returns user object', async () => {
    mock.onGet('/profile').reply(200, { data: { id: 'u1', email: 'a@b.c' } })
    const out = await auth.getProfile()
    expect(out).toEqual({ id: 'u1', email: 'a@b.c' })
  })
})
