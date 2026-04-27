# hfs_frontend Phase 5 — Release Keystore & CI Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make release builds signable with a real keystore via env vars (no debug-keystore-shipping-as-release), and replace the broken `expo publish` CI workflow with a working `eas update` pipeline.

**Architecture:** Gradle `signingConfigs.release` reads four env vars (with safe placeholders for offline dev). GitHub Actions workflow uses `eas update` and `EXPO_TOKEN` from repo secrets. Action versions bumped on both workflows. App icon resized to the size stores require.

**Tech Stack:** Gradle, GitHub Actions, EAS CLI.

---

## Pre-flight

- [ ] **Phases 1–4 merged.** This phase depends on Phase 2 (identity rename) and Phase 3 (SDK upgrade) being settled, since `expo prebuild` could regenerate the gradle file we're about to edit.
- [ ] **Daniel has run `eas init`** in the repo and added `EXPO_TOKEN` as a GitHub secret. (If not, Step 6 will fail; do it then.)
- [ ] **Branch:**
  ```bash
  cd /home/daniel/hfs_frontend
  git checkout main && git pull --ff-only
  git checkout -b chore/release-and-ci
  ```

---

## Task 1: Wire env-var keystore into `android/app/build.gradle`

**Files:**
- Modify: `android/app/build.gradle`

- [ ] **Step 1.1: Locate the signingConfigs block**

Open `android/app/build.gradle` and find:

```groovy
signingConfigs {
    debug {
        storeFile file('debug.keystore')
        storePassword 'android'
        keyAlias 'androiddebugkey'
        keyPassword 'android'
    }
}
```

- [ ] **Step 1.2: Add `release` signingConfig with env vars**

Replace the entire `signingConfigs` block with:

```groovy
signingConfigs {
    debug {
        storeFile file('debug.keystore')
        storePassword 'android'
        keyAlias 'androiddebugkey'
        keyPassword 'android'
    }
    release {
        def storeFilePath  = System.getenv("HFS_RELEASE_STORE_FILE")
        def storePass      = System.getenv("HFS_RELEASE_STORE_PASSWORD")
        def alias          = System.getenv("HFS_RELEASE_KEY_ALIAS")
        def keyPass        = System.getenv("HFS_RELEASE_KEY_PASSWORD")
        if (storeFilePath && storePass && alias && keyPass) {
            storeFile     file(storeFilePath)
            storePassword storePass
            keyAlias      alias
            keyPassword   keyPass
        } else {
            // Placeholder: assembleRelease will fail loudly with a missing-keystore
            // error rather than silently signing release builds with the debug key.
            storeFile file("release.keystore.placeholder")
            storePassword ""
            keyAlias ""
            keyPassword ""
        }
    }
}
```

- [ ] **Step 1.3: Update `buildTypes.release` to use the new signingConfig**

Find the `release {}` block under `buildTypes` and change `signingConfig signingConfigs.debug` to `signingConfig signingConfigs.release`. The block should read:

```groovy
release {
    signingConfig signingConfigs.release
    minifyEnabled enableProguardInReleaseBuilds
    proguardFiles getDefaultProguardFile("proguard-android.txt"), "proguard-rules.pro"
}
```

- [ ] **Step 1.4: Verify debug build still works**

```bash
cd android && ./gradlew :app:assembleDebug --no-daemon ; cd ..
```

Expected: `BUILD SUCCESSFUL`. (Release build will fail without the env vars set, which is the intended behavior; we don't run it here.)

- [ ] **Step 1.5: Commit**

```bash
git add android/app/build.gradle
git commit -m "$(cat <<'EOF'
chore(release): env-var release signing; debug keystore stays for debug

Production releases now require:
  HFS_RELEASE_STORE_FILE
  HFS_RELEASE_STORE_PASSWORD
  HFS_RELEASE_KEY_ALIAS
  HFS_RELEASE_KEY_PASSWORD

When unset, assembleRelease fails with a missing-keystore error
instead of silently using the debug keystore (the previous behavior,
which was a foot-cannon).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Document keystore generation

**Files:**
- Create: `docs/release-signing.md`

- [ ] **Step 2.1: Write the doc**

Create `docs/release-signing.md`:

```markdown
# Release signing

The release build of hfs_frontend is signed with a keystore that is **not** in the repo. This document describes how to generate one and configure your environment.

## Generate the keystore (one-time, offline)

```bash
keytool -genkey -v \
  -keystore release.keystore \
  -alias hfs \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

You'll be prompted for:
- a **store password** — password for the keystore file itself
- a **key password** — password for the key inside (you can use the same value)
- distinguishing-name fields — name, organization, locality, etc. These appear in the certificate metadata; reasonable values are fine.

Store the resulting `release.keystore` somewhere safe **outside the repo**:
- Locally: `~/.keystores/hfs/release.keystore` (or wherever you prefer).
- For CI: upload to EAS secrets (see Phase 5 Task 4 of the plan).

**Back up the keystore.** If you lose it, you cannot publish updates to the same Play Store listing — Google Play matches the signing key, not the package name. Losing the keystore = losing the app's identity on the store.

## Set env vars locally

Add to your shell profile (`~/.bashrc` or `~/.zshrc`):

```bash
export HFS_RELEASE_STORE_FILE="$HOME/.keystores/hfs/release.keystore"
export HFS_RELEASE_STORE_PASSWORD="<your store password>"
export HFS_RELEASE_KEY_ALIAS="hfs"
export HFS_RELEASE_KEY_PASSWORD="<your key password>"
```

Reload (`source ~/.bashrc`) and verify:

```bash
cd android && ./gradlew :app:assembleRelease --no-daemon
```

The signed APK will be at `android/app/build/outputs/apk/release/app-release.apk`.

## CI

EAS handles release signing for managed builds. For bare workflow:
- Upload the keystore as an EAS secret (`eas credentials`).
- The same env vars are set on the EAS build VM automatically.
```

- [ ] **Step 2.2: Commit**

```bash
git add docs/release-signing.md
git commit -m "$(cat <<'EOF'
docs: how to generate and configure the release keystore

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Replace the GitHub Actions workflow with `eas update`

**Files:**
- Modify: `.github/workflows/main.yml`

- [ ] **Step 3.1: Replace contents**

Overwrite `.github/workflows/main.yml`:

```yaml
name: EAS Update

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  update:
    name: Publish OTA update
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: yarn

      - name: Install dependencies
        run: yarn install --frozen-lockfile

      - uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}

      - name: Publish update
        run: eas update --auto --non-interactive
```

- [ ] **Step 3.2: Commit**

```bash
git add .github/workflows/main.yml
git commit -m "$(cat <<'EOF'
ci: replace dead expo publish with eas update

Old workflow used \`expo publish\` (deprecated, removed) and required
EXPO_CLI_USERNAME/PASSWORD secrets. New workflow uses \`eas update\`
with EXPO_TOKEN. Action versions bumped:
  actions/checkout@v1 -> v4
  actions/setup-node@v1 -> v4
  expo/expo-github-action@v5 -> v8

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Bump CodeQL workflow

**Files:**
- Modify: `.github/workflows/codeql-analysis.yml`

- [ ] **Step 4.1: Bump action versions**

In `.github/workflows/codeql-analysis.yml`:

- `actions/checkout@v2` → `actions/checkout@v4`
- `github/codeql-action/init@v1` → `github/codeql-action/init@v3`
- `github/codeql-action/autobuild@v1` → `github/codeql-action/autobuild@v3`
- `github/codeql-action/analyze@v1` → `github/codeql-action/analyze@v3`

(Use sed for safety:)

```bash
sed -i \
  -e 's|actions/checkout@v2|actions/checkout@v4|' \
  -e 's|github/codeql-action/init@v1|github/codeql-action/init@v3|' \
  -e 's|github/codeql-action/autobuild@v1|github/codeql-action/autobuild@v3|' \
  -e 's|github/codeql-action/analyze@v1|github/codeql-action/analyze@v3|' \
  .github/workflows/codeql-analysis.yml
```

Verify:

```bash
grep "@v" .github/workflows/codeql-analysis.yml
```

Expected: only `@v3` and `@v4` versions.

- [ ] **Step 4.2: Commit**

```bash
git add .github/workflows/codeql-analysis.yml
git commit -m "$(cat <<'EOF'
ci(codeql): bump action versions v1/v2 → v3/v4

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Resize app icon

**Files:**
- Modify: `assets/images/logo-sm.png` (or rename)

- [ ] **Step 5.1: Inspect current icon**

```bash
file assets/images/logo-sm.png
identify assets/images/logo-sm.png 2>/dev/null || echo "imagemagick not installed"
```

The current icon is a 64KB PNG; Expo wants 1024×1024 for the app icon (`app.json` `icon` field). Stores require it for upload.

- [ ] **Step 5.2: Generate a 1024×1024 icon**

If you have a high-res source, drop it at `assets/images/icon.png` (1024×1024, opaque, no rounded corners). If not, upscale the existing logo (acceptable as a placeholder; ship a real one before submitting):

```bash
# Requires imagemagick: sudo apt install imagemagick
convert assets/images/logo-lg.png -resize 1024x1024 -background white -gravity center -extent 1024x1024 assets/images/icon.png
```

(`logo-lg.png` is 527 KB and likely high-res enough to upscale.)

- [ ] **Step 5.3: Update `app.json` to point to it**

In `app.json`, change `"icon": "./assets/images/logo-sm.png"` to `"icon": "./assets/images/icon.png"`.

- [ ] **Step 5.4: Verify `expo prebuild` regenerates the launcher mipmaps**

```bash
npx expo prebuild --platform android --no-install
```

Expect: `android/app/src/main/res/mipmap-*/ic_launcher.png` regenerated. Don't `--clean` here — we want to preserve Phase 1/2 customizations.

- [ ] **Step 5.5: Commit**

```bash
git add assets/images/icon.png app.json android/app/src/main/res/mipmap-*/
git commit -m "$(cat <<'EOF'
chore(assets): 1024x1024 app icon

Stores require 1024x1024. Generated from logo-lg.png as a placeholder;
swap for a designed icon before listing publicly.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Smoke test EAS workflow

- [ ] **Step 6.1: Confirm `EXPO_TOKEN` is set as a repo secret**

```bash
gh secret list --repo danghoangnhan/hfs_frontend
```

Expected: `EXPO_TOKEN` listed. If not:
```bash
# Generate a token at https://expo.dev/settings/access-tokens, then:
gh secret set EXPO_TOKEN --repo danghoangnhan/hfs_frontend
# (paste the token when prompted)
```

- [ ] **Step 6.2: Trigger the workflow on a push**

```bash
git push -u origin chore/release-and-ci
gh pr create --base main --title "chore: release & CI (Phase 5)" --body "<see Step 6.3>"
```

The PR push won't trigger the EAS workflow (it's on `push: branches: [main]`). Smoke test after merge.

- [ ] **Step 6.3: PR body**

```bash
# (Generate the body before running gh pr create above)
gh pr edit --body "$(cat <<'EOF'
Phase 5 of the cleanup project.

## Summary

- \`android/app/build.gradle\` reads release-signing creds from env vars; assembleRelease fails loudly without them rather than silently using the debug keystore (the previous behavior).
- \`docs/release-signing.md\` documents how to generate and configure the keystore.
- \`.github/workflows/main.yml\` rewritten: \`expo publish\` (deprecated) → \`eas update\`. EXPO_CLI_USERNAME/PASSWORD secrets gone; needs EXPO_TOKEN.
- \`.github/workflows/codeql-analysis.yml\` action versions bumped v1/v2 → v3/v4.
- 1024x1024 app icon generated from \`logo-lg.png\` as a placeholder.

## Test plan

- [x] \`./gradlew :app:assembleDebug\` builds clean (release blocked without keystore — intentional)
- [x] CodeQL workflow YAML lints (\`yamllint .github/workflows/\`)
- [ ] (Post-merge) EAS workflow runs successfully against an authenticated EXPO_TOKEN

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 6.4: Post-merge: verify EAS workflow ran**

```bash
gh run list --workflow=main.yml --limit 5
gh run view <run-id> --log
```

Expected: `eas update --auto` succeeded; you can see the update branch in the EAS dashboard.

If it fails with `EXPO_TOKEN` issues, generate a new token at https://expo.dev/settings/access-tokens with **publish** scope and re-set the secret.

---

## Verification before merge

- [ ] `./gradlew :app:assembleDebug` works.
- [ ] `./gradlew :app:assembleRelease` fails with the expected "missing keystore" error message (good — it should fail without the env vars).
- [ ] `app.json` icon path updated.
- [ ] `EXPO_TOKEN` secret confirmed present (`gh secret list`).
- [ ] No `expo publish` references anywhere in the repo (`grep -rn "expo publish" .github/ docs/`).
