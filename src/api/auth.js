/* eslint-disable camelcase */
// snake_case identifiers come from the backend wire format and are intentional.
import { client } from './client'

export const login = async ({ email, password }) => {
  const res = await client.post('/login', { email, password })
  const { access_token, refresh_token } = res.data.data
  return {
    accessToken: access_token.token,
    refreshToken: refresh_token.token,
  }
}

export const register = async ({
  email, password, first_name, last_name,
}) => {
  const res = await client.post('/register', {
    email,
    password,
    first_name,
    last_name,
  })
  return { userId: res.data.data }
}

export const getProfile = async () => {
  const res = await client.get('/profile')
  return res.data.data
}

export const refresh = async (refreshToken) => {
  const res = await client.post('/refresh', { refresh_token: refreshToken })
  const { access_token, refresh_token } = res.data.data
  return {
    accessToken: access_token.token,
    refreshToken: refresh_token.token,
  }
}

export default {
  login,
  register,
  getProfile,
  refresh,
}
