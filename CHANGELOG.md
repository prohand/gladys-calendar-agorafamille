# Changelog

All notable changes to this integration are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/), bumped by the Release workflow.

Describe each change under `## [Unreleased]` as you make it. The Release workflow moves that
section under the version it ships, and the section becomes the notes of the version's GitHub
Release.

## [Unreleased]

### Added

- Invoices sent to the Trésor public ("mise en impayé") stay out of the invoices calendar: the
  portal shows them unpaid forever. They are found from the portal (`isLitigation`, a state
  naming the Trésor) or from their numbers, in a new optional field of each user's account.

### Changed

- A new cover for the store.

## [1.0.1] - 2026-10-27

### Added

- Agora Famille calendar integration for Gladys 5.3+ (type `calendar`), started from the
  official JavaScript template: each Gladys user enables it with their own portal account
  ("My calendars"), and gets one calendar per child and one calendar of the invoices to pay.
- The booked days of the portal (`API_CALENDAR_COMPONENT/events`) become events at the hours
  the portal gives (Europe/Paris), or whole-day events when the portal gives none or the
  administrator prefers them. A day asked for and not answered yet is marked as pending.
- The unpaid invoices (`API_DASHBOARD/invoicesAgpGrid`) become whole-day events on their due
  date, named with the amount left to pay, never rounded. A portal without the invoices module
  gets no invoices calendar.
- Read-only by design: the integration never books nor cancels anything on the portal.
- Every sync replaces the events of the watched window (past days kept up to date, days ahead),
  so a day cancelled or an invoice paid on the portal leaves the calendar; a failed read
  publishes nothing. Calendars switched off by their user are skipped.
- "Sync now" action, and a connection status naming the user whose sync failed and why, in
  English, French, German and Spanish.
- `SECURITY.md`, `CHANGELOG.md` and `CLAUDE.md`.
- CI (Prettier, ESLint, tests on Node 22 and 24, store checks, Docker build), UI-driven
  Release, multi-arch build, GitHub Releases and Dependabot.

[Unreleased]: https://github.com/prohand/gladys-calendar-agorafamille/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/prohand/gladys-calendar-agorafamille/releases/tag/v1.0.1
