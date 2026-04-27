# hfs_backend Fixes & Hardening — Design

**Date:** 2026-04-27
**Repo:** `UTC2/hfs_backend` (branch will be `fix/auth-and-hardening`)
**Author:** Daniel Du (`danghoangnhan`)
**Companion spec:** `2026-04-27-hfs-frontend-cleanup-design.md`

## Goals

1. Make the existing auth contract usable end-to-end (today, every protected endpoint crashes).
2. Remove the most dangerous security defects (broken password hashing, vulnerable JWT lib, leaked secrets file).
3. Add a refresh-token flow so client sessions survive longer than the access-token lifetime without prompting users.
4. Tighten authorization on write endpoints.
5. Sanitize the repository so a future leak of `dev.env` is structurally impossible.

## Non-goals

- Rewriting the codebase, changing frameworks, restructuring modules, or moving away from gin/GORM.
- Migrating S3 / `/upload` — depends on AWS keys outside this project's control.
- Production deployment changes; only the source repo and `docker-compose.yml` port mapping.
- A full RBAC system; `role` stays a string, no per-resource policies.

## Architecture

The change set divides into four layers, each independently verifiable.

### Layer 1 — Token provider (`component/tokenprovider/jwt`)

Replace `dgrijalva/jwt-go v3.2.0+incompatible` (CVE-2020-26160, abandoned 2018) with `github.com/golang-jwt/jwt/v5`. The provider gains:

- **`Generate(payload, expiry)`** — unchanged signature, swapped lib.
- **`Validate(token)`** — currently `panic("implement me")`. New impl: `jwt.ParseWithClaims` with the same HS256 secret, reject if `!token.Valid`, return `tokenprovider.ErrInvalidToken` for parse/expiry/signature failures. Decodes the `payload` claim into `TokenPayload{UserId, Role}`.

Two distinct signing keys: access token uses `SYSTEM_SECRET`, refresh token uses a new `REFRESH_SECRET` env var. Both 32+ bytes, generated via `openssl rand -hex 32`.

Lifetimes: access = 15 min, refresh = 30 days. Login returns both; refresh endpoint accepts a refresh token, returns a new access+refresh pair (rotation).

### Layer 2 — Password hashing (`component/hasher`)

`bcrypt.go` (new): wraps `golang.org/x/crypto/bcrypt` with cost 12. `Hash(plain) → string`, `Verify(plain, hashed) → bool`.

`md5.go` is **kept** but used only by the legacy-verifier path during migration. It's no longer constructed for new password creation.

**Migration pattern** (in `userbiz/login.go`):

```
on Login(email, password):
    user = findUser(email)
    if user.Password starts with "$2a$" or "$2b$":   # bcrypt prefix
        ok = bcrypt.Verify(password, user.Password)
    else:                                             # legacy MD5+salt
        ok = md5.Hash(password + user.Salt) == user.Password
        if ok:
            user.Password = bcrypt.Hash(password)     # transparent re-hash
            user.Salt = ""
            store.UpdateUser(user)
    if not ok: return ErrUsernameOrPasswordInvalid
    issue tokens
```

`userbiz/register.go` always uses bcrypt; the `salt` column becomes vestigial (kept in DB schema, written as `""`, can be dropped in a later migration).

`common/salt.go` keeps `GenSalt` for any non-password use, but is rewritten on `crypto/rand` instead of `math/rand`.

### Layer 3 — Recover & authorize middleware (`middleware/`)

`recover.go` currently re-`panic(err)` after `AbortWithStatusJSON`, which corrupts gin's response state and recurses on the next request. Rewrite as a single defer-recover that:

1. Coerces the recovered value to `*common.AppError`. If it's a plain `error`, wrap with `ErrInternal`. If it's anything else (string, nil, custom type), wrap with `ErrInternal(fmt.Errorf("%v", v))`.
2. `AbortWithStatusJSON` once, return.
3. No re-panic.

`authorize.go` stops `panic`-ing for control flow. Replace `panic(err)` with `c.AbortWithStatusJSON(appErr.StatusCode, appErr); return`. The recover middleware then becomes a true safety net for unexpected panics, not a normal-path branch.

### Layer 4 — Routes (`main.go`)

- Remove the duplicate `r.POST("/upload", ...)` line. Keep `/v1/upload` only, and add the auth middleware to it.
- New routes: `POST /v1/refresh` (handler in `modules/user/usertransport/ginuser/refresh.go`).
- **Breaking change**: move all top-level resource groups under `/v1`. Today the routes are `/products`, `/houses`, `/upload`. After this PR they are `/v1/products`, `/v1/houses`, `/v1/upload`. The backend has no released clients other than this app, so the break is acceptable; the frontend axios `baseURL` points at `/v1` and gets the simpler call sites as a payoff.
- Add `middleware.RequiredAuth(appCtx)` to `POST/PATCH/DELETE` on `/v1/products` and `/v1/houses`. `GET` endpoints stay public — students browse listings without signing in.

## Data flow

### Login

```
client → POST /v1/login {email, password}
backend → findUser → verify password (bcrypt or legacy-md5+migrate)
       → issue access+refresh tokens
       → 200 {"data": {"access_token": {token, expiry, created},
                        "refresh_token": {token, expiry, created}}}
client stores both in expo-secure-store
```

### Authenticated request

```
client → axios interceptor adds "Authorization: Bearer <access>"
backend → RequiredAuth: extract → Validate → load user → c.Set("user", user) → handler
```

### 401 → refresh

```
backend returns 401 ErrInvalidToken
client interceptor catches 401 → POST /v1/refresh {refresh_token}
backend validates refresh token (different secret) → rotates pair → returns new access+refresh
client retries original request with new access
if refresh also fails → clear secure-store, navigate to Login
```

## Error handling

Status codes get a small re-mapping. Today every error funnels through `NewErrorResponse` with `StatusBadRequest`. New mapping:

| Error | Status | Key |
|---|---|---|
| `ErrUsernameOrPasswordInvalid` | 401 | unchanged |
| `ErrEmailExisted` | 409 | unchanged |
| `ErrInvalidToken` | 401 | unchanged |
| `ErrWrongAuthHeader` | 401 | unchanged |
| `ErrNoPermission` | 403 | unchanged |
| `ErrInvalidRequest` | 400 | unchanged |
| `ErrInternal` | 500 | unchanged |
| Entity not found | 404 | new |

Response envelope is unchanged: `{status_code, message, log, error_key}` — frontend keys off `error_key`.

## Repo hygiene

- Delete `dev.env`. Replace with `dev.env.example` (variable names only, no values).
- Add `*.env` to `.gitignore`.
- The `dev.env` will remain in git history — call this out in the PR; the AWS owner is the only person who can fully neutralize the leak. The PR enables GitHub secret-scanning push protection.
- `docker-compose.yml`: add `ports: ["8080:8080"]` to the `hfs_backend` service so the frontend on the host can reach it (`http://10.0.2.2:8080` from Android emulator).

## SQLModel JSON tags

`common/sql_model.go` currently has `json:"status"` on three fields — `Status`, `CreateAt`, `UpdateAt`. Fix to:

```
Id        int        `json:"-"`
FakeId    *UID       `json:"id"`
Status    int        `json:"status"`
CreateAt  *time.Time `json:"created_at"`   # was: "status"
UpdateAt  *time.Time `json:"updated_at"`   # was: "status"
```

Frontend treats `created_at`/`updated_at` as ISO 8601 strings.

## Testing

Tests live next to the code (`*_test.go`):

- `component/tokenprovider/jwt/jwt_test.go` — Generate→Validate round-trip; tampered token → `ErrInvalidToken`; expired token → `ErrInvalidToken`; mismatched secret → `ErrInvalidToken`.
- `component/hasher/bcrypt_test.go` — Hash→Verify round-trip; wrong password fails; cost is 12.
- `modules/user/userbiz/login_test.go` — bcrypt path, MD5-legacy path with re-hash, wrong-password path. Uses an in-memory `LoginStorage` mock.
- `middleware/recover_test.go` — recovers from `*AppError`, plain `error`, and string panics without crashing or re-panicking.

CI: GitHub Actions runs `go vet ./... && go test ./...` on push to any branch.

## Out-of-scope follow-ups (tracked as issues)

- Rotate AWS keys (account `738233747789`, region `ap-southeast-1`) — owner action.
- Drop the `salt` column from `users` table after all legacy MD5 hashes have been migrated.
- Add per-user resource ownership checks (e.g., user can only DELETE their own product/house).
- `houseLike` / `productLike` modules are unreviewed; assume the same pattern applies.
