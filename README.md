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

- Run the backend stack: `cd ../hfs_backend && docker compose up`
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

MIT — see [`LICENSE`](LICENSE).
