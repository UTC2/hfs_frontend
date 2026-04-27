# hfs_frontend Phase 2 — Identity Rename Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize the app identity across all 7 places that currently disagree, settling on `io.github.danghoangnhan.hfs` (Android `applicationId` / iOS `bundleIdentifier`) and `HFS — Student Housing` (user-facing name).

**Architecture:** Pure rename. The Android `applicationId` is irreversible once published, so the rename happens before any release build is uploaded.

**Tech Stack:** Expo, Android (gradle + Java).

---

## Pre-flight

- [ ] **Phase 1 must be merged.** This phase rebases on top of `chore/mechanical-cleanup`.
- [ ] **Branch:**
  ```bash
  git checkout main && git pull --ff-only
  git checkout -b chore/identity-rename
  ```
- [ ] **No release builds yet.** If you've published an APK to any store under `com.hfsapp`, **stop** — that ID is now permanent. (Daniel has not, per the project state.)

---

## Task 1: Rename in `package.json`

**Files:**
- Modify: `package.json`

- [ ] **Step 1.1: Update `name`**

In `package.json`, change `"name": "hfs_frontend"` to `"name": "hfs-student-housing"`.

(npm names are lowercase with hyphens, not underscores.)

- [ ] **Step 1.2: Commit**

```bash
git add package.json
git commit -m "$(cat <<'EOF'
chore(identity): rename package.json name to hfs-student-housing

npm naming convention (lowercase, hyphens). One of 7 places that
need to align on the new identity.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Rename in `app.json`

**Files:**
- Modify: `app.json`

- [ ] **Step 2.1: Replace expo block**

Replace the contents of `app.json` with:

```json
{
  "expo": {
    "name": "HFS — Student Housing",
    "slug": "hfs-student-housing",
    "privacy": "public",
    "platforms": ["ios", "android", "web"],
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/images/logo-sm.png",
    "splash": {
      "image": "./assets/images/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    "updates": {
      "fallbackToCacheTimeout": 0
    },
    "assetBundlePatterns": ["**/*"],
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "io.github.danghoangnhan.hfs"
    },
    "packagerOpts": {
      "config": "metro.config.js",
      "sourceExts": ["js", "jsx", "svg", "ts", "tsx"]
    },
    "android": {
      "package": "io.github.danghoangnhan.hfs"
    }
  }
}
```

Changes vs. before: `name` → display string, `slug` → `hfs-student-housing`, `android.package` → `io.github.danghoangnhan.hfs`, plus a new `ios.bundleIdentifier` (matching, in case iOS native is added later).

- [ ] **Step 2.2: Commit**

```bash
git add app.json
git commit -m "$(cat <<'EOF'
chore(identity): set app.json display name, slug, package

display: "HFS — Student Housing"
slug:    hfs-student-housing
android.package / ios.bundleIdentifier: io.github.danghoangnhan.hfs

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Rename in `android/settings.gradle`

**Files:**
- Modify: `android/settings.gradle`

- [ ] **Step 3.1: Change rootProject.name**

In `android/settings.gradle`, change:

```groovy
rootProject.name = 'hfsapp'
```

to:

```groovy
rootProject.name = 'hfs'
```

- [ ] **Step 3.2: Commit**

```bash
git add android/settings.gradle
git commit -m "$(cat <<'EOF'
chore(identity): rename gradle rootProject to 'hfs'

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Rename Java package directory and update declarations

**Files:**
- Move: `android/app/src/main/java/com/hfsapp/*.java` → `android/app/src/main/java/io/github/danghoangnhan/hfs/`
- Move: `android/app/src/debug/java/com/hfsapp/*.java` → `android/app/src/debug/java/io/github/danghoangnhan/hfs/`
- Modify: package declarations in those Java files

- [ ] **Step 4.1: Inspect what's there**

```bash
find android/app/src -name '*.java'
```

Expected output:
```
android/app/src/debug/java/com/hfsapp/ReactNativeFlipper.java
android/app/src/main/java/com/hfsapp/MainApplication.java
android/app/src/main/java/com/hfsapp/MainActivity.java
```

- [ ] **Step 4.2: Create new package directories and move files**

```bash
mkdir -p android/app/src/main/java/io/github/danghoangnhan/hfs
mkdir -p android/app/src/debug/java/io/github/danghoangnhan/hfs

git mv android/app/src/main/java/com/hfsapp/MainApplication.java android/app/src/main/java/io/github/danghoangnhan/hfs/
git mv android/app/src/main/java/com/hfsapp/MainActivity.java    android/app/src/main/java/io/github/danghoangnhan/hfs/
git mv android/app/src/debug/java/com/hfsapp/ReactNativeFlipper.java android/app/src/debug/java/io/github/danghoangnhan/hfs/

# Clean up empty directories
rmdir android/app/src/main/java/com/hfsapp android/app/src/main/java/com 2>/dev/null || true
rmdir android/app/src/debug/java/com/hfsapp android/app/src/debug/java/com 2>/dev/null || true
```

- [ ] **Step 4.3: Update package declarations**

In each of the three `.java` files, change the line:

```java
package com.hfsapp;
```

to:

```java
package io.github.danghoangnhan.hfs;
```

(Use sed to do all three in one shot:)

```bash
sed -i 's|package com\.hfsapp;|package io.github.danghoangnhan.hfs;|' \
  android/app/src/main/java/io/github/danghoangnhan/hfs/MainApplication.java \
  android/app/src/main/java/io/github/danghoangnhan/hfs/MainActivity.java \
  android/app/src/debug/java/io/github/danghoangnhan/hfs/ReactNativeFlipper.java
```

Verify:

```bash
grep -h "^package" android/app/src/main/java/io/github/danghoangnhan/hfs/*.java
grep -h "^package" android/app/src/debug/java/io/github/danghoangnhan/hfs/*.java
```

Expected: all three lines read `package io.github.danghoangnhan.hfs;`.

- [ ] **Step 4.4: Check for stale fully-qualified references**

```bash
grep -rn "com\.hfsapp\|com/hfsapp" android/
```

Expected: zero matches. (`AndroidManifest.xml` uses relative class names like `.MainActivity`, so it doesn't need editing.)

- [ ] **Step 4.5: Commit**

```bash
git add android/
git commit -m "$(cat <<'EOF'
chore(identity): rename Java package com.hfsapp → io.github.danghoangnhan.hfs

Moves MainApplication, MainActivity, and ReactNativeFlipper into the
new package directory and updates each file's `package` declaration.
AndroidManifest.xml uses relative class names (.MainActivity) so no
manifest edit is required.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Update `applicationId` in `android/app/build.gradle`

**Files:**
- Modify: `android/app/build.gradle`

- [ ] **Step 5.1: Change applicationId**

Find this line in `android/app/build.gradle` (under `defaultConfig`):

```groovy
applicationId "com.hfsapp"
```

Change to:

```groovy
applicationId "io.github.danghoangnhan.hfs"
```

- [ ] **Step 5.2: Build to verify**

```bash
cd android && ./gradlew :app:assembleDebug --no-daemon ; cd ..
```

Expected: `BUILD SUCCESSFUL`. If a Java file still has `package com.hfsapp;` (Step 4.3 missed something), this is where you'll find out.

- [ ] **Step 5.3: Commit**

```bash
git add android/app/build.gradle
git commit -m "$(cat <<'EOF'
chore(identity): set Android applicationId to io.github.danghoangnhan.hfs

Final piece of the rename. Verified by ./gradlew :app:assembleDebug.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Smoke test on emulator and open PR

- [ ] **Step 6.1: Boot the app**

```bash
yarn start
```

Press `a` for Android. Watch the launcher icon — it should now say "HFS — Student Housing" under it.

- [ ] **Step 6.2: Verify the install ID**

```bash
adb shell pm list packages | grep danghoangnhan
```

Expected:
```
package:io.github.danghoangnhan.hfs
```

(If you see `package:com.hfsapp` AND `package:io.github.danghoangnhan.hfs`, the old install is still there from before the rename — uninstall it first: `adb uninstall com.hfsapp`.)

- [ ] **Step 6.3: Push and open PR**

```bash
git push -u origin chore/identity-rename
gh pr create --base main --title "chore: identity rename (Phase 2)" --body "$(cat <<'EOF'
Phase 2 of the cleanup project. Aligns 7 places that disagree on the app's name/package.

## Final state

| Where | Value |
|---|---|
| package.json name | hfs-student-housing |
| app.json expo.name | HFS — Student Housing |
| app.json expo.slug | hfs-student-housing |
| app.json expo.android.package | io.github.danghoangnhan.hfs |
| app.json expo.ios.bundleIdentifier | io.github.danghoangnhan.hfs |
| android/settings.gradle rootProject.name | hfs |
| android/app/build.gradle applicationId | io.github.danghoangnhan.hfs |
| Java package | io.github.danghoangnhan.hfs |

## Why this name

Personal GitHub side project, no domain owned. \`io.github.<user>.<app>\` is the convention for personal/open-source apps without their own domain.

## Test plan

- [x] \`./gradlew :app:assembleDebug\` builds clean
- [x] App launches under new package, displays "HFS — Student Housing" label

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Verification before merge

- [ ] `grep -rn "com\.hfsapp\|com/hfsapp" android/` returns nothing.
- [ ] `./gradlew :app:assembleDebug` builds clean.
- [ ] App installs and launches under the new package on emulator.
- [ ] Launcher icon label reads "HFS — Student Housing".
