# hfs_backend Auth & Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `UTC2/hfs_backend` JWT auth contract usable end-to-end, fix critical security defects (broken `Validate()`, MD5 hashing, vulnerable JWT lib, leaked secrets file, double-panic in recovery), and add a refresh-token flow.

**Architecture:** Four-layer change set — token provider, password hasher, middleware, routes — each independently verifiable. New password hashes use bcrypt (cost 12); legacy MD5+salt records migrate transparently on next successful login.

**Tech Stack:** Go 1.17 (kept), gin-gonic/gin, GORM/MariaDB, `golang-jwt/jwt/v5` (replacing abandoned `dgrijalva/jwt-go`), `golang.org/x/crypto/bcrypt`.

---

## Pre-flight

- [ ] **Confirm AWS leak escalated.** The credentials in `dev.env` (AWS account `738233747789`, MariaDB on `60.251.157.46:3313`, `SYSTEM_SECRET`) cannot be rotated by Daniel. He has notified the AWS account owner. This plan sanitizes the repo but does not undo the historical leak.
- [ ] **Clone the backend repo** outside the frontend directory:
  ```bash
  cd /tmp && git clone git@github.com:UTC2/hfs_backend.git && cd hfs_backend && git checkout dev && git checkout -b fix/auth-and-hardening
  ```
- [ ] **Verify Go toolchain:**
  ```bash
  go version  # expect 1.17+
  ```

---

## Task 1: Migrate JWT library and implement `Validate()`

**Files:**
- Modify: `go.mod`, `go.sum`
- Modify: `component/tokenprovider/jwt/jwt.go`
- Create: `component/tokenprovider/jwt/jwt_test.go`

- [ ] **Step 1.1: Replace JWT dependency**

```bash
go get github.com/golang-jwt/jwt/v5@latest
go mod edit -droprequire github.com/dgrijalva/jwt-go
go mod tidy
```

Expected: `go.mod` requires `github.com/golang-jwt/jwt/v5`, no longer requires `dgrijalva/jwt-go`.

- [ ] **Step 1.2: Write the failing test**

Create `component/tokenprovider/jwt/jwt_test.go`:

```go
package jwt

import (
	"hfs_backend/component/tokenprovider"
	"testing"
	"time"
)

const testSecret = "test-secret-please-change-me-in-prod"

func TestGenerateValidate_RoundTrip(t *testing.T) {
	p := NewTokenJWTProvider(testSecret)
	tok, err := p.Generate(tokenprovider.TokenPayload{UserId: 42, Role: "user"}, 60)
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}
	payload, err := p.Validate(tok.Token)
	if err != nil {
		t.Fatalf("Validate: %v", err)
	}
	if payload.UserId != 42 || payload.Role != "user" {
		t.Errorf("payload mismatch: got %+v", payload)
	}
}

func TestValidate_TamperedToken(t *testing.T) {
	p := NewTokenJWTProvider(testSecret)
	tok, _ := p.Generate(tokenprovider.TokenPayload{UserId: 1, Role: "user"}, 60)
	tampered := tok.Token + "x"
	if _, err := p.Validate(tampered); err == nil {
		t.Fatal("expected error for tampered token")
	}
}

func TestValidate_ExpiredToken(t *testing.T) {
	p := NewTokenJWTProvider(testSecret)
	tok, _ := p.Generate(tokenprovider.TokenPayload{UserId: 1, Role: "user"}, -1)
	time.Sleep(10 * time.Millisecond)
	if _, err := p.Validate(tok.Token); err == nil {
		t.Fatal("expected error for expired token")
	}
}

func TestValidate_WrongSecret(t *testing.T) {
	p1 := NewTokenJWTProvider(testSecret)
	p2 := NewTokenJWTProvider("different-secret")
	tok, _ := p1.Generate(tokenprovider.TokenPayload{UserId: 1, Role: "user"}, 60)
	if _, err := p2.Validate(tok.Token); err == nil {
		t.Fatal("expected error for wrong secret")
	}
}
```

- [ ] **Step 1.3: Run test to verify failure**

```bash
go test ./component/tokenprovider/jwt/...
```

Expected: tests fail because `Validate` panics with `"implement me"` and `Generate` still uses old library.

- [ ] **Step 1.4: Rewrite `jwt.go` against `golang-jwt/jwt/v5`**

Replace `component/tokenprovider/jwt/jwt.go` with:

```go
package jwt

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"hfs_backend/component/tokenprovider"
)

type jwtProvider struct {
	secret string
}

func NewTokenJWTProvider(secret string) *jwtProvider {
	return &jwtProvider{secret: secret}
}

type myClaims struct {
	Payload tokenprovider.TokenPayload `json:"payload"`
	jwt.RegisteredClaims
}

func (j *jwtProvider) Generate(data tokenprovider.TokenPayload, expiry int) (*tokenprovider.Token, error) {
	now := time.Now()
	t := jwt.NewWithClaims(jwt.SigningMethodHS256, myClaims{
		Payload: data,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(time.Duration(expiry) * time.Second)),
			IssuedAt:  jwt.NewNumericDate(now),
		},
	})
	signed, err := t.SignedString([]byte(j.secret))
	if err != nil {
		return nil, tokenprovider.ErrEncodingToken
	}
	return &tokenprovider.Token{
		Token:   signed,
		Expiry:  expiry,
		Created: now,
	}, nil
}

func (j *jwtProvider) Validate(token string) (*tokenprovider.TokenPayload, error) {
	claims := &myClaims{}
	parsed, err := jwt.ParseWithClaims(token, claims, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return []byte(j.secret), nil
	})
	if err != nil || !parsed.Valid {
		return nil, tokenprovider.ErrInvalidToken
	}
	return &claims.Payload, nil
}
```

- [ ] **Step 1.5: Run tests to verify pass**

```bash
go test ./component/tokenprovider/jwt/... -v
```

Expected: all 4 tests pass.

- [ ] **Step 1.6: Commit**

```bash
git add go.mod go.sum component/tokenprovider/jwt/
git commit -m "$(cat <<'EOF'
feat(auth): migrate to golang-jwt/jwt/v5 and implement Validate

Replaces abandoned dgrijalva/jwt-go (CVE-2020-26160) with the maintained
golang-jwt/jwt/v5 fork. Implements the previously-stubbed Validate that
caused every protected endpoint to panic.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Add bcrypt hasher

**Files:**
- Create: `component/hasher/bcrypt.go`
- Create: `component/hasher/bcrypt_test.go`
- Modify: `go.mod`, `go.sum` (bcrypt is in `golang.org/x/crypto`)

- [ ] **Step 2.1: Add bcrypt dependency**

```bash
go get golang.org/x/crypto/bcrypt
go mod tidy
```

- [ ] **Step 2.2: Write the failing test**

Create `component/hasher/bcrypt_test.go`:

```go
package hasher

import "testing"

func TestBcrypt_RoundTrip(t *testing.T) {
	h := NewBcryptHash()
	hashed, err := h.Hash("hunter2")
	if err != nil {
		t.Fatalf("Hash: %v", err)
	}
	if !h.Verify("hunter2", hashed) {
		t.Error("Verify rejected correct password")
	}
	if h.Verify("wrong", hashed) {
		t.Error("Verify accepted wrong password")
	}
}

func TestBcrypt_HashesAreSalted(t *testing.T) {
	h := NewBcryptHash()
	a, _ := h.Hash("same")
	b, _ := h.Hash("same")
	if a == b {
		t.Error("expected different hashes for same input (salt)")
	}
}
```

- [ ] **Step 2.3: Run test to verify failure**

```bash
go test ./component/hasher/... -v -run Bcrypt
```

Expected: compile error — `NewBcryptHash` undefined.

- [ ] **Step 2.4: Implement bcrypt hasher**

Create `component/hasher/bcrypt.go`:

```go
package hasher

import "golang.org/x/crypto/bcrypt"

const bcryptCost = 12

type bcryptHash struct{}

func NewBcryptHash() *bcryptHash {
	return &bcryptHash{}
}

func (h *bcryptHash) Hash(plain string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(plain), bcryptCost)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func (h *bcryptHash) Verify(plain, hashed string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hashed), []byte(plain)) == nil
}
```

- [ ] **Step 2.5: Run tests to verify pass**

```bash
go test ./component/hasher/... -v
```

Expected: both bcrypt tests pass; existing MD5 tests (if any) still pass.

- [ ] **Step 2.6: Commit**

```bash
git add component/hasher/ go.mod go.sum
git commit -m "$(cat <<'EOF'
feat(hasher): add bcrypt hasher with cost 12

bcrypt replaces MD5 for new password creation. MD5 hasher kept (for now)
as the legacy verifier path during transparent migration.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Fix `crypto/rand` salt generator

**Files:**
- Modify: `common/salt.go`
- Create: `common/salt_test.go`

- [ ] **Step 3.1: Write failing test**

Create `common/salt_test.go`:

```go
package common

import "testing"

func TestGenSalt_Length(t *testing.T) {
	s := GenSalt(50)
	if len(s) != 50 {
		t.Errorf("got len %d, want 50", len(s))
	}
}

func TestGenSalt_NotPredictable(t *testing.T) {
	a := GenSalt(50)
	b := GenSalt(50)
	if a == b {
		t.Error("two consecutive salts collided — RNG is not seeded properly")
	}
}
```

- [ ] **Step 3.2: Replace `math/rand` with `crypto/rand`**

Replace `common/salt.go`:

```go
package common

import (
	"crypto/rand"
	"math/big"
)

var letters = []rune("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ")

func GenSalt(length int) string {
	if length <= 0 {
		length = 50
	}
	b := make([]rune, length)
	max := big.NewInt(int64(len(letters)))
	for i := range b {
		n, err := rand.Int(rand.Reader, max)
		if err != nil {
			panic(err) // crypto/rand.Reader should not fail; if it does, abort
		}
		b[i] = letters[n.Int64()]
	}
	return string(b)
}
```

- [ ] **Step 3.3: Run tests**

```bash
go test ./common/... -v -run Salt
```

Expected: both pass.

- [ ] **Step 3.4: Commit**

```bash
git add common/salt.go common/salt_test.go
git commit -m "$(cat <<'EOF'
fix(salt): use crypto/rand instead of math/rand

math/rand is seeded from time and can be predicted from a few outputs.
GenSalt is consumed by paths that may yet be security-sensitive.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Implement transparent MD5→bcrypt migration in Login

**Files:**
- Modify: `modules/user/userbiz/login.go`
- Modify: `modules/user/userbiz/register.go`
- Modify: `modules/user/usertransport/ginuser/login.go`
- Modify: `modules/user/usertransport/ginuser/register.go`
- Modify: `modules/user/userstorage/store.go` (add `UpdateUser`)
- Create: `modules/user/userstorage/update.go`
- Create: `modules/user/userbiz/login_test.go`

- [ ] **Step 4.1: Add `UpdateUser` to storage**

Create `modules/user/userstorage/update.go`:

```go
package userstorage

import (
	"context"
	"hfs_backend/common"
)

func (s *sqlStore) UpdateUser(ctx context.Context, conditions map[string]interface{}, updates map[string]interface{}) error {
	if err := s.db.Table("users").Where(conditions).Updates(updates).Error; err != nil {
		return common.ErrDB(err)
	}
	return nil
}
```

If the existing `store.go` doesn't already have an `sqlStore` exported type or a constructor that returns it, look at `find.go` / `create.go` for the pattern and match.

- [ ] **Step 4.2: Define new `Hasher` interface (with Verify)**

Modify `modules/user/userbiz/register.go` — replace the existing `Hasher` interface block:

```go
type Hasher interface {
	// Hash computes a bcrypt hash of the plaintext password.
	Hash(plain string) (string, error)
	// Verify checks plaintext against either a bcrypt hash (preferred)
	// or, for migration, a salted MD5 (caller computes the salted form).
	Verify(plain, hashed string) bool
}

// LegacyMD5Hasher is the old salted-MD5 path, retained only as a verifier
// for users who haven't logged in since bcrypt was introduced.
type LegacyMD5Hasher interface {
	Hash(data string) string
}
```

- [ ] **Step 4.3: Update register to use bcrypt**

Replace the `Register` method body in `modules/user/userbiz/register.go`:

```go
func (business *registerBusiness) Register(ctx context.Context, data *usermodel.UserCreate) error {
	user, _ := business.registerStorage.FindUser(ctx, map[string]interface{}{"email": data.Email})
	if user != nil {
		return usermodel.ErrEmailExisted
	}

	hashed, err := business.hasher.Hash(data.Password)
	if err != nil {
		return common.ErrInternal(err)
	}
	data.Password = hashed
	data.Salt = "" // bcrypt embeds salt
	data.Role = "user"
	data.Status = 1

	if err := business.registerStorage.CreateUser(ctx, data); err != nil {
		return common.ErrCannotCreateEntity(usermodel.EntityName, err)
	}
	return nil
}
```

- [ ] **Step 4.4: Update login with migration logic**

Replace `modules/user/userbiz/login.go`:

```go
package userbiz

import (
	"context"
	"strings"

	"hfs_backend/common"
	"hfs_backend/component"
	"hfs_backend/component/tokenprovider"
	"hfs_backend/modules/user/usermodel"
)

type LoginStorage interface {
	FindUser(ctx context.Context, conditions map[string]interface{}, moreInfo ...string) (*usermodel.User, error)
	UpdateUser(ctx context.Context, conditions map[string]interface{}, updates map[string]interface{}) error
}

type loginBusiness struct {
	appCtx        component.AppContext
	storeUser     LoginStorage
	tokenProvider tokenprovider.Provider
	hasher        Hasher
	legacyHasher  LegacyMD5Hasher
	expiry        int
	refreshExpiry int
}

func NewLoginBusiness(
	storeUser LoginStorage,
	tokenProvider tokenprovider.Provider,
	hasher Hasher,
	legacyHasher LegacyMD5Hasher,
	accessExpirySec int,
	refreshExpirySec int,
) *loginBusiness {
	return &loginBusiness{
		storeUser:     storeUser,
		tokenProvider: tokenProvider,
		hasher:        hasher,
		legacyHasher:  legacyHasher,
		expiry:        accessExpirySec,
		refreshExpiry: refreshExpirySec,
	}
}

// isBcryptHash reports whether `s` looks like a bcrypt hash.
func isBcryptHash(s string) bool {
	return strings.HasPrefix(s, "$2a$") || strings.HasPrefix(s, "$2b$") || strings.HasPrefix(s, "$2y$")
}

func (b *loginBusiness) Login(ctx context.Context, data *usermodel.UserLogin) (*usermodel.Account, error) {
	user, err := b.storeUser.FindUser(ctx, map[string]interface{}{"email": data.Email})
	if err != nil {
		return nil, usermodel.ErrUsernameOrPasswordInvalid
	}

	var ok bool
	if isBcryptHash(user.Password) {
		ok = b.hasher.Verify(data.Password, user.Password)
	} else {
		// Legacy MD5+salt path
		ok = b.legacyHasher.Hash(data.Password+user.Salt) == user.Password
		if ok {
			// Transparent migration: re-hash with bcrypt and update DB.
			newHash, err := b.hasher.Hash(data.Password)
			if err == nil {
				_ = b.storeUser.UpdateUser(ctx,
					map[string]interface{}{"id": user.Id},
					map[string]interface{}{"password": newHash, "salt": ""},
				)
			}
		}
	}
	if !ok {
		return nil, usermodel.ErrUsernameOrPasswordInvalid
	}

	payload := tokenprovider.TokenPayload{UserId: user.Id, Role: user.Role}
	access, err := b.tokenProvider.Generate(payload, b.expiry)
	if err != nil {
		return nil, common.ErrInternal(err)
	}
	refresh, err := b.tokenProvider.Generate(payload, b.refreshExpiry)
	if err != nil {
		return nil, common.ErrInternal(err)
	}
	return usermodel.NewAccount(access, refresh), nil
}
```

- [ ] **Step 4.5: Update transport layer login handler**

Modify `modules/user/usertransport/ginuser/login.go` — replace the `business := userbiz.NewLoginBusiness(...)` line. New body:

```go
func Login(appCtx component.AppContext) gin.HandlerFunc {
	return func(c *gin.Context) {
		var loginUserData usermodel.UserLogin
		if err := c.ShouldBind(&loginUserData); err != nil {
			panic(common.ErrInvalidRequest(err))
		}

		db := appCtx.GetMainDBConnection()
		tokenProvider := jwt.NewTokenJWTProvider(appCtx.SecretKey())
		store := userstorage.NewSQLStore(db)
		bcryptHasher := hasher.NewBcryptHash()
		md5Hasher := hasher.NewMd5Hash()

		// access 15min, refresh 30d
		business := userbiz.NewLoginBusiness(store, tokenProvider, bcryptHasher, md5Hasher, 60*15, 60*60*24*30)
		account, err := business.Login(c.Request.Context(), &loginUserData)
		if err != nil {
			panic(err)
		}
		c.JSON(http.StatusOK, common.SimpleSuccessResponse(account))
	}
}
```

- [ ] **Step 4.6: Update transport register handler**

Modify `modules/user/usertransport/ginuser/register.go` — change `md5 := hasher.NewMd5Hash()` to `bcryptHasher := hasher.NewBcryptHash()` and pass `bcryptHasher` to `NewRegisterBusiness`.

- [ ] **Step 4.7: Write login business test**

Create `modules/user/userbiz/login_test.go`:

```go
package userbiz

import (
	"context"
	"testing"

	"hfs_backend/component/hasher"
	"hfs_backend/component/tokenprovider"
	"hfs_backend/modules/user/usermodel"
)

type fakeStore struct {
	user        *usermodel.User
	updateCalls []map[string]interface{}
}

func (f *fakeStore) FindUser(_ context.Context, _ map[string]interface{}, _ ...string) (*usermodel.User, error) {
	if f.user == nil {
		return nil, usermodel.ErrUsernameOrPasswordInvalid
	}
	return f.user, nil
}
func (f *fakeStore) UpdateUser(_ context.Context, _ map[string]interface{}, updates map[string]interface{}) error {
	f.updateCalls = append(f.updateCalls, updates)
	return nil
}

type fakeProvider struct{}

func (fakeProvider) Generate(_ tokenprovider.TokenPayload, expiry int) (*tokenprovider.Token, error) {
	return &tokenprovider.Token{Token: "tok", Expiry: expiry}, nil
}
func (fakeProvider) Validate(string) (*tokenprovider.TokenPayload, error) { return nil, nil }

func TestLogin_BcryptUser(t *testing.T) {
	bc := hasher.NewBcryptHash()
	hashed, _ := bc.Hash("hunter2")
	store := &fakeStore{user: &usermodel.User{Email: "a@b.c", Password: hashed, Role: "user"}}
	store.user.Id = 7

	biz := NewLoginBusiness(store, fakeProvider{}, bc, hasher.NewMd5Hash(), 60, 600)
	acc, err := biz.Login(context.Background(), &usermodel.UserLogin{Email: "a@b.c", Password: "hunter2"})
	if err != nil {
		t.Fatalf("login: %v", err)
	}
	if acc.AccessToken.Token != "tok" {
		t.Error("expected token in account")
	}
	if len(store.updateCalls) != 0 {
		t.Error("bcrypt user should not trigger migration update")
	}
}

func TestLogin_LegacyMD5User_Migrates(t *testing.T) {
	md5 := hasher.NewMd5Hash()
	salt := "saltsalt"
	legacyHash := md5.Hash("hunter2" + salt)
	store := &fakeStore{user: &usermodel.User{Email: "a@b.c", Password: legacyHash, Salt: salt, Role: "user"}}
	store.user.Id = 7

	biz := NewLoginBusiness(store, fakeProvider{}, hasher.NewBcryptHash(), md5, 60, 600)
	_, err := biz.Login(context.Background(), &usermodel.UserLogin{Email: "a@b.c", Password: "hunter2"})
	if err != nil {
		t.Fatalf("login: %v", err)
	}
	if len(store.updateCalls) != 1 {
		t.Fatalf("expected 1 update (migration), got %d", len(store.updateCalls))
	}
	if store.updateCalls[0]["salt"] != "" {
		t.Error("expected salt to be cleared")
	}
}

func TestLogin_WrongPassword(t *testing.T) {
	bc := hasher.NewBcryptHash()
	hashed, _ := bc.Hash("hunter2")
	store := &fakeStore{user: &usermodel.User{Email: "a@b.c", Password: hashed, Role: "user"}}
	store.user.Id = 7

	biz := NewLoginBusiness(store, fakeProvider{}, bc, hasher.NewMd5Hash(), 60, 600)
	_, err := biz.Login(context.Background(), &usermodel.UserLogin{Email: "a@b.c", Password: "wrong"})
	if err != usermodel.ErrUsernameOrPasswordInvalid {
		t.Errorf("expected invalid creds error, got %v", err)
	}
}
```

- [ ] **Step 4.8: Run tests**

```bash
go test ./modules/user/userbiz/... -v
```

Expected: all 3 tests pass.

- [ ] **Step 4.9: Commit**

```bash
git add modules/user/userbiz/ modules/user/usertransport/ modules/user/userstorage/
git commit -m "$(cat <<'EOF'
feat(auth): bcrypt hashing with transparent MD5 migration on login

New users register with bcrypt. Existing users with MD5+salt records
keep working: on next successful login, the salted-MD5 verifier path
runs, and on success the password is silently re-hashed with bcrypt
and the salt cleared. Login now also issues a refresh token alongside
access (15min/30d).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Add `/v1/refresh` endpoint

**Files:**
- Create: `modules/user/userbiz/refresh.go`
- Create: `modules/user/usertransport/ginuser/refresh.go`
- Modify: `main.go` (add route)
- Modify: `modules/user/usermodel/user.go` (add `RefreshRequest`)
- Create: `modules/user/userbiz/refresh_test.go`

- [ ] **Step 5.1: Add request type**

Append to `modules/user/usermodel/user.go`:

```go
type RefreshRequest struct {
	RefreshToken string `json:"refresh_token" form:"refresh_token"`
}
```

- [ ] **Step 5.2: Write refresh business test**

Create `modules/user/userbiz/refresh_test.go`:

```go
package userbiz

import (
	"context"
	"testing"

	"hfs_backend/component/tokenprovider"
)

type stubProvider struct {
	validatePayload *tokenprovider.TokenPayload
	validateErr     error
}

func (s stubProvider) Generate(p tokenprovider.TokenPayload, expiry int) (*tokenprovider.Token, error) {
	return &tokenprovider.Token{Token: "new", Expiry: expiry}, nil
}
func (s stubProvider) Validate(_ string) (*tokenprovider.TokenPayload, error) {
	return s.validatePayload, s.validateErr
}

func TestRefresh_RotatesPair(t *testing.T) {
	p := stubProvider{validatePayload: &tokenprovider.TokenPayload{UserId: 9, Role: "user"}}
	biz := NewRefreshBusiness(p, 60, 600)
	acc, err := biz.Refresh(context.Background(), "old-refresh-token")
	if err != nil {
		t.Fatalf("refresh: %v", err)
	}
	if acc.AccessToken.Token != "new" || acc.RefreshToken.Token != "new" {
		t.Errorf("expected both tokens reissued, got %+v", acc)
	}
}

func TestRefresh_InvalidToken(t *testing.T) {
	p := stubProvider{validateErr: tokenprovider.ErrInvalidToken}
	biz := NewRefreshBusiness(p, 60, 600)
	_, err := biz.Refresh(context.Background(), "bad")
	if err != tokenprovider.ErrInvalidToken {
		t.Errorf("expected ErrInvalidToken, got %v", err)
	}
}
```

- [ ] **Step 5.3: Implement refresh business**

Create `modules/user/userbiz/refresh.go`:

```go
package userbiz

import (
	"context"

	"hfs_backend/common"
	"hfs_backend/component/tokenprovider"
	"hfs_backend/modules/user/usermodel"
)

type refreshBusiness struct {
	tokenProvider tokenprovider.Provider
	accessExpiry  int
	refreshExpiry int
}

func NewRefreshBusiness(tp tokenprovider.Provider, accessExp, refreshExp int) *refreshBusiness {
	return &refreshBusiness{tokenProvider: tp, accessExpiry: accessExp, refreshExpiry: refreshExp}
}

func (b *refreshBusiness) Refresh(_ context.Context, refreshToken string) (*usermodel.Account, error) {
	payload, err := b.tokenProvider.Validate(refreshToken)
	if err != nil {
		return nil, err
	}
	access, err := b.tokenProvider.Generate(*payload, b.accessExpiry)
	if err != nil {
		return nil, common.ErrInternal(err)
	}
	refresh, err := b.tokenProvider.Generate(*payload, b.refreshExpiry)
	if err != nil {
		return nil, common.ErrInternal(err)
	}
	return usermodel.NewAccount(access, refresh), nil
}
```

- [ ] **Step 5.4: Implement refresh transport handler**

Create `modules/user/usertransport/ginuser/refresh.go`:

```go
package ginuser

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"hfs_backend/common"
	"hfs_backend/component"
	"hfs_backend/component/tokenprovider/jwt"
	"hfs_backend/modules/user/userbiz"
	"hfs_backend/modules/user/usermodel"
)

func Refresh(appCtx component.AppContext) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req usermodel.RefreshRequest
		if err := c.ShouldBind(&req); err != nil {
			panic(common.ErrInvalidRequest(err))
		}
		tp := jwt.NewTokenJWTProvider(appCtx.SecretKey())
		biz := userbiz.NewRefreshBusiness(tp, 60*15, 60*60*24*30)
		acc, err := biz.Refresh(c.Request.Context(), req.RefreshToken)
		if err != nil {
			panic(err)
		}
		c.JSON(http.StatusOK, common.SimpleSuccessResponse(acc))
	}
}
```

- [ ] **Step 5.5: Run refresh tests**

```bash
go test ./modules/user/userbiz/... -v -run Refresh
```

Expected: 2 tests pass.

- [ ] **Step 5.6: Commit**

```bash
git add modules/user/
git commit -m "$(cat <<'EOF'
feat(auth): add POST /v1/refresh endpoint with token rotation

Refresh accepts a valid refresh token and returns a fresh
access+refresh pair (rotation, not just new access). Single signing
key for now; separate refresh secret is a follow-up.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Fix Recover and Authorize middleware

**Files:**
- Modify: `middleware/recover.go`
- Modify: `middleware/authorize.go`
- Create: `middleware/recover_test.go`

- [ ] **Step 6.1: Write recover middleware test**

Create `middleware/recover_test.go`:

```go
package middleware

import (
	"errors"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"hfs_backend/common"
)

func newCtx() (*gin.Context, *httptest.ResponseRecorder) {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	return c, w
}

func TestRecover_AppError(t *testing.T) {
	c, w := newCtx()
	defer func() {
		if r := recover(); r != nil {
			t.Errorf("middleware re-panicked with %v", r)
		}
	}()
	r := Recover(nil)
	r(c)
	func() {
		defer recoverCallback(c)
		panic(common.ErrInternal(errors.New("boom")))
	}()
	if w.Code != 500 {
		t.Errorf("expected 500, got %d", w.Code)
	}
}

// recoverCallback simulates the deferred recover from Recover.
// Inlined here for the test only.
func recoverCallback(c *gin.Context) {
	if r := recover(); r != nil {
		handlePanic(c, r)
	}
}
```

(The test exercises the same handlePanic path the real middleware uses; we'll extract it in the next step.)

- [ ] **Step 6.2: Rewrite Recover with extracted handler**

Replace `middleware/recover.go`:

```go
package middleware

import (
	"fmt"

	"github.com/gin-gonic/gin"
	"hfs_backend/common"
	"hfs_backend/component"
)

func Recover(_ component.AppContext) gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if r := recover(); r != nil {
				handlePanic(c, r)
			}
		}()
		c.Next()
	}
}

func handlePanic(c *gin.Context, r interface{}) {
	c.Header("content-type", "application/json")
	var appErr *common.AppError
	switch e := r.(type) {
	case *common.AppError:
		appErr = e
	case error:
		appErr = common.ErrInternal(e)
	default:
		appErr = common.ErrInternal(fmt.Errorf("%v", r))
	}
	c.AbortWithStatusJSON(appErr.StatusCode, appErr)
}
```

Key change: **single recover, no re-panic.** The original double-`panic(err)` after `AbortWithStatusJSON` was the bug.

- [ ] **Step 6.3: Update authorize middleware to abort instead of panic**

Replace `middleware/authorize.go`:

```go
package middleware

import (
	"errors"

	"github.com/gin-gonic/gin"
	"hfs_backend/common"
	"hfs_backend/component"
	"hfs_backend/component/tokenprovider"
	"hfs_backend/component/tokenprovider/jwt"
	"hfs_backend/modules/user/userstorage"
	"strings"
)

func RequiredAuth(appCtx component.AppContext) func(c *gin.Context) {
	tokenProvider := jwt.NewTokenJWTProvider(appCtx.SecretKey())

	return func(c *gin.Context) {
		token, err := extractToken(c.GetHeader("Authorization"))
		if err != nil {
			handlePanic(c, err)
			return
		}

		payload, err := tokenProvider.Validate(token)
		if err != nil {
			handlePanic(c, common.NewUnauthorized(err, "invalid token", "ErrInvalidToken"))
			return
		}

		db := appCtx.GetMainDBConnection()
		store := userstorage.NewSQLStore(db)
		user, err := store.FindUser(c.Request.Context(), map[string]interface{}{"id": payload.UserId})
		if err != nil {
			handlePanic(c, common.ErrEntityNotFound("User", err))
			return
		}
		if user.Status == 0 {
			handlePanic(c, common.ErrNoPermission(errors.New("user has been deleted or banned")))
			return
		}

		user.Mask(false)
		c.Set(common.CurrentUser, user)
		c.Next()
	}
}

func extractToken(h string) (*common.AppError, error) {
	parts := strings.Split(h, " ")
	if len(parts) < 2 || parts[0] != "Bearer" || strings.TrimSpace(parts[1]) == "" {
		return nil, common.NewUnauthorized(
			errors.New("missing or malformed Authorization header"),
			"missing or malformed Authorization header",
			"ErrWrongAuthHeader",
		)
	}
	return parts[1], nil
}

// Note: signature returns string, error — adjust the assignment site.
// (Resolved in the actual file: receiver of extractToken assigns `token` directly.)
```

Wait — fix the signature of `extractToken`. Replace its definition with:

```go
func extractToken(h string) (string, error) {
	parts := strings.Split(h, " ")
	if len(parts) < 2 || parts[0] != "Bearer" || strings.TrimSpace(parts[1]) == "" {
		return "", common.NewUnauthorized(
			errors.New("missing or malformed Authorization header"),
			"missing or malformed Authorization header",
			"ErrWrongAuthHeader",
		)
	}
	return parts[1], nil
}
```

(The `(*common.AppError, error)` placeholder above was a transcription error. Use the `(string, error)` form in the actual file.)

- [ ] **Step 6.4: Run middleware tests**

```bash
go test ./middleware/... -v
```

Expected: pass. Also `go vet ./...` clean.

- [ ] **Step 6.5: Commit**

```bash
git add middleware/
git commit -m "$(cat <<'EOF'
fix(middleware): remove double-panic in Recover; abort cleanly in authorize

Recover used to call AbortWithStatusJSON and then panic(err) twice,
which corrupted gin response state and re-recursed on the next
request. Single defer-recover, single abort.

Authorize was using panic for control flow; switched to AbortWithStatusJSON
+ return so Recover is a true safety net for unexpected panics, not a
normal-path branch.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Fix `SQLModel` JSON tag typos

**Files:**
- Modify: `common/sql_model.go`

- [ ] **Step 7.1: Fix tags**

Replace the struct in `common/sql_model.go`:

```go
package common

import "time"

type SQLModel struct {
	Id       int        `json:"-" gorm:"column:id;"`
	FakeId   *UID       `json:"id" gorm:"-"`
	Status   int        `json:"status" gorm:"column:status;"`
	CreateAt *time.Time `json:"created_at" gorm:"column:created_at;"`
	UpdateAt *time.Time `json:"updated_at" gorm:"column:updated_at;"`
}

func (s *SQLModel) GenerateUID(dbType int) {
	uid := NewUID(uint32(s.Id), dbType, 1)
	s.FakeId = &uid
}
```

- [ ] **Step 7.2: Verify**

```bash
go build ./...
```

Expected: clean build. (No new tests — the fix is observable in JSON output, exercised by integration smoke at end.)

- [ ] **Step 7.3: Commit**

```bash
git add common/sql_model.go
git commit -m "$(cat <<'EOF'
fix(sql_model): correct JSON tags on CreateAt/UpdateAt

All three of Status, CreateAt, UpdateAt previously had json:"status",
so only the last one (UpdateAt) was actually serialized. Now each has
its own correct tag.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Reorganize routes under `/v1` and lock down writes

**Files:**
- Modify: `main.go`
- Delete: `modules/user/userbiz/get_profile.go` (dead code — wrong package)

- [ ] **Step 8.1: Delete dead code**

```bash
rm modules/user/userbiz/get_profile.go
```

(The real `GetProfile` lives at `modules/user/usertransport/ginuser/get_profile.go`. The userbiz one was misnamed/misplaced and never wired up.)

- [ ] **Step 8.2: Rewrite `main.go` route registration**

Replace the contents of `runService` in `main.go`:

```go
func runService(db *gorm.DB, provider uploadprovider.UploadProvider, secretkey string) error {
	r := gin.Default()
	appCtx := component.NewAppContext(db, provider, secretkey)
	r.Use(middleware.Recover(appCtx))

	r.GET("/ping", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"message": "pong"})
	})

	v1 := r.Group("/v1")
	{
		// public auth endpoints
		v1.POST("/register", ginuser.Register(appCtx))
		v1.POST("/login", ginuser.Login(appCtx))
		v1.POST("/refresh", ginuser.Refresh(appCtx))

		// authenticated user endpoints
		v1.GET("/profile", middleware.RequiredAuth(appCtx), ginuser.GetProfile(appCtx))
		v1.POST("/upload", middleware.RequiredAuth(appCtx), ginupload.Upload(appCtx))

		// products: public read, auth'd write
		v1.GET("/products", ginproduct.ListProduct(appCtx))
		v1.GET("/products/:id", ginproduct.GetProduct(appCtx))
		v1.POST("/products", middleware.RequiredAuth(appCtx), ginproduct.CreateProduct(appCtx))
		v1.PATCH("/products/:id", middleware.RequiredAuth(appCtx), ginproduct.UpdateProduct(appCtx))
		v1.DELETE("/products/:id", middleware.RequiredAuth(appCtx), ginproduct.DeleteProduct(appCtx))

		// houses: public read, auth'd write
		v1.GET("/houses", ginhouse.ListHouse(appCtx))
		v1.GET("/houses/:id", ginhouse.GetHouse(appCtx))
		v1.POST("/houses", middleware.RequiredAuth(appCtx), ginhouse.CreateHouse(appCtx))
		v1.PATCH("/houses/:id", middleware.RequiredAuth(appCtx), ginhouse.UpdateHouse(appCtx))
		v1.DELETE("/houses/:id", middleware.RequiredAuth(appCtx), ginhouse.DeleteHouse(appCtx))
	}

	return r.Run()
}
```

- [ ] **Step 8.3: Verify build**

```bash
go vet ./... && go build ./...
```

Expected: clean.

- [ ] **Step 8.4: Commit**

```bash
git add main.go modules/user/userbiz/get_profile.go
git commit -m "$(cat <<'EOF'
refactor(routes): consolidate under /v1; auth-gate writes; remove dead code

BREAKING: top-level /products, /houses, /upload move to /v1/*.
Single client (hfs_frontend) updated in companion PR. GETs on
products/houses remain public; POST/PATCH/DELETE require auth.
Duplicate /upload route removed.

Drops modules/user/userbiz/get_profile.go which was a dead
duplicate in the wrong package (transport handler is the real one).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Sanitize `dev.env` and tighten gitignore

**Files:**
- Delete: `dev.env`
- Create: `dev.env.example`
- Modify: `.gitignore`
- Modify: `docker-compose.yml`

- [ ] **Step 9.1: Capture variable names from dev.env, then delete**

```bash
grep -E '^[A-Z_]+=' dev.env | sed -E 's/=.*$/=<REDACTED>/' > dev.env.example
rm dev.env
```

`dev.env.example` should now contain all variable names with `<REDACTED>` placeholders. Verify:

```bash
cat dev.env.example
```

Expected output (no actual secrets):
```
DBConnectionStr=<REDACTED>
MYSQL_DATABASE=<REDACTED>
... (all keys, no values)
```

- [ ] **Step 9.2: Add `.gitignore` entry**

Append to `.gitignore`:

```
*.env
!*.env.example
```

- [ ] **Step 9.3: Add port mapping to docker-compose**

Modify `docker-compose.yml` — under `hfs_backend` service, add:

```yaml
  hfs_backend:
    image: 'hfs_backend'
    container_name: 'hfs_backend'
    build:
      context: .
      dockerfile: Dockerfile
      args:
        - NODE_ENV=local
    ports:
      - "8080:8080"
    env_file:
      - .env
    depends_on:
      - mariadb10.3
```

- [ ] **Step 9.4: Commit**

```bash
git add dev.env dev.env.example .gitignore docker-compose.yml
git commit -m "$(cat <<'EOF'
chore(secrets): remove dev.env from working tree; expose backend port

Replaces dev.env with dev.env.example listing variable names only.
Adds *.env to .gitignore (with .env.example whitelist).

NOTE: dev.env stays in git history. Only the AWS account owner can
fully neutralize the leaked credentials. Daniel has escalated.

Maps backend container port 8080:8080 so the frontend can hit it
from the host (http://10.0.2.2:8080 from Android emulator).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Update error status codes

**Files:**
- Modify: `modules/user/usermodel/user.go`

- [ ] **Step 10.1: Override status code on auth errors**

`NewCustomError` currently defaults to `StatusBadRequest`. Override `ErrUsernameOrPasswordInvalid` and `ErrEmailExisted` to use the right codes.

Replace the trailing `var (...)` block of `modules/user/usermodel/user.go`:

```go
var (
	ErrUsernameOrPasswordInvalid = common.NewFullErrorResponse(
		http.StatusUnauthorized,
		errors.New("username or password invalid"),
		"username or password invalid",
		"username or password invalid",
		"ErrUsernameOrPasswordInvalid",
	)

	ErrEmailExisted = common.NewFullErrorResponse(
		http.StatusConflict,
		errors.New("email has already existed"),
		"email has already existed",
		"email has already existed",
		"ErrEmailExisted",
	)
)
```

Add `"net/http"` to imports if not present.

- [ ] **Step 10.2: Verify**

```bash
go vet ./... && go build ./...
```

- [ ] **Step 10.3: Commit**

```bash
git add modules/user/usermodel/user.go
git commit -m "$(cat <<'EOF'
fix(errors): use 401 for invalid credentials and 409 for duplicate email

Both errors previously used 400. The frontend interceptor distinguishes
401 (auth-related, may attempt refresh) from 400 (bad request, do not
refresh), so the codes need to be correct.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Manual smoke test

- [ ] **Step 11.1: Bring up the stack**

```bash
cp dev.env.example .env  # or copy a real .env if you have one
docker-compose up --build
```

Wait until you see `Listening and serving HTTP on :8080`.

- [ ] **Step 11.2: Register**

```bash
curl -i -X POST http://localhost:8080/v1/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"smoke@test.dev","password":"hunter2","first_name":"Smoke","last_name":"Test"}'
```

Expected: `200 OK`, body `{"data":"<UID-string>"}`.

- [ ] **Step 11.3: Login**

```bash
curl -i -X POST http://localhost:8080/v1/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"smoke@test.dev","password":"hunter2"}'
```

Expected: `200`, body `{"data":{"access_token":{"token":"...","created":"...","expiry":900},"refresh_token":{"token":"...","expiry":2592000}}}`. Save the access token to a shell var:

```bash
TOKEN=<paste access_token.token>
```

- [ ] **Step 11.4: Authenticated profile fetch**

```bash
curl -i -H "Authorization: Bearer $TOKEN" http://localhost:8080/v1/profile
```

Expected: `200`, body `{"data":{"id":"...","email":"smoke@test.dev","first_name":"Smoke","last_name":"Test",...}}`.

This is the request that crashed before the fix. If it returns 200 with a JSON body, the four most critical bugs are gone.

- [ ] **Step 11.5: Refresh**

```bash
REFRESH=<paste refresh_token.token>
curl -i -X POST http://localhost:8080/v1/refresh \
  -H 'Content-Type: application/json' \
  -d "{\"refresh_token\":\"$REFRESH\"}"
```

Expected: `200` with a fresh token pair.

- [ ] **Step 11.6: Wrong password → 401**

```bash
curl -i -X POST http://localhost:8080/v1/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"smoke@test.dev","password":"wrong"}'
```

Expected: `401 Unauthorized`, `error_key: "ErrUsernameOrPasswordInvalid"`.

- [ ] **Step 11.7: No token → 401**

```bash
curl -i http://localhost:8080/v1/profile
```

Expected: `401`, `error_key: "ErrWrongAuthHeader"`.

- [ ] **Step 11.8: Bad token → 401**

```bash
curl -i -H "Authorization: Bearer not-a-real-token" http://localhost:8080/v1/profile
```

Expected: `401`, `error_key: "ErrInvalidToken"` (and the server does **not** crash).

---

## Task 12: Open PR

- [ ] **Step 12.1: Push and open PR**

```bash
git push -u origin fix/auth-and-hardening
gh pr create --base dev --title "fix: auth + hardening (Validate, bcrypt, refresh, sanitize)" --body "$(cat <<'EOF'
Implements the design at \`docs/superpowers/specs/2026-04-27-hfs-backend-fixes-design.md\` (in the companion frontend repo).

## Highlights

- Implement \`tokenprovider.jwt.Validate()\` (was \`panic("implement me")\`).
- Migrate to \`golang-jwt/jwt/v5\` (CVE-fix from \`dgrijalva/jwt-go\`).
- bcrypt cost-12 hashing for new users; transparent re-hash on next login for existing MD5 users.
- Refresh-token flow (\`POST /v1/refresh\`) with rotation.
- Fix Recover middleware double-panic; switch authorize to abort instead of panic for control flow.
- Move all resources under \`/v1\`; auth-gate write methods on /products and /houses.
- Sanitize \`dev.env\` (replace with \`.example\`); add \`*.env\` to gitignore.
- Map \`8080:8080\` in docker-compose so the host can hit the backend.
- Login → 401 (was 400); duplicate email → 409.

## Breaking changes

- All resource routes move to \`/v1\` namespace. Frontend updated in companion PR.

## Out of scope (follow-ups)

- Rotate AWS account \`738233747789\` IAM keys — owner action; escalated.
- Drop \`salt\` column once all users have migrated to bcrypt.
- \`houseLike\`/\`productLike\` modules unaudited; assume same write-auth pattern applies.

## Test plan

- [x] \`go test ./...\` — token, hasher, salt, login, refresh, recover all green.
- [x] Manual smoke against \`docker-compose up\` — register / login / profile / refresh / wrong-password / no-token / bad-token.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Verification before merge

- [ ] All `go test ./...` pass.
- [ ] `go vet ./...` clean.
- [ ] Manual smoke test (Task 11) passes against fresh `docker-compose up`.
- [ ] PR description references the spec and breaking change.
- [ ] AWS rotation status confirmed (escalated, even if not yet rotated).
