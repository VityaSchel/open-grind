# Security Policy

Security vulnerabilities that expose user's identity, location, photos, or messages get priority over other reports.

## Supported versions

Open Grind is pre-1.0. Only the **latest release** on the [releases page](https://git.opengrind.org/open-grind/open-grind/releases) is supported: there are no backports and no maintenance branches, fixes ship in the next release. Update before reporting.

## Reporting a vulnerability

**Please do not open a public issue or pull request for a security bug.** git.opengrind.org has no private vulnerability reporting, so reports go straight to the maintainers:

- **Email** — [admin@opengrind.org](mailto:admin@opengrind.org), optionally encrypted to the project's PGP encryption subkey ([opengrind.org/pgp](https://opengrind.org/pgp), fingerprint in [KEYS.md](./KEYS.md))
- **Matrix, end-to-end encrypted** — the current decision making authority's contact is listed in [GOVERNANCE.md](./GOVERNANCE.md#maintainers)

Include the version, the platform and how to reproduce it. Redact profile IDs, messages, photos and coordinates, yours and other people's.

## What to expect

Open Grind has no security team and no funding, so we cannot promise a response time, and there is no bug bounty. Your disclosure is appreciated and you're welcome to request a place in [GOVERNANCE.md](./GOVERNANCE.md).

## Scope

In scope:

- This repository and the components it ships with: [grindr.rs](https://git.opengrind.org/open-grind/grindr.rs), [Google OAuth WebExtension](https://git.opengrind.org/open-grind/grindr-google-oauth-webextension), [Google OAuth Android app](https://git.opengrind.org/open-grind/open-grind-google-oauth-android-app), release pipeline
- Exposure of session tokens, device identity, or the media signing key, which Open Grind keeps in the platform credential store ([BUILDING.md](./BUILDING.md#credential-storage))
- Exposure of messages, private albums, or a user's real location to another user, another app on the device, a network observer, or someone with the unlocked device in hand
- Anything that sends user data to a third party: Open Grind ships no analytics and no trackers, and a regression there is a security bug, not a feature
- Supply chain — signing keys, CI, dependency pinning, and anything that breaks the reproducibility of a published release ([REPRODUCIBILITY.md](./REPRODUCIBILITY.md#verifying-a-published-release), [KEYS.md](./KEYS.md)). Dependencies are checked by `bun run check:deps` — `cargo deny` for Rust advisories, licenses and unknown sources, `bun audit` for every JavaScript workspace — weekly and on every manifest change; `deny.toml` records the few advisories that are ignored and why
- The project's own infrastructure: git.opengrind.org, opengrind.org, and the Matrix homeserver

Out of scope:

- Vulnerabilities in Grindr's own service, apps, or API — Open Grind is not affiliated with Grindr
- Copies of Open Grind obtained anywhere other than the official releases page
- Reports with no demonstrated attack path: scanner output, missing hardening flags, and similar

<!-- TODO: when the F-Droid listing is live:
- copies of Open Grind obtained anywhere other than the official releases page or
  our F-Droid listing; builds from any other channel are unsupported
-->

## Safe harbor

Research Open Grind in good faith, follow this policy, give us a chance to fix the issue before going public. Test only against accounts and devices you own, never access another person's account, messages, photos, or location. This policy covers Open Grind only, it cannot authorize testing against Grindr's systems.
