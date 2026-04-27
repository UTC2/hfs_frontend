# hfs_frontend Phase 4 — Auth Feature Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement login/register/profile against the (now-fixed) `UTC2/hfs_backend` JWT contract — including secure token storage, automatic refresh-on-401, a gated router, and the first-ever tests in the codebase.

**Architecture:** New `src/api/` (axios client + auth wrappers + error mapping), new `src/services/secureStorage.js` (expo-secure-store wrapper), `auth.slice` replaces stub `app.slice`, two new screens (Login, Register), Profile is rewritten to consume real user data, Navigator gates AuthStack vs DrawerNavigator on auth status, App.js boots a hydrate-tokens-then-fetch-profile flow.

**Tech Stack:** axios 1.x, expo-secure-store, Redux Toolkit (createAsyncThunk), React Navigation, Jest.

---

## Pre-flight

- [ ] **Backend PR (`fix/auth-and-hardening`) MUST be merged on `UTC2/hfs_backend`.** This phase integrates against the fixed `Validate()`, refresh endpoint, /v1 namespace, and 401 status codes.
- [ ] **Phases 1–3 merged** on this repo. Phase 3 in particular: this plan assumes RTK ≥ 1.9 (for `createAsyncThunk`), modern React Navigation, and a working Hermes JS runtime.
- [ ] **Backend running locally:**
  ```bash
  cd /tmp/hfs_backend && docker-compose up -d
  curl http://localhost:8080/ping
  # expected: {"message":"pong"}
  ```
- [ ] **Branch:**
  ```bash
  cd /home/daniel/hfs_frontend
  git checkout main && git pull --ff-only
  git checkout -b feat/auth
  ```
- [ ] **Install new deps:**
  ```bash
  npx expo install expo-secure-store
  ```

---

## Task 1: Set up Jest config and a smoke test

**Files:**
- Modify: `package.json` (jest config — already there, verify it works)
- Create: `src/__tests__/smoke.test.js`

- [ ] **Step 1.1: Write smoke test**

Create `src/__tests__/smoke.test.js`:

```js
describe('jest smoke', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 1.2: Run jest**

```bash
yarn test
```

Expected: 1 test, passes. (If config is broken, fix it now before adding more tests.)

- [ ] **Step 1.3: Commit**

```bash
git add src/__tests__/smoke.test.js
git commit -m "$(cat <<'EOF'
test: add jest smoke test

Confirms jest-expo preset is wired correctly before adding real tests.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Implement `secureStorage` service

**Files:**
- Create: `src/services/secureStorage.js`
- Create: `src/services/secureStorage.test.js`

- [ ] **Step 2.1: Write the failing test**

Create `src/services/secureStorage.test.js`:

```js
jest.mock('expo-secure-store', () => {
  const store = new Map()
  return {
    setItemAsync: jest.fn(async (k, v) => { store.set(k, v) }),
    getItemAsync: jest.fn(async (k) => store.get(k) ?? null),
    deleteItemAsync: jest.fn(async (k) => { store.delete(k) }),
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
```

- [ ] **Step 2.2: Run, confirm failure**

```bash
yarn test src/services/secureStorage.test.js
```

Expected: test file errors with "Cannot find module './secureStorage'".

- [ ] **Step 2.3: Implement secureStorage**

Create `src/services/secureStorage.js`:

```js
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
```

- [ ] **Step 2.4: Run tests, confirm pass**

```bash
yarn test src/services/secureStorage.test.js
```

Expected: 3 tests pass.

- [ ] **Step 2.5: Commit**

```bash
git add src/services/secureStorage.js src/services/secureStorage.test.js
git commit -m "$(cat <<'EOF'
feat(auth): add secureStorage service backed by expo-secure-store

Single-key JSON blob under 'hfs.auth.tokens'. Used by the axios client
and auth slice to hydrate sessions across app restarts.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Implement axios client with Bearer + refresh interceptors

**Files:**
- Create: `src/api/client.js`
- Create: `src/api/client.test.js`

- [ ] **Step 3.1: Write failing tests**

Create `src/api/client.test.js`:

```js
jest.mock('../services/secureStorage', () => ({
  loadTokens: jest.fn(),
  saveTokens: jest.fn(),
  clearTokens: jest.fn(),
}))

const MockAdapter = require('axios-mock-adapter')
const { loadTokens, saveTokens, clearTokens } = require('../services/secureStorage')
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
    mock.onPost('/login').reply(401, { error_key: 'ErrUsernameOrPasswordInvalid' })
    await expect(client.post('/login', {})).rejects.toBeDefined()
    expect(mock.history.post.filter((r) => r.url === '/refresh')).toHaveLength(0)
  })
})
```

- [ ] **Step 3.2: Add axios-mock-adapter as devDep**

```bash
yarn add --dev axios-mock-adapter@^1
```

- [ ] **Step 3.3: Confirm test failure**

```bash
yarn test src/api/client.test.js
```

Expected: cannot find `./client` module.

- [ ] **Step 3.4: Implement client**

Create `src/api/client.js`:

```js
import axios from 'axios'
import { loadTokens, saveTokens, clearTokens } from '../services/secureStorage'

const baseURL = process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:8080/v1'

export const client = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 10000,
})

// Request: attach Bearer access token if present
client.interceptors.request.use(async (config) => {
  const tokens = await loadTokens()
  if (tokens?.access) {
    config.headers.Authorization = `Bearer ${tokens.access}`
  }
  return config
})

// Response: on 401 ErrInvalidToken, attempt single refresh
let refreshing = null

client.interceptors.response.use(
  (res) => res,
  async (error) => {
    const status = error.response?.status
    const key = error.response?.data?.error_key
    const original = error.config

    // Only attempt refresh on token-specific 401, never on credential 401.
    const isTokenExpired = status === 401 && key === 'ErrInvalidToken'
    if (!isTokenExpired || original._retried) {
      // For credential failures (wrong password, etc.) just propagate.
      if (status === 401 && key !== 'ErrInvalidToken' && !original.url.endsWith('/refresh')) {
        // Pass through — the calling code handles "wrong email/password".
      }
      return Promise.reject(error)
    }

    original._retried = true

    try {
      if (!refreshing) {
        refreshing = (async () => {
          const tokens = await loadTokens()
          const res = await axios.post(`${baseURL}/refresh`, { refresh_token: tokens?.refresh })
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
  }
)
```

- [ ] **Step 3.5: Run tests, fix as needed**

```bash
yarn test src/api/client.test.js
```

Expected: all 4 tests pass.

- [ ] **Step 3.6: Commit**

```bash
git add src/api/client.js src/api/client.test.js package.json yarn.lock
git commit -m "$(cat <<'EOF'
feat(api): axios client with Bearer + 401-refresh interceptors

- Single axios instance, baseURL from EXPO_PUBLIC_API_URL with
  Android emulator default (10.0.2.2:8080/v1)
- Request interceptor attaches Bearer access token if stored
- Response interceptor refreshes on 401 ErrInvalidToken (not on
  generic 401 like wrong-password), shares one in-flight refresh
  promise across concurrent failures, retries once, clears storage
  if refresh itself fails

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Implement auth API wrappers and error map

**Files:**
- Create: `src/api/auth.js`
- Create: `src/api/auth.test.js`
- Create: `src/api/errors.js`

- [ ] **Step 4.1: Implement error map**

Create `src/api/errors.js`:

```js
const KEY_TO_MESSAGE = {
  ErrUsernameOrPasswordInvalid: 'Wrong email or password',
  ErrEmailExisted: 'An account with this email already exists',
  ErrWrongAuthHeader: 'Please sign in again',
  ErrInvalidRequest: 'Please check your input and try again',
  ErrInternal: 'Something went wrong. Please try again.',
  ErrNoPermission: "You don't have permission to do that",
}

const FALLBACK = 'Something went wrong. Please try again.'

/**
 * Map an axios error or backend AppError envelope to a user-facing string.
 */
export const mapErrorToMessage = (err) => {
  if (!err?.response?.data) {
    if (err?.message?.includes('Network')) return 'No network. Please check your connection.'
    return FALLBACK
  }
  const key = err.response.data.error_key
  return KEY_TO_MESSAGE[key] ?? FALLBACK
}

export default mapErrorToMessage
```

- [ ] **Step 4.2: Write auth API tests**

Create `src/api/auth.test.js`:

```js
const MockAdapter = require('axios-mock-adapter')
const { client } = require('./client')
const auth = require('./auth')

jest.mock('../services/secureStorage', () => ({
  loadTokens: jest.fn().mockResolvedValue(null),
  saveTokens: jest.fn(),
  clearTokens: jest.fn(),
}))

let mock
beforeEach(() => { mock = new MockAdapter(client) })
afterEach(() => mock.restore())

describe('auth API', () => {
  it('login posts credentials and returns tokens', async () => {
    mock.onPost('/login').reply((cfg) => {
      expect(JSON.parse(cfg.data)).toEqual({ email: 'a@b.c', password: 'pw' })
      return [200, { data: {
        access_token: { token: 'A', expiry: 900 },
        refresh_token: { token: 'R', expiry: 2592000 },
      } }]
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
      email: 'a@b.c', password: 'pw', first_name: 'A', last_name: 'B',
    })
    expect(out.userId).toBe('user-uid-123')
  })

  it('getProfile returns user object', async () => {
    mock.onGet('/profile').reply(200, { data: { id: 'u1', email: 'a@b.c' } })
    const out = await auth.getProfile()
    expect(out).toEqual({ id: 'u1', email: 'a@b.c' })
  })
})
```

- [ ] **Step 4.3: Run tests, expect failure**

```bash
yarn test src/api/auth.test.js
```

Expected: cannot find `./auth`.

- [ ] **Step 4.4: Implement auth wrappers**

Create `src/api/auth.js`:

```js
import { client } from './client'

export const login = async ({ email, password }) => {
  const res = await client.post('/login', { email, password })
  const { access_token, refresh_token } = res.data.data
  return {
    accessToken: access_token.token,
    refreshToken: refresh_token.token,
  }
}

export const register = async ({ email, password, first_name, last_name }) => {
  const res = await client.post('/register', { email, password, first_name, last_name })
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

export default { login, register, getProfile, refresh }
```

- [ ] **Step 4.5: Run tests, confirm pass**

```bash
yarn test src/api/
```

Expected: all auth + client tests pass.

- [ ] **Step 4.6: Commit**

```bash
git add src/api/auth.js src/api/auth.test.js src/api/errors.js
git commit -m "$(cat <<'EOF'
feat(api): auth wrappers + error_key → message map

login/register/getProfile/refresh return typed-shaped objects.
Error map covers all 7 backend error_keys with user-facing copy.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Replace `app.slice` with `auth.slice`

**Files:**
- Delete: `src/slices/app.slice.js`
- Create: `src/slices/auth.slice.js`
- Create: `src/slices/auth.slice.test.js`
- Modify: `src/utils/store.js`

- [ ] **Step 5.1: Write slice tests**

Create `src/slices/auth.slice.test.js`:

```js
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
    // pre-load some authed state
    authApi.login.mockResolvedValue({ accessToken: 'A', refreshToken: 'R' })
    authApi.getProfile.mockResolvedValue({ id: 'u1', email: 'a@b.c' })
    await store.dispatch(login({ email: 'a@b.c', password: 'pw' }))
    await store.dispatch(logout())
    expect(store.getState().auth.status).toBe('idle')
    expect(store.getState().auth.user).toBeNull()
    expect(storage.clearTokens).toHaveBeenCalled()
  })

  it('bootstrap with stored tokens hydrates user', async () => {
    storage.loadTokens.mockResolvedValue({ access: 'A', refresh: 'R' })
    authApi.getProfile.mockResolvedValue({ id: 'u1', email: 'a@b.c' })
    const store = newStore()
    await store.dispatch(bootstrap())
    expect(store.getState().auth.status).toBe('authed')
    expect(store.getState().auth.user.id).toBe('u1')
  })

  it('bootstrap with no tokens lands at idle', async () => {
    storage.loadTokens.mockResolvedValue(null)
    const store = newStore()
    await store.dispatch(bootstrap())
    expect(store.getState().auth.status).toBe('idle')
  })
})
```

- [ ] **Step 5.2: Confirm test failure**

```bash
yarn test src/slices/auth.slice.test.js
```

Expected: cannot find module.

- [ ] **Step 5.3: Implement the slice**

Create `src/slices/auth.slice.js`:

```js
/* eslint-disable no-param-reassign */
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import * as authApi from '../api/auth'
import { saveTokens, loadTokens, clearTokens } from '../services/secureStorage'
import { mapErrorToMessage } from '../api/errors'

const initialState = {
  status: 'idle', // 'idle' | 'loading' | 'authed' | 'error'
  user: null,
  error: null,
}

export const login = createAsyncThunk(
  'auth/login',
  async ({ email, password }, { rejectWithValue }) => {
    try {
      const { accessToken, refreshToken } = await authApi.login({ email, password })
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
  async ({ email, password, first_name, last_name }, { dispatch, rejectWithValue }) => {
    try {
      await authApi.register({ email, password, first_name, last_name })
      // Auto-login after register so the user lands inside the app.
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
      // Refresh interceptor already ran; if we still got an error,
      // tokens are bad — fall back to idle.
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
    clearError: (state) => { state.error = null },
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => { state.status = 'loading'; state.error = null })
      .addCase(login.fulfilled, (state, { payload }) => {
        state.status = 'authed'
        state.user = payload
        state.error = null
      })
      .addCase(login.rejected, (state, { payload }) => {
        state.status = 'error'
        state.error = payload || 'Login failed'
      })
      .addCase(register.pending, (state) => { state.status = 'loading'; state.error = null })
      .addCase(register.rejected, (state, { payload }) => {
        state.status = 'error'
        state.error = payload || 'Registration failed'
      })
      // register.fulfilled is handled by the inner login thunk's fulfilled
      .addCase(bootstrap.pending, (state) => { state.status = 'loading' })
      .addCase(bootstrap.fulfilled, (state, { payload }) => {
        if (payload) {
          state.status = 'authed'
          state.user = payload
        } else {
          state.status = 'idle'
        }
      })
      .addCase(bootstrap.rejected, (state) => {
        state.status = 'idle' // bad tokens → unauthed silently on cold start
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
```

- [ ] **Step 5.4: Update store**

Replace `src/utils/store.js`:

```js
import { configureStore, combineReducers } from '@reduxjs/toolkit'
import logger from 'redux-logger'
import authReducer from 'slices/auth.slice'

const rootReducer = combineReducers({
  auth: authReducer,
})

const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefault) => {
    const base = getDefault({ serializableCheck: false, immutableCheck: false })
    // eslint-disable-next-line no-undef
    return __DEV__ ? base.concat(logger) : base
  },
})

export default store
```

- [ ] **Step 5.5: Delete old slice**

```bash
git rm src/slices/app.slice.js
```

- [ ] **Step 5.6: Run tests**

```bash
yarn test src/slices/
```

Expected: 5 auth.slice tests pass.

- [ ] **Step 5.7: Commit**

```bash
git add src/slices/auth.slice.js src/slices/auth.slice.test.js src/utils/store.js src/slices/app.slice.js
git commit -m "$(cat <<'EOF'
feat(auth): replace stub app.slice with auth.slice + thunks

State machine: idle → loading → authed | error. Thunks for login,
register (auto-logins on success), bootstrap (cold-start hydration
from secure storage), logout (clears storage + state).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Build Login screen

**Files:**
- Create: `src/pages/Login/Login.js`
- Create: `src/pages/Login/index.js`

- [ ] **Step 6.1: Implement Login screen**

Create `src/pages/Login/Login.js`:

```jsx
import React, { useState } from 'react'
import {
  StyleSheet, Text, View, TextInput, ActivityIndicator, TouchableOpacity,
} from 'react-native'
import { useDispatch, useSelector } from 'react-redux'
import Button from 'components/Button'
import { colors } from 'theme'
import { login, clearError } from 'slices/auth.slice'

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
    paddingHorizontal: 32,
    backgroundColor: colors.lightGrayPurple,
  },
  title: { fontSize: 28, marginBottom: 24, textAlign: 'center', color: colors.darkPurple },
  input: {
    backgroundColor: 'white',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    fontSize: 16,
  },
  errorBanner: {
    backgroundColor: '#fee',
    color: colors.pink,
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    textAlign: 'center',
  },
  link: { color: colors.purple, marginTop: 16, textAlign: 'center' },
})

const Login = ({ navigation }) => {
  const dispatch = useDispatch()
  const { status, error } = useSelector((s) => s.auth)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const onSubmit = () => {
    dispatch(login({ email: email.trim(), password }))
  }

  const isLoading = status === 'loading'

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Sign in</Text>
      {!!error && <Text style={styles.errorBanner}>{error}</Text>}
      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={(t) => { setEmail(t); if (error) dispatch(clearError()) }}
        editable={!isLoading}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={(t) => { setPassword(t); if (error) dispatch(clearError()) }}
        editable={!isLoading}
      />
      <Button
        title={isLoading ? '' : 'Sign in'}
        color="white"
        backgroundColor={colors.purple}
        onPress={onSubmit}
      >
        {isLoading && <ActivityIndicator color="white" />}
      </Button>
      <TouchableOpacity onPress={() => navigation.navigate('Register')} disabled={isLoading}>
        <Text style={styles.link}>Don't have an account? Register</Text>
      </TouchableOpacity>
    </View>
  )
}

export default Login
```

- [ ] **Step 6.2: Add the index re-export**

Create `src/pages/Login/index.js`:

```js
import Login from './Login'

export default Login
```

- [ ] **Step 6.3: Commit**

```bash
git add src/pages/Login/
git commit -m "$(cat <<'EOF'
feat(auth): Login screen with form, error banner, loading state

Dispatches login thunk; clears slice error on input edit; navigates
to Register on link tap.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Build Register screen

**Files:**
- Create: `src/pages/Register/Register.js`
- Create: `src/pages/Register/index.js`

- [ ] **Step 7.1: Implement Register**

Create `src/pages/Register/Register.js`:

```jsx
import React, { useState } from 'react'
import {
  StyleSheet, Text, View, TextInput, ActivityIndicator, TouchableOpacity,
} from 'react-native'
import { useDispatch, useSelector } from 'react-redux'
import Button from 'components/Button'
import { colors } from 'theme'
import { register, clearError } from 'slices/auth.slice'

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
    backgroundColor: colors.lightGrayPurple,
  },
  title: { fontSize: 28, marginBottom: 24, textAlign: 'center', color: colors.darkPurple },
  input: {
    backgroundColor: 'white',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    fontSize: 16,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  half: { flex: 1 },
  spacer: { width: 8 },
  errorBanner: {
    backgroundColor: '#fee',
    color: colors.pink,
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    textAlign: 'center',
  },
  link: { color: colors.purple, marginTop: 16, textAlign: 'center' },
})

const Register = ({ navigation }) => {
  const dispatch = useDispatch()
  const { status, error } = useSelector((s) => s.auth)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [localErr, setLocalErr] = useState(null)

  const isLoading = status === 'loading'

  const onSubmit = () => {
    if (password !== confirm) {
      setLocalErr('Passwords do not match')
      return
    }
    if (password.length < 8) {
      setLocalErr('Password must be at least 8 characters')
      return
    }
    setLocalErr(null)
    dispatch(register({
      email: email.trim(),
      password,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
    }))
  }

  const visibleError = localErr || error

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Create account</Text>
      {!!visibleError && <Text style={styles.errorBanner}>{visibleError}</Text>}
      <View style={styles.row}>
        <TextInput
          style={[styles.input, styles.half]}
          placeholder="First name"
          value={firstName}
          onChangeText={setFirstName}
          editable={!isLoading}
        />
        <View style={styles.spacer} />
        <TextInput
          style={[styles.input, styles.half]}
          placeholder="Last name"
          value={lastName}
          onChangeText={setLastName}
          editable={!isLoading}
        />
      </View>
      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={(t) => { setEmail(t); if (error) dispatch(clearError()) }}
        editable={!isLoading}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        editable={!isLoading}
      />
      <TextInput
        style={styles.input}
        placeholder="Confirm password"
        secureTextEntry
        value={confirm}
        onChangeText={setConfirm}
        editable={!isLoading}
      />
      <Button
        title={isLoading ? '' : 'Create account'}
        color="white"
        backgroundColor={colors.purple}
        onPress={onSubmit}
      >
        {isLoading && <ActivityIndicator color="white" />}
      </Button>
      <TouchableOpacity onPress={() => navigation.navigate('Login')} disabled={isLoading}>
        <Text style={styles.link}>Already have an account? Sign in</Text>
      </TouchableOpacity>
    </View>
  )
}

export default Register
```

- [ ] **Step 7.2: Index file**

Create `src/pages/Register/index.js`:

```js
import Register from './Register'

export default Register
```

- [ ] **Step 7.3: Commit**

```bash
git add src/pages/Register/
git commit -m "$(cat <<'EOF'
feat(auth): Register screen

Form with first/last/email/password/confirm. Local validation
(matching passwords, min length 8) before dispatch. On success the
auth slice auto-runs login, so user lands inside the app.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Rewrite Profile screen

**Files:**
- Modify: `src/pages/Profile/Profile.js`

- [ ] **Step 8.1: Replace placeholder**

Replace `src/pages/Profile/Profile.js`:

```jsx
import React from 'react'
import {
  StyleSheet, Text, View, Image, StatusBar,
} from 'react-native'
import { useDispatch, useSelector } from 'react-redux'
import Button from 'components/Button'
import { colors } from 'theme'
import { logout } from 'slices/auth.slice'

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.lightGrayPurple,
    paddingHorizontal: 24,
  },
  avatar: { width: 100, height: 100, borderRadius: 50, marginBottom: 16, backgroundColor: '#ddd' },
  name: { fontSize: 24, marginBottom: 4, color: colors.darkPurple },
  email: { fontSize: 16, marginBottom: 24, color: colors.gray },
})

const Profile = () => {
  const dispatch = useDispatch()
  const user = useSelector((s) => s.auth.user)
  if (!user) return null
  const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'No name set'
  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      {user.avatar?.url
        ? <Image source={{ uri: user.avatar.url }} style={styles.avatar} />
        : <View style={styles.avatar} />}
      <Text style={styles.name}>{fullName}</Text>
      <Text style={styles.email}>{user.email}</Text>
      <Button
        title="Sign out"
        color="white"
        backgroundColor={colors.pink}
        onPress={() => dispatch(logout())}
      />
    </View>
  )
}

export default Profile
```

- [ ] **Step 8.2: Commit**

```bash
git add src/pages/Profile/Profile.js
git commit -m "$(cat <<'EOF'
feat(auth): Profile shows real user, sign-out dispatches logout

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Gate the navigator on auth status

**Files:**
- Create: `src/navigator/AuthStack/AuthStack.js`
- Create: `src/navigator/AuthStack/index.js`
- Modify: `src/navigator/Navigator.js`

- [ ] **Step 9.1: Implement AuthStack**

Create `src/navigator/AuthStack/AuthStack.js`:

```jsx
import React from 'react'
import { createStackNavigator } from '@react-navigation/stack'
import Login from 'pages/Login'
import Register from 'pages/Register'

const Stack = createStackNavigator()

const AuthStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="Login">
    <Stack.Screen name="Login" component={Login} />
    <Stack.Screen name="Register" component={Register} />
  </Stack.Navigator>
)

export default AuthStack
```

Create `src/navigator/AuthStack/index.js`:

```js
import AuthStack from './AuthStack'

export default AuthStack
```

- [ ] **Step 9.2: Add `bootstrapped` flag to the slice**

The Navigator needs to distinguish "still hydrating tokens on cold start" (show spinner) from "user is mid-login on the AuthStack" (don't unmount AuthStack). A boolean `bootstrapped` flag does that — flips to `true` on the first settle of `bootstrap` and never changes again.

Update `initialState` in `src/slices/auth.slice.js`:

```js
const initialState = {
  status: 'idle',
  bootstrapped: false,
  user: null,
  error: null,
}
```

Replace the relevant chunk of `extraReducers` with:

```js
.addCase(bootstrap.pending, (state) => { state.status = 'loading' })
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
```

- [ ] **Step 9.3: Implement Navigator using the flag**

Replace `src/navigator/Navigator.js`:

```jsx
import React, { useEffect } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { useSelector, useDispatch } from 'react-redux'
import { bootstrap } from 'slices/auth.slice'

import DrawerNavigator from './Drawer'
import AuthStack from './AuthStack'

const Navigator = () => {
  const dispatch = useDispatch()
  const { status, bootstrapped } = useSelector((s) => s.auth)

  useEffect(() => {
    dispatch(bootstrap())
  }, [dispatch])

  if (!bootstrapped) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    )
  }

  return (
    <NavigationContainer>
      {status === 'authed' ? <DrawerNavigator /> : <AuthStack />}
    </NavigationContainer>
  )
}

export default Navigator
```

- [ ] **Step 9.4: Update slice tests for `bootstrapped`**

In `src/slices/auth.slice.test.js`, the `bootstrap` cases now also assert `bootstrapped: true`. Update the two relevant `it()` blocks accordingly.

- [ ] **Step 9.5: Run tests**

```bash
yarn test src/
```

Expected: all tests pass.

- [ ] **Step 9.6: Commit**

```bash
git add src/navigator/ src/slices/
git commit -m "$(cat <<'EOF'
feat(auth): gate router on auth status with bootstrap flag

Cold start: dispatches bootstrap; renders spinner until bootstrapped;
then routes to AuthStack (Login/Register) or DrawerNavigator (the
existing Home/Tabs/Profile tree) based on auth.status.

The 'bootstrapped' flag prevents AuthStack from unmounting mid-login
when the slice transitions to 'loading'.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Update App.js (cleanup of stub bootstrap)

**Files:**
- Modify: `src/App.js`

- [ ] **Step 10.1: Drop the stub `Navigator.js` dispatch we removed**

(Already replaced in Task 9 — the old `dispatch(authenticate(...))` is gone. App.js itself already wraps in Provider; no change needed.)

Verify `src/App.js` looks correct (no stray imports of the removed `app.slice`):

```bash
grep -n "app.slice\|app/slice\|authenticate" src/App.js src/index.js App.js
```

Expected: no matches.

- [ ] **Step 10.2: If clean, no commit needed.** Otherwise fix and commit `chore(app): drop dangling references to old app.slice`.

---

## Task 11: End-to-end smoke test against running backend

- [ ] **Step 11.1: Backend up**

```bash
cd /tmp/hfs_backend && docker-compose up -d
```

- [ ] **Step 11.2: App on emulator**

```bash
cd /home/daniel/hfs_frontend
yarn start --reset-cache
yarn android
```

- [ ] **Step 11.3: Walk the flows**

1. **Cold start, no tokens** → spinner → Login screen.
2. Tap "Don't have an account? Register" → Register screen.
3. Fill form: First "Smoke", Last "Test", email `smoke+1@test.dev`, password `hunter22`, confirm `hunter22`. Submit.
4. Expect: brief spinner → drawer-navigated app, Profile shows "Smoke Test" / `smoke+1@test.dev`.
5. Open drawer → Profile → tap "Sign out". Expect: back to Login.
6. Login with `smoke+1@test.dev` / wrong password → red banner "Wrong email or password".
7. Login with correct password → app.
8. Force-quit and reopen → spinner → app (token hydrated from secure-store).

- [ ] **Step 11.4: Verify the bad-token recovery path**

```bash
# In a third terminal, while the app is running:
adb shell run-as io.github.danghoangnhan.hfs ls
# (expo-secure-store on Android persists in EncryptedSharedPreferences;
# easiest tampering is to simulate token expiry)
```

Skip if too involved; the unit tests in Task 3 already cover the interceptor logic. Smoke proves the happy path.

---

## Task 12: Open PR

- [ ] **Step 12.1: Push and open**

```bash
git push -u origin feat/auth
gh pr create --base main --title "feat: auth (Phase 4)" --body "$(cat <<'EOF'
Phase 4 of the cleanup project. Depends on backend PR \`fix/auth-and-hardening\` being merged.

## Summary

End-to-end auth wired against \`UTC2/hfs_backend\`'s \`/v1/login\`, \`/v1/register\`, \`/v1/profile\`, \`/v1/refresh\`.

- \`src/services/secureStorage.js\` — expo-secure-store wrapper
- \`src/api/client.js\` — axios with Bearer + 401-refresh interceptor (only refreshes on \`ErrInvalidToken\`, not on credential failures)
- \`src/api/auth.js\` — typed wrappers for all four auth endpoints
- \`src/api/errors.js\` — \`error_key\` → user-facing message map
- \`src/slices/auth.slice.js\` — replaces stub \`app.slice\`. State machine: idle → loading → authed | error. Thunks for login, register (auto-logins), bootstrap (cold-start hydration), logout.
- \`src/pages/Login\`, \`src/pages/Register\` — new screens with validation, error banner, loading state
- \`src/pages/Profile/Profile.js\` — rewrite, shows real user data + sign-out
- \`src/navigator/AuthStack\` + \`Navigator.js\` — gated router

## Tests

First tests in this codebase. Coverage:
- secureStorage round-trip
- axios client: Bearer attach, 401-refresh, refresh-fail-clears-storage, no-refresh-on-credential-401
- auth API wrappers
- auth slice thunks (login → authed, login → error mapped, logout, bootstrap with/without tokens)

## Test plan

- [x] \`yarn test\` all pass
- [x] Cold start → Login → Register → app → Profile → Sign out → Login
- [x] Wrong password → mapped error banner
- [x] Force-quit and reopen → still authed (secure-store hydration)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Verification before merge

- [ ] `yarn test` — all tests pass.
- [ ] Smoke test (Task 11.3) all 8 steps green.
- [ ] No stray references to the deleted `app.slice` (`grep -rn "app.slice" src/` returns nothing).
- [ ] `EXPO_PUBLIC_API_URL` documented in README (cross-reference Phase 1's README for the env var).
