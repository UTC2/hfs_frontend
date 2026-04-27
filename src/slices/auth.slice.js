/* eslint-disable no-param-reassign, camelcase */
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import * as authApi from '../api/auth'
import { saveTokens, loadTokens, clearTokens } from '../services/secureStorage'
import { mapErrorToMessage } from '../api/errors'

const initialState = {
  status: 'idle',
  bootstrapped: false,
  user: null,
  error: null,
}

export const login = createAsyncThunk(
  'auth/login',
  async ({ email, password }, { rejectWithValue }) => {
    try {
      const { accessToken, refreshToken } = await authApi.login({
        email,
        password,
      })
      await saveTokens(accessToken, refreshToken)
      const user = await authApi.getProfile()
      return user
    } catch (err) {
      return rejectWithValue(mapErrorToMessage(err))
    }
  },
)

export const register = createAsyncThunk(
  'auth/register',
  async (
    {
      email, password, first_name, last_name,
    },
    { dispatch, rejectWithValue },
  ) => {
    try {
      await authApi.register({
        email,
        password,
        first_name,
        last_name,
      })
      return dispatch(login({ email, password })).unwrap()
    } catch (err) {
      return rejectWithValue(mapErrorToMessage(err))
    }
  },
)

export const bootstrap = createAsyncThunk(
  'auth/bootstrap',
  async (_, { rejectWithValue }) => {
    const tokens = await loadTokens()
    if (!tokens) return null
    try {
      const user = await authApi.getProfile()
      return user
    } catch (err) {
      await clearTokens()
      return rejectWithValue(mapErrorToMessage(err))
    }
  },
)

export const logout = createAsyncThunk('auth/logout', async () => {
  await clearTokens()
})

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => {
        state.status = 'loading'
        state.error = null
      })
      .addCase(login.fulfilled, (state, { payload }) => {
        state.status = 'authed'
        state.user = payload
        state.error = null
      })
      .addCase(login.rejected, (state, { payload }) => {
        state.status = 'error'
        state.error = payload || 'Login failed'
      })
      .addCase(register.pending, (state) => {
        state.status = 'loading'
        state.error = null
      })
      .addCase(register.rejected, (state, { payload }) => {
        state.status = 'error'
        state.error = payload || 'Registration failed'
      })
      .addCase(bootstrap.pending, (state) => {
        state.status = 'loading'
      })
      .addCase(bootstrap.fulfilled, (state, { payload }) => {
        state.bootstrapped = true
        if (payload) {
          state.status = 'authed'
          state.user = payload
        } else {
          state.status = 'idle'
        }
      })
      .addCase(bootstrap.rejected, (state) => {
        state.bootstrapped = true
        state.status = 'idle'
      })
      .addCase(logout.fulfilled, (state) => {
        state.status = 'idle'
        state.user = null
        state.error = null
      })
  },
})

export const { clearError } = authSlice.actions
export default authSlice.reducer
