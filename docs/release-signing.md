# Release signing

The release build of `hfs_frontend` is signed with a keystore that is **not** committed to the repo. This document describes how to generate one and configure your environment.

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
- For CI: upload to EAS secrets (see "CI" below).

> ⚠️ **Back up the keystore.** If you lose it, you cannot publish updates to the same Play Store listing — Google Play matches the signing key, not the package name. Losing the keystore = losing the app's identity on the store.

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

The signed APK lands at `android/app/build/outputs/apk/release/app-release.apk`.

If any of the four env vars is unset, the build fails with a "missing keystore" error instead of falling back to the debug key — that's by design, see `android/app/build.gradle` `signingConfigs.release`.

## CI

EAS handles release signing for managed builds:

```bash
eas credentials
# follow prompts to upload release.keystore + passwords
```

EAS sets the same env vars on the build VM automatically. Local and CI use the same gradle config; only the source of the env vars differs.
