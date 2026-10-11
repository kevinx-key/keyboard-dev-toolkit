# Contributing to Keyboard Dev Toolkit

Thanks for wanting to help! This document covers how to get set up, what we
expect, and the house rules. By opening a pull request you agree to the
[Contributor License Agreement](./CLA.md).

## Before you start

- **Open an issue first** for anything non-trivial (new feature, refactor,
  behavior change) so we can agree on the approach before you write code.
- Small fixes (typos, i18n strings, obvious bugs) can go straight to a PR.

## Development setup

```bash
git clone https://github.com/kevinx-key/keyboard-dev-toolkit.git
cd keyboard-dev-toolkit
npm install        # postinstall prepares the community (pro-stub) modules
npm run dev        # http://localhost:3000
```

Requires **Node.js 24+**.

## Checks (must pass before a PR is ready)

```bash
npm run lint        # eslint
npm run typecheck   # tsc --noEmit
npm run test        # vitest
npm run build       # static export smoke test
npm run check       # lint + typecheck + build
```

`npm run check:full` runs tests + check together. CI runs lint (advisory),
typecheck and build on every push/PR.

## House rules

- **Language:** the project ships UI text in **9 languages** (en, zh, zh-HK,
  ko, ja, ru, fr, pt, es). Any new user-facing string must be added to
  `src/lib/i18n.tsx` for **all** locales — no hard-coded strings in components.
- **Commits:** `<type>: <short description>` where type ∈
  `feat | fix | refactor | docs | test | chore | perf | ci`. Keep commits focused.
- **Branches:** branch off `main` (`feat/...`, `fix/...`). Never commit
  directly to `main` in this repo.
- **Versioning:** the web app's version is bumped for **every** code change
  (`npm run version:bump`) — update the page badge + `<title>`.
- **No secrets:** never commit API keys, tokens, `.env` files, or production
  infrastructure details.
- **Proprietary assets:** do **not** add or re-add CAD/3D design-data files
  (`*.dxf`, `*.stp`, `*.step`) or dimension drawings to this repository — they
  are proprietary assets and are excluded by `.gitignore` (see LICENSE §2).
- **License hygiene:** only contribute code you have the right to submit, and
  only under compatible licenses (see [CLA.md](./CLA.md) §5). Do not paste code
  from GPL-only or proprietary sources.

## CLA

Every contributor must sign the [CLA](./CLA.md) before their first PR can be
merged. It is signed by commenting on your PR:

```
I have read the CLA Document and I hereby sign the CLA
```

(The CLA Assistant bot will prompt you automatically.)

## Good first issues

- i18n strings and translations (9 languages)
- Canvas rendering performance
- Export-format coverage and edge cases
- Documentation and screenshots
