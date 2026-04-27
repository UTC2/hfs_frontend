# hfs_frontend Phase 1 — Mechanical Cleanup Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clear out 9 long-standing config / dependency / dead-code drift items so subsequent phases (identity rename, SDK upgrade, auth) start from a clean baseline.

**Architecture:** Pure cleanup — no new functionality. Each fix is independent and confined to one or two files; no test scaffolding is added (Phase 4 introduces the first tests).

**Tech Stack:** Yarn, Expo SDK 44 (kept; upgrade is Phase 3), React Native 0.64, ESLint.

---

## Pre-flight

- [ ] **Branch off main:**
  ```bash
  cd /home/daniel/hfs_frontend
  git checkout main && git pull --ff-only
  git checkout -b chore/mechanical-cleanup
  ```
- [ ] **Install deps once** (so we can run lint & smoke test):
  ```bash
  yarn install --frozen-lockfile
  ```

---

## Task 1: Drop `package-lock.json` (use yarn only)

**Files:**
- Delete: `package-lock.json`
- Modify: `.gitignore`

- [ ] **Step 1.1: Delete the lockfile**

```bash
rm package-lock.json
```

- [ ] **Step 1.2: Add to `.gitignore`**

Append to `.gitignore` (after the `node_modules/**/*` line):

```
package-lock.json
```

- [ ] **Step 1.3: Commit**

```bash
git add package-lock.json .gitignore
git commit -m "$(cat <<'EOF'
chore: remove package-lock.json; yarn is canonical

CI uses yarn install --frozen-lockfile. Keeping both lockfiles around
guarantees they drift; pick one. yarn it is.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Trim `package.json` dependencies

**Files:**
- Modify: `package.json`
- Modify: `yarn.lock` (regenerated)

- [ ] **Step 2.1: Move CLI/test packages to devDependencies; drop unused; bump axios**

Edit `package.json`. **Remove from `dependencies`:**

```json
"expo-cli": "^4.13.0",
"jest": "^26.6.3",
"global": "^4.4.0",
```

(`expo-cli` is a CLI tool, `jest` is a test runner, `global` is unused — never imported.)

**Add to `devDependencies`** (`jest` only — `expo-cli` should be a global tool or a CI-side install):

```json
"jest": "^26.6.3",
```

**Bump axios in `dependencies`:**

```json
"axios": "^1.7.0",
```

(was `^0.24.0`; 1.x patches several CVEs and prototype-pollution issues.)

**Drop the `braces` pin from `devDependencies`** — it's a leftover npm-audit override:

```json
"braces": ">=2.3.1",   // ← remove this line
```

**Drop the `expo eject` script** from `scripts`:

```json
"eject": "expo eject",   // ← remove this line
```

- [ ] **Step 2.2: Reinstall to refresh `yarn.lock`**

```bash
yarn install
```

Expected: `yarn.lock` updated; no errors. If `axios@^1.7.0` warns about a peer-dependency mismatch with the old expo, ignore — Phase 3 fixes that. The CVE patch is worth a transient warning.

- [ ] **Step 2.3: Smoke check**

```bash
yarn lint
```

Expected: lint runs (may have warnings, but no resolution failures).

- [ ] **Step 2.4: Commit**

```bash
git add package.json yarn.lock
git commit -m "$(cat <<'EOF'
chore(deps): trim runtime deps, bump axios for CVE patches

- Move jest to devDependencies (was in deps)
- Drop expo-cli from runtime deps (it's a CLI; install globally or in CI)
- Drop unused 'global' package
- Drop legacy 'braces' npm-audit override
- Drop 'expo eject' script (eject removed in modern SDKs anyway)
- Bump axios 0.24 → 1.7 (CVEs)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Fix `app.slice.js` typo

**Files:**
- Modify: `src/slices/app.slice.js:32`

- [ ] **Step 3.1: Remove broken export**

Find this line in `src/slices/app.slice.js`:

```js
export const { action } = appSlice
```

Delete it. (`appSlice.action` is undefined — the property is `appSlice.actions`, plural; the named exports immediately below already destructure from `actions`.)

- [ ] **Step 3.2: Commit**

```bash
git add src/slices/app.slice.js
git commit -m "$(cat <<'EOF'
fix(slice): drop broken 'action' export typo

appSlice.action is undefined (the property is .actions). The export
was dead code — nothing in the codebase imports it.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Fix `useEffect` deps in `Navigator.js`

**Files:**
- Modify: `src/navigator/Navigator.js:13-15`

- [ ] **Step 4.1: Add `dispatch` to deps**

In `src/navigator/Navigator.js`, change:

```js
useEffect(() => {
  dispatch(authenticate({ loggedIn: true, checked: true }))
}, [])
```

to:

```js
useEffect(() => {
  dispatch(authenticate({ loggedIn: true, checked: true }))
}, [dispatch])
```

(`dispatch` is referentially stable from `useDispatch`; eslint-react-hooks still wants it in deps.)

- [ ] **Step 4.2: Commit**

```bash
git add src/navigator/Navigator.js
git commit -m "$(cat <<'EOF'
fix(navigator): include dispatch in useEffect deps

Silences react-hooks/exhaustive-deps. Phase 4 will replace this stub
auth dispatch with a real bootstrap thunk.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Add error handling around asset preload

**Files:**
- Modify: `src/App.js`

- [ ] **Step 5.1: Wrap `Promise.all` in try/catch**

Replace the body of `App` in `src/App.js`:

```js
const App = () => {
  const [didLoad, setDidLoad] = useState(false)

  useEffect(() => {
    let cancelled = false
    const handleLoadAssets = async () => {
      try {
        await Promise.all([...imageAssets, ...fontAssets])
      } catch (err) {
        // Don't hang the UI on a missing/corrupt asset; log and continue.
        console.warn('Asset preload failed; continuing with fallbacks.', err)
      }
      if (!cancelled) setDidLoad(true)
    }
    handleLoadAssets()
    return () => { cancelled = true }
  }, [])

  return didLoad ? (
    <Provider store={store}>
      <Navigator />
    </Provider>
  ) : (
    <View />
  )
}
```

- [ ] **Step 5.2: Commit**

```bash
git add src/App.js
git commit -m "$(cat <<'EOF'
fix(app): don't hang on asset preload failure

Promise.all rejecting on any asset previously left the app stuck on
a blank <View />. Catch and log, then proceed; React Native falls back
to the system font / placeholder image rather than blocking the UI.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Migrate deprecated React Navigation v5 props

**Files:**
- Modify: `src/navigator/Stacks/Stacks.js`
- Modify: `src/navigator/Tabs/Tabs.js`

- [ ] **Step 6.1: Drop `headerMode="screen"` from Stacks**

In `src/navigator/Stacks/Stacks.js`, remove `headerMode="screen"` from both `Stack.Navigator` props (lines ~29 and ~57). The default is `"screen"` in v6 anyway and the prop is removed.

- [ ] **Step 6.2: Replace `tabBarOptions` and drop `swipeEnabled` in Tabs**

In `src/navigator/Tabs/Tabs.js`, the `<Tab.Navigator>` opening tag currently has `tabBarOptions={{...}}` and `swipeEnabled={false}` props. Replace as follows:

```jsx
<Tab.Navigator
  screenOptions={({ route }) => ({
    tabBarActiveTintColor: colors.lightPurple,
    tabBarInactiveTintColor: colors.gray,
    tabBarStyle: {
      // backgroundColor: 'white',
      // borderTopColor: 'gray',
      // borderTopWidth: 1,
      // paddingBottom: 5,
      // paddingTop: 5,
    },
    // eslint-disable-next-line react/prop-types
    tabBarIcon: ({ focused }) => {
      switch (route.name) {
        case 'Home':
          return (
            <FontIcon
              name="home"
              color={focused ? colors.lightPurple : colors.gray}
              size={20}
              solid
            />
          )
        case 'Profile':
          return (
            <FontIcon
              name="user"
              color={focused ? colors.lightPurple : colors.gray}
              size={20}
              solid
            />
          )
        default:
          return <View />
      }
    },
  })}
  initialRouteName="Home"
>
```

(The previous separate `tabBarOptions` and `swipeEnabled` props are gone; tint colors and style now live in `screenOptions`.)

- [ ] **Step 6.3: Smoke test**

```bash
yarn start
```

Press `a` to launch on Android emulator; verify Home → Details → back, drawer open, switch to Profile tab. (If you don't have an emulator handy, skip — Phase 3 includes a full device smoke test.)

- [ ] **Step 6.4: Commit**

```bash
git add src/navigator/
git commit -m "$(cat <<'EOF'
chore(navigator): drop React Navigation v5 deprecated props

- Remove headerMode="screen" (default in v6, prop removed)
- Replace tabBarOptions={...} with screenOptions tabBar* fields
- Drop swipeEnabled (no longer a Tab.Navigator prop in v6)

Phase 3 bumps to v6, where these would otherwise become breaking
warnings. Doing it now keeps the diff small.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Drop `jcenter()` from Android Gradle

**Files:**
- Modify: `android/build.gradle`

- [ ] **Step 7.1: Remove jcenter calls**

In `android/build.gradle`, remove the line `jcenter()` from both the `buildscript.repositories` block and the `allprojects.repositories` block. (jcenter sunset in 2022; mavenCentral has all the artifacts now.)

After edit, `allprojects.repositories` should read:

```groovy
allprojects {
    repositories {
        mavenLocal()
        maven {
            url(new File(["node", "--print", "require.resolve('react-native/package.json')"].execute(null, rootDir).text.trim(), "../android"))
        }
        maven {
            url(new File(["node", "--print", "require.resolve('jsc-android/package.json')"].execute(null, rootDir).text.trim(), "../dist"))
        }
        google()
        mavenCentral()
        maven { url 'https://www.jitpack.io' }
    }
}
```

- [ ] **Step 7.2: Commit**

```bash
git add android/build.gradle
git commit -m "$(cat <<'EOF'
chore(android): drop jcenter; mavenCentral covers everything

jcenter sunset in 2022 and serves stale or unsigned artifacts.
mavenCentral hosts the same packages with no behavior change.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Rewrite `README.md`

**Files:**
- Modify: `README.md`

- [ ] **Step 8.1: Replace boilerplate README**

Overwrite `README.md` with:

```markdown
# HFS — Student Housing (Frontend)

Mobile app helping students find housing. Companion to [`UTC2/hfs_backend`](https://github.com/UTC2/hfs_backend).

## Stack

- Expo (SDK 44 today; SDK 5x after Phase 3 of the cleanup project)
- React Native + React Navigation 5 (→ 6 after Phase 3)
- Redux Toolkit
- axios for HTTP
- expo-secure-store for token storage (Phase 4)

## Getting started

```bash
yarn install
yarn start
```

Press `a` for Android emulator, `i` for iOS simulator, `w` for web.

## Backend

Auth contract is documented in the backend repo. For local dev:

- Run the backend stack: `cd ../hfs_backend && docker-compose up`
- Frontend defaults to `http://10.0.2.2:8080/v1` (Android emulator → host loopback). Override via `EXPO_PUBLIC_API_URL`.

## Project layout

```
src/
├── api/           # axios client + per-domain wrappers (Phase 4)
├── components/    # reusable presentation components
├── navigator/     # Drawer / Tabs / Stacks
├── pages/         # screen components
├── services/      # secureStorage etc. (Phase 4)
├── slices/        # Redux Toolkit slices
├── theme/         # colors, fonts, images
└── utils/         # store, log filters
```

## Scripts

- `yarn start` — Expo dev server
- `yarn android` — build + install on a connected device/emulator
- `yarn ios` — same for iOS
- `yarn lint` — ESLint with auto-fix
- `yarn test` — Jest (no tests yet — Phase 4)

## Cleanup project

This repo is mid-cleanup; see `docs/superpowers/specs/` and `docs/superpowers/plans/` for the active design docs and PR-by-PR plan.

## License

MIT — see `LICENSE`.
```

- [ ] **Step 8.2: Commit**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs(readme): replace upstream boilerplate with project-specific README

Old README pointed at the upstream react-native-boilerplate repo
banner image and instructions. Replaces with HFS-specific content
referencing the cleanup specs/plans and the backend.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Open PR

- [ ] **Step 9.1: Push and open**

```bash
git push -u origin chore/mechanical-cleanup
gh pr create --base main --title "chore: mechanical cleanup (Phase 1)" --body "$(cat <<'EOF'
Phase 1 of the cleanup project (\`docs/superpowers/specs/2026-04-27-hfs-frontend-cleanup-design.md\`).

## Summary

Pure cleanup — no behavior change beyond the asset-preload bug fix.

- Drop \`package-lock.json\`; yarn is canonical
- \`package.json\` trim: jest → devDeps, drop expo-cli/global runtime deps, drop legacy braces pin, drop expo-eject script, bump axios 0.24 → 1.7
- Fix \`app.slice.js\` broken \`action\` export typo
- Fix \`Navigator.js\` useEffect deps array
- Wrap \`App.js\` asset preload in try/catch — no more blank-screen-on-asset-failure
- Migrate React Navigation v5 deprecated props (\`headerMode\`, \`tabBarOptions\`, \`swipeEnabled\`) — keeps Phase 3 diff small
- Drop \`jcenter()\` from android/build.gradle
- Replace upstream-boilerplate README

## Test plan

- [x] \`yarn install\` clean, \`yarn lint\` runs
- [x] App launches and navigates Home → Details → Profile on Android emulator
- [ ] (Reviewer) Eyeball each commit independently — they're each one logical fix.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Verification before merge

- [ ] `yarn install --frozen-lockfile` succeeds.
- [ ] `yarn lint` runs (warnings OK).
- [ ] App boots on Android emulator and navigates Home → Details → drawer → Profile.
- [ ] No new files added except the README rewrite; lockfile diff is intentional.
