# hfs_frontend Phase 3 — SDK Upgrade Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the project from Expo SDK 44 (EOL since 2022) to the current stable SDK, picking up the corresponding React, React Native, and React Navigation majors. Done in a git worktree so the main branch stays buildable while the upgrade is in progress.

**Architecture:** Worktree-isolated upgrade. The exact target SDK is locked in Step 1.2 by querying `npm view`. Lockstep upgrade of `expo`, `react`, `react-native`, navigation libs, `react-native-svg`, `react-native-vector-icons`, `expo-asset`, `expo-font`, `expo-splash-screen`, `expo-status-bar`. Hermes is enabled (default in modern SDKs).

**Tech Stack:** Expo (SDK 44 → current), React (17 → 18 or 19), React Native (0.64 → current), React Navigation 5 → 6 or 7, jest-expo.

---

## Pre-flight

- [ ] **Phase 2 must be merged** so identity rename survives the upgrade (otherwise `expo prebuild` could regenerate native files under the old `com.hfsapp` package).
- [ ] **Backup uncommitted work.** This phase is risky; if anything goes sideways, abandoning the worktree is the easy out.

---

## Task 1: Create worktree and confirm target

**Files:**
- New worktree: `../hfs_frontend.sdk-upgrade`

- [ ] **Step 1.1: Create the worktree on a new branch**

```bash
cd /home/daniel/hfs_frontend
git checkout main && git pull --ff-only
git worktree add -b chore/sdk-upgrade ../hfs_frontend.sdk-upgrade main
cd ../hfs_frontend.sdk-upgrade
```

Verify:
```bash
pwd  # /home/daniel/hfs_frontend.sdk-upgrade
git status
git branch --show-current  # chore/sdk-upgrade
```

- [ ] **Step 1.2: Lock the target SDK version**

```bash
npm view expo dist-tags.latest
```

Capture the output (e.g., `52.0.0`). Use this exact version in every install command below; substitute `<SDK>` with this value (without the leading caret).

Record it in a one-line file so the plan can reference it:

```bash
echo "TARGET_SDK_VERSION=$(npm view expo dist-tags.latest)" > .sdk-upgrade-target
cat .sdk-upgrade-target
```

(File is gitignored; it's just scratch state.)

```bash
echo ".sdk-upgrade-target" >> .gitignore
```

---

## Task 2: Bump `expo` and run `expo install --fix`

**Files:**
- Modify: `package.json`, `yarn.lock`

- [ ] **Step 2.1: Bump expo to target**

```bash
yarn add expo@<SDK>
```

(Replace `<SDK>` with the exact version from `.sdk-upgrade-target`.)

- [ ] **Step 2.2: Use `expo install --fix` to align expo-* packages**

```bash
npx expo install --fix
```

This bumps `expo-asset`, `expo-font`, `expo-splash-screen`, `expo-status-bar`, `react`, `react-native`, `react-native-gesture-handler`, `react-native-reanimated`, `react-native-safe-area-context`, `react-native-screens`, `react-native-svg` to whatever the new SDK pins.

- [ ] **Step 2.3: Confirm versions**

```bash
yarn list --depth=0 --pattern 'react|expo'
```

Expected: `expo` matches the target; `react` is on the new major (18 or 19); `react-native` is the version Expo's SDK pins.

- [ ] **Step 2.4: Commit**

```bash
git add package.json yarn.lock .gitignore
git commit -m "$(cat <<'EOF'
chore(sdk): bump expo to <SDK> and align expo-* packages

`expo install --fix` realigns expo-asset, expo-font, expo-splash-screen,
expo-status-bar, react, react-native, react-native-* to the versions
pinned by the target Expo SDK.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

(Replace `<SDK>` in the commit message with the actual version.)

---

## Task 3: Bump React Navigation to v6 or v7

**Files:**
- Modify: `package.json`, `yarn.lock`
- Modify: `src/navigator/Stacks/Stacks.js` (some breaking changes)
- Modify: `src/navigator/Tabs/Tabs.js`
- Modify: `src/navigator/Drawer/Drawer.js`

- [ ] **Step 3.1: Determine target navigation major**

```bash
npm view @react-navigation/native dist-tags.latest
```

(Likely v6 or v7.) Use this version in the next step.

- [ ] **Step 3.2: Upgrade navigation packages**

```bash
yarn add @react-navigation/native@latest \
         @react-navigation/stack@latest \
         @react-navigation/bottom-tabs@latest \
         @react-navigation/drawer@latest
```

Drop the now-unneeded `@react-native-community/masked-view` package (replaced by `@react-native-masked-view/masked-view` in v6+; only needed if drawer uses it explicitly):

```bash
yarn remove @react-native-community/masked-view
yarn add @react-native-masked-view/masked-view
```

- [ ] **Step 3.3: Verify navigation files compile (no runtime check yet)**

```bash
npx tsc --noEmit --allowJs --checkJs false src/navigator/**/*.js 2>&1 | head -30
```

Or just run the metro bundler:

```bash
yarn start --no-interactive &
SERVER_PID=$!
sleep 8
curl -sS 'http://localhost:8081/index.bundle?platform=android&dev=true' -o /tmp/bundle-check.js
kill $SERVER_PID
wc -l /tmp/bundle-check.js  # should be many thousand lines, not an error string
head -1 /tmp/bundle-check.js
```

Expected: bundle generated; first line is JS, not an error.

- [ ] **Step 3.4: Commit**

```bash
git add package.json yarn.lock
git commit -m "$(cat <<'EOF'
chore(sdk): bump @react-navigation/* to current major

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Address remaining deprecated APIs

**Files:**
- Inspect/modify (as warnings dictate): `src/navigator/**`, `src/App.js`, `src/utils/store.js`

- [ ] **Step 4.1: Run lint and capture warnings**

```bash
yarn lint 2>&1 | tee /tmp/lint-after-bump.log
```

Expected categories:
- React 18+ may warn about `ReactDOM.render` (we don't use it; ignore if it appears).
- Reanimated v3+ requires `'react-native-reanimated/plugin'` to be **last** in `babel.config.js` plugins (already is — verify).
- Anything pointing at `getDefaultMiddleware` (deprecated since RTK 1.6, removed in 2.x): if RTK was bumped to 2.x, edit `src/utils/store.js` (Step 4.3).

- [ ] **Step 4.2: Verify reanimated plugin position**

```bash
grep -A2 "plugins:" babel.config.js
```

Expected: `'react-native-reanimated/plugin'` is the last entry. If not, move it to the end.

- [ ] **Step 4.3: Update Redux Toolkit store API if RTK ≥ 2**

Check installed RTK:

```bash
yarn list --depth=0 --pattern '@reduxjs/toolkit'
```

If 2.x, replace `src/utils/store.js`:

```js
import { configureStore, combineReducers } from '@reduxjs/toolkit'
import logger from 'redux-logger'
import appReducer from 'slices/app.slice'

const rootReducer = combineReducers({
  app: appReducer,
})

const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) => {
    const base = getDefaultMiddleware({
      serializableCheck: false,
      immutableCheck: false,
    })
    // eslint-disable-next-line no-undef
    return __DEV__ ? base.concat(logger) : base
  },
})

export default store
```

- [ ] **Step 4.4: Run expo-doctor**

```bash
npx expo-doctor
```

Address any issues it raises (typically: peer-dep mismatches, `expo-modules-core` version drift). For each, run the suggested fix command verbatim.

- [ ] **Step 4.5: Commit any changes**

```bash
git add -A
git diff --cached --stat
git commit -m "$(cat <<'EOF'
chore(sdk): fix deprecated APIs surfaced by upgrade

Targets findings from `expo-doctor` and lint after the major bumps.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

(Skip if there's nothing to commit — the upgrade was clean.)

---

## Task 5: Regenerate native scaffolding with `expo prebuild`

**Files:**
- Modify: `android/**` (regenerated)

- [ ] **Step 5.1: Save current android customizations to a stash**

The Phase 2 identity rename (Java package, applicationId) and the Phase 1 `jcenter` removal need to survive prebuild. The way to handle this:

```bash
git diff main..HEAD -- android/ > /tmp/android-customizations.patch
wc -l /tmp/android-customizations.patch
```

(Records what's different from the pre-upgrade state of `android/`.)

- [ ] **Step 5.2: Run prebuild**

```bash
npx expo prebuild --platform android --clean --no-install
```

This regenerates `android/` from scratch using the new Expo SDK templates.

- [ ] **Step 5.3: Re-apply identity and jcenter changes**

The regenerated `android/app/build.gradle` will have `applicationId "<expo-default>"` (likely derived from `app.json`'s `android.package`, which Phase 2 set correctly to `io.github.danghoangnhan.hfs`). Verify:

```bash
grep applicationId android/app/build.gradle
grep "rootProject.name" android/settings.gradle
find android/app/src -name '*.java' | head
grep "package" $(find android/app/src -name '*.java' | head -1)
```

Expected: `applicationId "io.github.danghoangnhan.hfs"`, `rootProject.name = 'hfs'`, `.java` files in `android/app/src/main/java/io/github/danghoangnhan/hfs/`, package declarations `package io.github.danghoangnhan.hfs;`. **If any of these regressed, run the Phase 2 steps for that file again.**

Strip `jcenter()` from `android/build.gradle` (Phase 1 work — re-apply if regenerated):

```bash
grep -n jcenter android/build.gradle && \
  sed -i '/jcenter()/d' android/build.gradle
```

- [ ] **Step 5.4: Build to verify**

```bash
cd android && ./gradlew :app:assembleDebug --no-daemon ; cd ..
```

Expected: `BUILD SUCCESSFUL`. Common failures:
- "JDK 17 required": install / set JAVA_HOME accordingly.
- "AGP 7.x required": `android/build.gradle` should have it from prebuild — no action.

- [ ] **Step 5.5: Commit**

```bash
git add android/
git commit -m "$(cat <<'EOF'
chore(sdk): regenerate android/ via expo prebuild --clean

Identity (Phase 2) and jcenter removal (Phase 1) re-applied where
prebuild regenerated stale defaults.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Smoke test on emulator

- [ ] **Step 6.1: Boot the app**

```bash
yarn start --reset-cache
```

In another terminal:

```bash
yarn android
```

(Or press `a` in the metro UI.)

- [ ] **Step 6.2: Walk the navigation tree**

Manually:
1. App opens to **Home** with "Go to Details" button.
2. Tap → **Details (from Home)**.
3. Tap "Go Back" → returns to Home.
4. Tap drawer icon (top-left bars) → drawer opens.
5. Tap **Profile** → Profile screen.
6. Tap "Go to Details" → **Details (from Profile)**.
7. Tap "Go Back" → Profile.
8. Bottom tabs switch between Home / Profile correctly.

If any step is broken, **diagnose now** — these are the screens Phase 4 builds on. Common breakages after a navigation v5→v6 jump:
- `headerMode` default differs — Phase 1 already removed it.
- `navigation.openDrawer()` still works in v6.
- `route.params` accessor unchanged.

- [ ] **Step 6.3: No commit needed if smoke clean.** If a fix was required, commit it as `fix(sdk): adjust <component> for v6 API`.

---

## Task 7: Open PR

- [ ] **Step 7.1: Push from worktree**

```bash
git push -u origin chore/sdk-upgrade
```

- [ ] **Step 7.2: Open PR**

```bash
gh pr create --base main --title "chore: SDK upgrade 44 → <SDK> (Phase 3)" --body "$(cat <<'EOF'
Phase 3 of the cleanup project. Done in a worktree (\`../hfs_frontend.sdk-upgrade\`).

## Highlights

- expo: 44 → <SDK>
- react / react-native: bumped per Expo SDK pin
- @react-navigation/*: 5.x → current major
- redux-toolkit: bumped (store middleware API updated)
- android/ regenerated via \`expo prebuild --clean\`; identity (Phase 2) and jcenter removal (Phase 1) re-applied
- Hermes enabled by default

## Test plan

- [x] \`yarn lint\` clean
- [x] \`./gradlew :app:assembleDebug\` builds
- [x] Navigation walk on Android emulator: Home → Details → back, drawer, Profile, tabs
- [ ] (Reviewer) iOS smoke if you have a Mac handy

## Known follow-ups

- iOS native project (\`expo prebuild --platform ios\`) when needed.
- TypeScript migration (out of scope for cleanup project).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

(Replace `<SDK>` with the actual version captured in Task 1.2.)

---

## Task 8: Clean up worktree after merge

- [ ] **Step 8.1: After PR is merged, return to main worktree**

```bash
cd /home/daniel/hfs_frontend
git checkout main && git pull --ff-only
```

- [ ] **Step 8.2: Remove the worktree**

```bash
git worktree remove ../hfs_frontend.sdk-upgrade
git branch -d chore/sdk-upgrade  # safe local delete; PR is merged
```

---

## Verification before merge

- [ ] `yarn install --frozen-lockfile` succeeds in the worktree.
- [ ] `./gradlew :app:assembleDebug` builds clean.
- [ ] App boots and the full navigation walk in Task 6.2 works without warnings.
- [ ] `npx expo-doctor` clean.
- [ ] Identity (Phase 2) survived prebuild — Java package and applicationId still `io.github.danghoangnhan.hfs`.

## Risk register (addressed)

| Risk | Mitigation in this plan |
|---|---|
| Upgrade too painful | Worktree isolates; abandon and try smaller jump (44→49→target) if Task 6 surfaces unfixable issues |
| `expo prebuild --clean` wipes Phase 2 identity | Task 5.3 re-applies; verification at Step 5.4 catches it |
| jcenter regenerated by prebuild | Step 5.3 strips it again |
| Reanimated plugin moved out of last position | Step 4.2 verifies |
