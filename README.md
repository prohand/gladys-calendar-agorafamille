# Agora Famille Calendrier — Gladys Assistant integration

Calendar integration connecting [Gladys Assistant](https://gladysassistant.com)
to the **Agora Famille** family portal (published by Agora Plus) that many
French municipalities use for the school canteen, before/after-school care and
holiday clubs: the children's bookings and the invoices to pay go into the
Gladys calendar of each user who enables it.

Built on the official
[JavaScript integration template](https://github.com/GladysAssistant/integration-template-js)
and the SDK
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).
Requires **Gladys 5.3.0 or later**. Manifest type: **`calendar`**. Transport:
**cloud** (the portal is a web service). Country: **France**.

User documentation: [Français](./docs/fr.md) · [English](./docs/en.md) ·
[Deutsch](./docs/de.md) · [Español](./docs/es.md).

Companion of [gladys-agorafamille](https://github.com/prohand/gladys-agorafamille)
(devices, scene triggers, widget), which reads the same portal.

## What it does

| Calendar (per user)    | Events                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| One per child          | Each booked (or pending) activity, at the portal's hours, or over the whole day            |
| Agora Famille invoices | Each unpaid invoice, whole day on its due date, named with the amount left (never rounded) |

- **Per-user accounts** (`account_schema`): portal address, login, password.
  Enabling is the consent; calendars start private (`shared: false`).
- **Integration settings** (`config_schema`): refresh interval, days ahead,
  past days kept up to date, whole-day events, invoices calendar, detailed
  logs.
- **Action** of the Configuration screen: `sync_now`.
- **Read-only**: nothing is ever booked or cancelled on the portal.

Every user-facing text is in English, French, German and Spanish.

> **No official API.** Agora Plus publishes no API for its family portal: the
> integration makes the requests of the portal's own pages, gathered in
> [`src/agora/endpoints.js`](./src/agora/endpoints.js), and reads the answers
> tolerantly ([`src/agora/parse.js`](./src/agora/parse.js)).

## Project structure

```
.
├─ index.js                          # SDK bootstrap only
├─ src/
│  ├─ app.js                         # handlers, the refresh timer, the "Sync now" answer
│  ├─ sync.js                        # every enabled user kept in sync (one sync at a time per user)
│  ├─ calendar.js                    # one read of the portal → calendars + events (pure)
│  ├─ config.js                      # settings and per-user account, portal address parsing
│  ├─ i18n.js                        # en / fr / de / es helpers
│  ├─ logging.js                     # "Detailed logs" switch
│  ├─ messages.js                    # user-facing texts
│  └─ agora/
│     ├─ endpoints.js                # the portal requests (one place to adjust)
│     ├─ client.js                   # HTTP session: login, re-login, errors
│     ├─ parse.js                    # tolerant readers: children, planning, invoices
│     └─ dates.js                    # days and hours in Europe/Paris
├─ docs/{en,fr,de,es}.md             # user documentation
├─ test/                             # node --test, fake portal + fake Gladys of the SDK
├─ gladys-assistant-integration.json # manifest
├─ Dockerfile                        # Node 24 Alpine, read-only rootfs ready
├─ CHANGELOG.md · CLAUDE.md · SECURITY.md
└─ .github/                          # CI, release, build, GitHub releases, Dependabot
```

## Development

```bash
npm install
npm test               # node --test (no network: fake portal + fake Gladys)
npm run lint           # ESLint
npm run format:check   # Prettier, as the CI runs it
npm run format         # Prettier, fix in place
npx github:GladysAssistant/integration-store .   # store admission checks
```

Run it against a Gladys instance:

```bash
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="agora-famille-calendrier" \
LOG_LEVEL=debug \
npm start
```

## CI and releases

Same workflows as [prohand/gladys-devmel](https://github.com/prohand/gladys-devmel):

- **CI** (`ci.yml`) — Prettier, ESLint and tests on Node 22 and 24 for every
  push to `main` and every pull request; pull requests also run the store
  admission checks and build the Docker image.
- **Release** (`release.yml`) — Actions → Release → Run workflow → `patch`,
  `minor` or `major`: bumps `package.json` and the manifest (`version`,
  `docker_image`), moves `## [Unreleased]` of the changelog under the new
  version, tags, builds the `linux/amd64` + `linux/arm64` image to `ghcr.io`,
  publishes the GitHub Release and runs the full store checks.
- **Build** (`build.yml`) — multi-arch image, from a tag, a manual run or the
  Release workflow.
- **GitHub releases** (`github-release.yml`) — a Release for every `vX.Y.Z`
  tag, with its changelog section as notes.
- **Dependabot** — weekly npm, monthly GitHub Actions and Docker base image.

To publish: add the GitHub topic `gladys-assistant-integration`, describe the
changes under `## [Unreleased]` in [`CHANGELOG.md`](./CHANGELOG.md), then run
the Release workflow. Turn on **Private vulnerability reporting** in the
repository settings: [`SECURITY.md`](./SECURITY.md) sends reporters there.

## License

Apache-2.0
