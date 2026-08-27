# Contributing to Open Grind

Thanks for considering contributing to Open Grind.

- [Contributing to Open Grind](#contributing-to-open-grind)
    - [Contribution guidelines](#contribution-guidelines)
    - [Getting started](#getting-started)
        - [Development environment](#development-environment)
        - [Project structure](#project-structure)
        - [Interacting with API](#interacting-with-api)
        - [Develop with Nix](#develop-with-nix)
    - [Architecture](#architecture)
        - [Where state lives](#where-state-lives)
        - [Function parameters](#function-parameters)
        - [Test selectors](#test-selectors)
        - [Versioning](#versioning)
    - [Submitting your changes](#submitting-your-changes)
        - [Checks and tests](#checks-and-tests)
        - [Sending your changes as a PR](#sending-your-changes-as-a-pr)
        - [Inclusion in GOVERNANCE.md](#inclusion-in-governancemd)
    - [Reproducibility](#reproducibility)

## Contribution guidelines

AI-generated pull requests are not allowed. AI-assisted code is allowed. All contributions must be aligned with [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

- Use American English spelling
- Internationalization is out of scope for now (see [#106](https://git.opengrind.org/open-grind/open-grind/issues/106)), so keep interface strings inline in American English, no translation layer and no partial translations
- Use [Phosphor Icons](https://phosphoricons.com) whenever possible

## Getting started

**[Join the Open Grind developers chat in Matrix!](https://matrix.to/#/#dev:opengrind.org)**

To minimize effort and time spent on porting code across platforms, the project is built with [Tauri](https://tauri.app/) — a cross-platform framework running the same codebase on Windows, Linux, macOS, Android and iOS. Native clients are currently not planned but would be highly appreciated and featured.

Projects reference:

- **[grindr.rs](https://git.opengrind.org/open-grind/grindr.rs) Rust crate** — Grindr API transport layer, authentication, network calls
- **[Grindr Google OAuth WebExtension](https://git.opengrind.org/open-grind/grindr-google-oauth-webextension)** — a web browser extension that extracts a Google OAuth token for Grindr (used for Sign in with Google)
- **[Open Grind](https://git.opengrind.org/open-grind/open-grind)** — cross-platform Tauri application using **grindr.rs** and sharing code from **Grindr Google OAuth WebExtension** for non-Android Google OAuth flow
- **[Open Grind Google OAuth Android App](https://git.opengrind.org/open-grind/open-grind-google-oauth-android-app)** — a companion Android-only app that renders Geckoview with **Grindr Google OAuth WebExtension** embedded, needed because Android system's WebView blocks the Google OAuth page
- **[Grindr Web Unlock](https://git.opengrind.org/open-grind/grindr-web-unlock)** — separate web browser extension that bypasses web.grindr.com client-side paywall
- **[Grindr API developer tool](https://git.opengrind.org/open-grind/grindr-api-dev-tool)** — Desktop Tauri app that handles API authorization, security headers, request fingerprints for you and provides type hints for known fields

### Development environment

1. Clone repository with submodules: `git clone --recurse-submodules ssh://git@git.opengrind.org/open-grind/open-grind.git`
2. Install prerequisites:
    - [Bun](https://bun.sh)
    - [Rust](https://rustup.rs)
    - [Tauri CLI](https://tauri.app/start/prerequisites/)
3. Install dependencies:
    ```bash
    bun ci
    ```
4. Then start a dev server:

    ```bash
    bun dev
    ```

    - Run with `PUBLIC_ENABLE_BLUR_EFFECTS=1` to blur all avatars in the app.
    - Run with `PUBLIC_ENABLE_DEMO=1` to switch to SFW mock data.

### Project structure

[src/](./src/) — frontend built with Svelte
[src-tauri/](./src-tauri/) — backend built with Rust
[docs](./docs/) — Open Grind guides and Grindr API docs

API Authorization, security headers and transport layer are handled by Rust lib; this way the token can be stored securely without ever being exposed to frontend.

All research efforts contributing to [docs](./docs) are highly valued and appreciated! Search for "WIP" in [OpenAPI spec file](./docs/lib/openapi.json) to find out which areas of the API haven't been reverse engineered yet. OpenAPI is the source of truth for API reference documentation, which is generated from it automatically. If you want to contribute to documentation, please update OpenAPI spec file manually or using a GUI editor.

### Interacting with API

Use **[Grindr API developer tool](https://git.opengrind.org/open-grind/grindr-api-dev-tool)** to send requests to Grindr API.

<details>
<summary>API request example in JavaScript/TypeScript</summary>

```ts
const securityHeaders = {
	"L-Locale": "en_US",
	"Accept-Language": "en-US",
	requireRealDeviceInfo: "true",
	"L-Time-Zone": "Europe/Madrid",
	"User-Agent":
		"grindr3/25.20.0.147239;147239;Free;Android 13;Pixel 7;Google",
	"L-Device-Info":
		"1fAf9fB2aFfd47Fd;GLOBAL;2;3543028095;2400x1080;a1b2c3d4-e5f6-7890-abcd-ef1234567890",
	// modify L-Device-Info values randomly if you're getting ACCOUNT_BANNED at login stage
	// more info about these headers in docs: ./docs/content/grindr-api/security-headers.md
};

const req = await fetch("https://grindr.mobi/v8/sessions", {
	method: "POST",
	headers: { Accept: "application/json", ...securityHeaders },
	body: JSON.stringify({
		email: "yourmail@example.org",
		password:
			"comment out this field after you log in once, use authToken to refresh session",
		// authToken:
		//	"just reuse any of previous authTokens, even expired",
		token: null,
		geohash: null,
	}),
});

process.stdout.write("Grindr3 " + (await req.json().then((t) => t.sessionId)));
```

</details>

### Develop with Nix

Linux:

```bash
nix develop .#linux
bun run tauri dev
```

Other platforms:

```bash
nix develop
bun run tauri dev
```

## Architecture

### Where state lives

Pick the shortest lifetime that still holds the data long enough:

- **Survives navigation and belongs to the signed-in account** — `accountScoped(create)` from [account-caches.ts](./src/lib/api/account-caches.ts). One instance per profile id, the previous one destroyed on account change. Conversations, taps and views use it.
- **Survives navigation and is not per-account** — a module singleton that calls `registerAccountCache({ reset })` itself, like `gridState` and the API caches. Anything cached across screens must register a reset, or it leaks into the next account.
- **Belongs to one route parameter** — a class the page constructs and destroys in an `$effect`, rebuilt when the parameter changes: `ConversationState`, `ProfileState`. Use it when reopening the screen should start over.
- **Belongs to one mount** — plain `$state` in the component.

Data that outlives the component goes in a state class, not in `<script module>`.

### Function parameters

Use named arguments in functions, except when:

- a subject followed by options — `fetchRest(path, { method })`
- order carries no meaning — `deepEqual(a, b)`
- the call reads as prose — `formatHeight(180, "cm")`
- the name already names its only argument — `getProfileById(profileId)`

### Test selectors

Query interactive elements by role and accessible name — `getByRole("button", { name: "Add attachment" })`. [accessible-names.spec.ts](./e2e/accessible-names.spec.ts) already fails the build when a control has no name, so the handle is guaranteed to exist.

When the element is not interactive — a scroller, a measured wrapper, a state-bearing part — give it `data-slot="<component>-<part>"` and select that. It is the same attribute the `ui/` primitives emit, so tests read one vocabulary.

Never select on Tailwind utility classes, tag shape, or computed style: `div.absolute.right-7.bottom-0` turns a padding tweak into a broken test, and scanning every `<div>` for `overflowY === "auto"` silently finds a different element once a second scroller appears. Library-owned classes are not utility classes — PhotoSwipe's `.pswp` and the `.item[href]` it is configured with are API contracts and stay.

### Versioning

Open Grind adopts semver and uses it for canonical version names, i.e. `vMAJOR.MINOR.PATCH` with optional `-TAG` or `-TAG.X` semver metadata (where `MAJOR`, `MINOR`, `PATCH` and `X` are non-negative integers), e.g. `v0.1.0`, `v1.0.0-rc` or `v1.2.3-beta.1`.

Android version code is calculated using `major * 1000000 + minor * 1000 + patch`, but for pre-mvp (v0.1.0) this convention is broken:

```
v0.1.0-alpha.1 = 1000
v0.1.0-alpha.2 = 1001
v0.1.0-alpha.3 = 1002
v0.1.0-alpha.4 = 1003
v0.1.0-alpha.5 = 1004
v0.1.0-beta.1  = 1010 (due to error, the actual release is 1004)
v0.1.0-beta.2  = 1020 (due to error, the actual release is 1010)
v0.1.0-beta.3  = 1030 (due to error, the actual release is 1020)
v0.1.0-beta.4  = 1040 (error fixed, actual release jumps from 1020 to 1040)
v0.1.0-beta.5  = 1050
```

Post-mvp versioning:

```
v0.2.0      =    2000
v0.2.1      =    2001
v0.3.0-rc.1 =    3000
v0.3.0      =    3000
v0.123.0    =  123000
v1.0.0      = 1000000
v1.1.0      = 1001000
v1.123.0    = 1123000
```

## Submitting your changes

### Checks and tests

Before opening a pull request, run the same checks CI runs:

- `bun run lint` — ESLint. Formatting is separate: `bun run format` (Prettier).
- `bun run check` — `svelte-check` type checking.
- `bun run check:deps` — `cargo deny` (advisories, licenses, duplicate and unknown-source crates) plus `bun audit` over every workspace. Needs [cargo-deny](https://github.com/EmbarkStudios/cargo-deny) on `PATH`; CI runs it on a weekly schedule and on any pull request that touches a manifest or lockfile.
- `bun run test` — frontend unit tests (Vitest) and Rust backend tests (`cargo test`) together. Individually: `bun run test:unit` and `bun run test:rust`.

End-to-end tests are a separate tier:

- `bun run test:e2e` — Playwright. One-time setup: `bunx playwright install chromium`. It drives the web build and runs the browser serially, which is why it stays out of `bun run test`.
- `bun run test:android` — JUnit tests for the Android sources. Needs the Android SDK and the Gradle files that `bun run tauri android build` generates, which is why it stays out of `bun run test`.

Local updater testing:

```sh
bun run dev:updater-server   # generates a dev minisign key, signs a payload, prints two exports
export OPEN_GRIND_UPDATE_ORIGIN=http://127.0.0.1:8787/
export OPEN_GRIND_UPDATE_KEY=<printed key>
```

Both variables are read only under `debug_assertions` ([dev.rs](./src-tauri/src/api/update/dev.rs)). Run `adb reverse tcp:8787 tcp:8787` to tunnel to an Android device. On Android the debug build instead reads the same two assignments from `/data/local/tmp/open-grind-update.env` on the device — `e2e/updater/run.ts android` pushes it automatically, or `adb push` it when testing by hand. `cargo test --lib -- --ignored live_` runs the end-to-end check, download and signature tests against it.

`bun ci` also installs a pre-commit hook ([lefthook](https://lefthook.dev/), configured in [lefthook.yml](./lefthook.yml)) that runs over staged files only:

- `*.{js,mjs,ts,svelte}` — Prettier, then ESLint with `--fix`
- `*.{json,md,yml,yaml,css,html}` — Prettier
- `*.sh` — ShellCheck
- `*.rs` — `rustfmt`, then `cargo clippy` over the whole crate

[ShellCheck](https://www.shellcheck.net/) and [rustfmt](https://github.com/rust-lang/rustfmt) must be on `PATH`. `nix develop` provides both, along with the pinned Rust and Android toolchains.

### Sending your changes as a PR

1. [Create an account](https://git.opengrind.org/user/sign_up) on git.opengrind.org
2. [Create an SSH key](https://docs.codeberg.org/security/ssh-key/) for authorization on your computer and add it to your SSH config
3. [Add your SSH key](https://git.opengrind.org/user/settings/keys) to User settings -> SSH / GPG keys page on git.opengrind.org
4. [Fork open-grind](https://git.opengrind.org/open-grind/open-grind/fork) repository on git.opengrind.org. **AGit PRs are not accepted.**
5. Clone it locally using `git clone --recurse-submodules ssh://git@git.opengrind.org/yourusername/open-grind.git` and `cd` into it
6. Configure git to use **your git.opengrind.org account's email** to commit: `git config set user.email you+opengrind@example.org` — commits email must match an activated email address in your account
7. Configure git to use your name to commit: `git config set user.name gitusername` — it's recommended to use your git.opengrind.org account's display name
8. Configure git to sign commits: `git config set commit.gpgSign true` and tell it about your SSH/GPG key: `git config set user.signingKey '~/.ssh/<YOUR PUBLIC SSH KEY>'` (if you use SSH key to sign, also set `git config set gpg.format ssh`) — **all submitted commits must be signed by keys verified in your git.opengrind.org account.**
9. Create a new branch from main: `git branch your-feature main` — use a descriptive unique name
10. Make your changes; run `bun run lint`, `bun run check`, and `bun run test` locally
11. Commit your changes
12. Make sure the commit is signed: `git cat-file commit HEAD` — **you must see `gpgsig` in the result**
13. Push your changes: `git push`
14. [Open a pull request](https://git.opengrind.org/open-grind/open-grind/pulls) in Pull requests page on git.opengrind.org
15. Submit and mark for review once you're ready

### Inclusion in GOVERNANCE.md

**Criteria:** Once you have at least 1 accepted PR with significant changes (a feature, a bug fix, a section of documentation), you can request inclusion into GOVERNANCE.md. AI-generated PRs don't count, unless you have proven significant work and understanding of the subject beyond the AI-generated content.

**Action:** Please write a message to [#dev:opengrind.org](https://element.hloth.dev/#/room/#dev:opengrind.org) Matrix chat room requesting inclusion into GOVERNANCE.md. Once accepted, your git.opengrind.org username appears in the list, usually the position is determined by the amount of code you have contributed.

**Links:** You need to add a donation link after that to GOVERNANCE.md yourself by opening a PR, the commit must be signed with the same key and identity you have used for commits in your previous PRs.

## Reproducibility

Consult [REPRODUCIBILITY.md](./REPRODUCIBILITY.md) for full details on how to reproduce builds and verify them.

Refreshing the lock:

```bash
nix flake update
```

`src-tauri/Cargo.lock` and `bun.lock` are reproducibility pins. Use lockfile-respecting commands for day-to-day work:

```bash
cargo build
bun ci
```

Never run `cargo update` or `bun update` without intentionally bumping dependencies and reviewing the diff.
