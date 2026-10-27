# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) and to human contributors when
working with code in this repository.

## What this is

A Gladys Assistant **external calendar integration** (manifest `type: "calendar"`, Node 22+,
ESM, no build step, one runtime dependency: `@gladysassistant/integration-sdk`) for the
**Agora Famille** family portal of French municipalities (Agora Plus). Requires Gladys 5.3+.
Cloud transport, France only.

Every Gladys user who enables it (`account_schema`: portal address, login, password) gets, in
their Gladys calendar, one calendar per child (the booked days, at the portal's hours) and one
calendar of the invoices to pay (whole day on the due date). **Read-only by design**: it never
books nor cancels anything on the portal. The companion repository
`prohand/gladys-agorafamille` (devices, scene triggers, widget) shares the `src/agora/` code.

## Commands

```bash
npm install
npm test                                   # node --test (built-in runner)
node --test test/calendar.test.js          # one file
node --test --test-name-pattern "invoice"  # tests whose name matches
npm run lint                               # eslint .
npm run format:check                       # prettier --check . (CI gate)
npm run format                             # prettier --write .
npx github:GladysAssistant/integration-store .   # store admission checks
```

CI runs `format:check`, `lint`, `test` on Node 22 and 24, the store checks and a Docker build on
pull requests. Run the three commands before pushing.

## Architecture

```
index.js                SDK bootstrap only (createApp + connect)
src/app.js              handlers (config, account updated, sync_now), the refresh timer
src/sync.js             every enabled user in sync: read, publish calendars/events, delete stale
src/calendar.js         pure: one read → calendars + events, ids, window, batches of ≤ 500
src/config.js           DEFAULT_CONFIG (mirrors the manifest defaults), account, portal URL
src/agora/endpoints.js  THE portal requests — the one file to adjust to a portal change
src/agora/client.js     HTTP session, re-login on expiry, typed AgoraError
src/agora/parse.js      tolerant readers (many field spellings), reservation states, hours
src/agora/dates.js      days and hours in Europe/Paris, Paris wall clock → UTC instant
src/i18n.js, messages.js  { en, fr, de, es } texts
```

### Invariants worth knowing

- **Calendar contract (SDK "Calendar providers").** Only users returned by
  `getCalendarAccounts()` are synced; re-read them on every connection and on
  `onCalendarAccountUpdated`. Every id is user-scoped: `gladys.externalId(`${user}:…`)`, built
  from `accountId` (commune + SHA-256 of the login, never the e-mail) and the portal's own ids
  (child id, `day:activityId`, invoice id). **Ids are forever**: changing them duplicates
  every calendar.
- **Windows prune.** `publishCalendarEvents(id, events, window)` replaces the integration's
  events of the window: every event must overlap it; > 500 events are split into disjoint
  day-aligned sub-windows (`batchesOf`). The window is `days_back` days ago to `days_ahead`
  days ahead, Paris midnights.
- **A failed read publishes nothing** (no empty push, no deletion). Stale calendars are deleted
  only after a full successful read. `sync: false` calendars are skipped (Gladys answers 403).
- **One sync at a time per user** (`run` in sync.js), users one after the other: Gladys allows
  30 calendar writes a minute per integration.
- **No official API.** Every request lives in `src/agora/endpoints.js`; the readers in
  `parse.js` look a value up under several names and DROP an entry they cannot read rather
  than guess. Add a spelling there, not a special case elsewhere. Sign-in is
  `encryptText` then `authentication` (see client.js); the portal's own code is public
  (`https://portalssl.agoraplus.fr/<commune>/pck_*`): read it before guessing a request.
- **Days and hours are Europe/Paris** (`dates.js`): a timed event is published as a UTC ISO
  instant (`parisInstant`), a whole-day event as `YYYY-MM-DD` with an exclusive end. Hours are
  kept only when both exist on the same day, end after start.
- **Amounts are never rounded**: `formatEuros` shows at least 2 and up to 9 decimals.
- **Secrets**: never log the password, the session id, the login, or the planning/invoice
  contents at info (counts only).
- **Nothing is written to disk**; the container rootfs is read-only anyway.

## Rules

- **Versions belong to the Release workflow** (Actions → Release). Never edit `version` in
  `package.json` or the manifest, nor the `docker_image` tag, by hand. `test/manifest.test.js`
  checks they agree.
- **Changelog**: every user-visible change adds a line under `## [Unreleased]` in
  `CHANGELOG.md` (`### Added`, `Changed`, `Fixed`, `Removed`, `Security`). Never write a version
  heading: the Release workflow does.
- **Manifest**: every text is `{ en, fr, de, es }`; `test/manifest.test.js` ties it to the code
  (defaults, account keys, actions). Change both sides together.
- **User-facing text** is in the four languages; `docs/en.md`, `docs/fr.md`, `docs/de.md`,
  `docs/es.md` are kept in sync.
- **Style**: Prettier formats, ESLint catches mistakes. Comments explain why, in English. Tests
  never touch the network (`test/helpers/fakePortal.js`, `createFakeGladys` of the SDK).
