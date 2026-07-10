# Contributing to Open Grind

Thanks for considering contributing to Open Grind.

- [Contributing to Open Grind](#contributing-to-open-grind)
  - [Contribution guidelines](#contribution-guidelines)
  - [Getting started](#getting-started)
    - [Development environment](#development-environment)
    - [Project structure](#project-structure)
    - [Interacting with API](#interacting-with-api)
    - [Submitting your changes](#submitting-your-changes)
  - [Inclusion in GOVERNANCE.md](#inclusion-in-governancemd)


## Contribution guidelines

AI-generated pull requests are not allowed. AI-assisted code is allowed. All contributions must be aligned with [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

- Use American English spelling
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
	"User-Agent": "grindr3/25.20.0.147239;147239;Free;Android 13;Pixel 7;Google",
	"L-Device-Info":
		"1fAf9fB2aFfd47Fd;GLOBAL;2;3543028095;2400x1080;a1b2c3d4-e5f6-7890-abcd-ef1234567890",
	// modify L-Device-Info values randomly if you're getting ACCOUNT_BANNED at login stage
    // more info about these headers in docs: ./docs/content/grindr-api/security-headers.md
};

const req = await fetch("https://grindr.mobi/v8/sessions", {
	method: "POST",
	headers: {
		Accept: "application/json",
		...securityHeaders,
	},
	body: JSON.stringify({
		email: "yourmail@example.org",
		password: "comment out this field after you log in once, use authToken to refresh session",
		// authToken:
		//	"just reuse any of previous authTokens, even expired",
		token: null,
		geohash: null,
	}),
});

process.stdout.write("Grindr3 " + (await req.json().then((t) => t.sessionId)));

```

</details>

### Submitting your changes

1. [Create an account](https://git.opengrind.org/user/sign_up) on git.opengrind.org
2. [Create an SSH key](https://docs.codeberg.org/security/ssh-key/) for authorization on your computer and add it to your SSH config
3. [Add your SSH key](https://git.opengrind.org/user/settings/keys) to User settings -> SSH / GPG keys page on git.opengrind.org
4. [Fork open-grind](https://git.opengrind.org/open-grind/open-grind/fork) repository on git.opengrind.org. **AGit PRs are not accepted.**
5. Clone it locally using `git clone --recurse-submodules ssh://git@git.opengrind.org/yourusername/open-grind.git` and `cd` into it
6. Configure git to use **your git.opengrind.org account's email** to commit: `git config set user.email you+opengrind@example.org` — commits email must match an activated email address in your account
7. Configure git to use your name to commit: `git config set user.name gitusername` — it's recommended to use your git.opengrind.org account's display name
8. Configure git to sign commits: `git config set commit.gpgSign true` and tell it about your SSH/GPG key: `git config set user.signingKey '~/.ssh/<YOUR PUBLIC SSH KEY>'` (if you use SSH key to sign, also set `git config set gpg.format ssh`) — **all submitted commits must be signed by keys verified in your git.opengrind.org account.**
9. Create a new branch from main: `git branch your-feature main` — use a descriptive unique name
10. Make your changes, test them locally
11. Commit your changes
12. Make sure the commit is signed: `git cat-file commit HEAD` — **you must see `gpgsig` in the result**
13. Push your changes: `git push`
14. [Open a pull request](https://git.opengrind.org/open-grind/open-grind/pulls) in Pull requests page on git.opengrind.org
15. Submit and mark for review once you're ready

## Inclusion in GOVERNANCE.md

**Criteria:** Once you have at least 1 accepted PR with significant changes (a feature, a bug fix, a section of documentation), you can request inclusion into GOVERNANCE.md. AI-generated PRs don't count, unless you have proven significant work and understanding of the subject beyond the AI-generated content.

**Action:** Please write a message to [#dev:opengrind.org](https://element.hloth.dev/#/room/#dev:opengrind.org) Matrix chat room requesting inclusion into GOVERNANCE.md. Once accepted, your git.opengrind.org username appears in the list, usually the position is determined by the amount of code you have contributed.

**Links:** You need to add a donation link after that to GOVERNANCE.md yourself by opening a PR, the commit must be signed with the same key and identity you have used for commits in your previous PRs.
