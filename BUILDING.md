# Building Open Grind

Pick your platform, then a method within it. Everything below the platform sections applies to both.

> [!NOTE]
> Only Android release builds are tested as of June 23rd, 2026.

- [Building Open Grind](#building-open-grind)
    - [Android](#android)
        - [Build with Docker (easiest)](#build-with-docker-easiest)
            - [Clean-up Docker](#clean-up-docker)
        - [Build with Nix (builds everywhere)](#build-with-nix-builds-everywhere)
        - [Build manually (advanced)](#build-manually-advanced)
        - [Signing](#signing)
            - [Sign \& build with Docker](#sign--build-with-docker)
            - [Sign \& build with Nix](#sign--build-with-nix)
            - [Sign \& build manually](#sign--build-manually)
        - [Verifying a published Android release](#verifying-a-published-android-release)
    - [macOS](#macos)
        - [Build and package](#build-and-package)
        - [Signing and notarization](#signing-and-notarization)
        - [Verifying a published macOS release](#verifying-a-published-macos-release)
    - [Credential storage](#credential-storage)
    - [Trusting the build environment](#trusting-the-build-environment)
        - [Verifying Nix and flake.lock](#verifying-nix-and-flakelock)
        - [Verifying the Gradle wrapper jar](#verifying-the-gradle-wrapper-jar)
    - [Reproducible CI release](#reproducible-ci-release)
    - [Reproducibility](#reproducibility)
        - [Refreshing the lock](#refreshing-the-lock)
        - [Cargo / JS hygiene](#cargo--js-hygiene)

## Android

### Build with Docker (easiest)

This method does not require installing Nix to your machine, but requires more disk space. It essentially automates [native Nix build method](#build-with-nix-builds-everywhere) for you with zero setup needed.

> [!IMPORTANT]
> **The image is pinned to `linux/amd64`.** The Android NDK ships only an x86_64 host cross-compiler — also the canonical reproducible target — so the build always runs in an `x86_64-linux` environment. On a native x86_64 Linux host that runs directly; on Apple Silicon (arm64) macOS it runs under Docker Desktop's amd64 emulation (Rosetta or QEMU).
>
> **Apple Silicon works — the only caveat is memory.** Because the container evaluates as `x86_64-linux`, [flake.nix](./flake.nix) takes its i686-stripped `androidenv` path, so the toolchain realizes cleanly and the old `personality(PER_LINUX32)` failure no longer applies. The one requirement is RAM: the universal (4-ABI) release build OOMs at Docker Desktop's default ~8 GB, so raise the memory limit to **at least 12 GB** (Settings &rarr; Resources &rarr; Memory) before building. To sanity-check on less RAM, build a single ABI with `-e OPEN_GRIND_ANDROID_ABI=aarch64` — but that is not the universal release artifact. Since the container runs as `x86_64-linux`, an Apple Silicon Docker build reproduces the canonical release; a native `nix run .#build-android` on `aarch64-darwin` does **not** (different host toolchain).

Prerequisites:

- [Docker](https://docs.docker.com/get-started/get-docker/) with Compose installed
- ~30 GB of free disk space (the ~12 GB toolchain plus build caches; the first run needs ~15 GB transient)
- On Apple Silicon: **>=12 GB of memory** allocated to Docker Desktop (the universal build OOMs at the ~8 GB default)

1. Install Docker on your host system and make sure to give it enough disk headroom (Settings &rarr; Resources &rarr; Disk): the toolchain is ~12 GB and its first realization needs ~15 GB of transient space.
2. Build the thin image: `docker compose build`
3. Build the apk: `docker compose run --rm build`
4. Retrieve the apk from `src-tauri/gen/android/app/build/outputs/apk/universal/release/open-grind-v<version>-android-unsigned.apk` on your host system
5. Follow [Signing](#signing) steps to make the build installable on your Android device

#### Clean-up Docker

```bash
docker compose down -v   # removes the toolchain + all cache volumes (~25 GB)
docker image rm open-grind-build   # removes the thin image
```

### Build with Nix (builds everywhere)

Open Grind ships a [Nix flake](./flake.nix) that pins the entire Android toolchain — Rust, the JDK, the Android SDK, the NDK, Gradle, Bun, and Node.js — so any contributor on Linux or macOS can produce an identical build in an identical environment.

- [Nix](https://nixos.org/download) >= 2.18
- ~30 GB of disk space

1. Install and configure Nix on your host system
2. Run `nix run .#build-android`
3. Retrieve the apk: `src-tauri/gen/android/app/build/outputs/apk/universal/release/open-grind-v<version>-android-unsigned.apk` on your host system

> [!NOTE]
> First time you run `nix develop` or `nix run` in Open Grind's repository, Nix will download and setup about 3 GB environment, which might take some time, depending on your internet connection speed.

> [!NOTE]
> If you use [direnv](https://direnv.net/), the bundled [.envrc](./.envrc) activates the dev shell automatically when you `cd` into the repository.

### Build manually (advanced)

If you already have an Android toolchain (e.g. via Android Studio) and Rust installed, you can build against those directly. This reuses what is already on your machine instead of downloading the pinned ~12 GB toolchain, so it saves a lot of disk — at the cost of a build that is **not** guaranteed byte-for-byte identical to a release (your tool versions, paths, and timestamps differ). Use it for developing and testing patches; use Nix when you need to [reproduce a published release](#verifying-a-published-android-release).

Prerequisites (match the pinned versions where you can — see the [Reproducibility](#reproducibility) table):

- **Rust** via [rustup](https://rustup.rs) — [rust-toolchain.toml](./rust-toolchain.toml) pins 1.95.0 and lists the Android targets, which rustup installs automatically the first time you build in the repo
- **JDK 21** (e.g. [Temurin](https://adoptium.net), or Android Studio's bundled JDK) — 17+ will likely build but won't match a release
- **Android SDK** via Android Studio's SDK Manager (or the command-line `sdkmanager`): SDK Platform 36, Build-Tools 35.0.0, NDK 29.0.14206865, CMake 3.22.1
- **[Bun](https://bun.sh)**

1. Point Tauri at your SDK / NDK / JDK (paths shown for macOS; on Linux the SDK is usually `~/Android/Sdk`):

```bash
export JAVA_HOME="$(/usr/libexec/java_home -v 21)"   # or your JDK 21 path
export ANDROID_HOME="$HOME/Library/Android/sdk"
export NDK_HOME="$ANDROID_HOME/ndk/29.0.14206865"
```

2. Build:

```bash
bun install
bun run tauri android build --apk
```

3. Retrieve the apk from `src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk` on your host system
4. Follow [Signing](#signing) to make the build installable on your Android device

### Signing

You need to follow these instructions in order to install the APK on an Android device, otherwise attempts to install it will throw "App not installed as package appears to be invalid." error.

You don't need to follow these instructions if you're just [verifying release binaries reproducibility](#verifying-a-published-android-release).

Never commit or otherwise publish anything about your keystore.

`keytool` is part of the JDK, so it is already available inside `nix develop` — you do not need to install it.

1. Create a JKS once (from inside `nix develop`):

```bash
keytool -genkey -v \
  -keystore ~/.config/open-grind/release.jks \
  -alias open-grind \
  -keyalg EC \
  -groupname secp256r1 \
  -sigalg SHA256withECDSA \
  -validity 20000
```

2. Copy [contrib/keystore.properties.example](./contrib/keystore.properties.example) to a private location such as `/home/you/.config/open-grind/keystore.properties` and fill it in.

3. Build with keystore passed (see below):

#### Sign & build with Docker

Mount the keystore directory onto the container's home so the `~/` in `storeFile` resolves the same as on your host, then point `OPEN_GRIND_KEYSTORE_PROPERTIES` at the in-container path:

```bash
docker compose run --rm \
  -v ~/.config/open-grind:/root/.config/open-grind:ro \
  -e OPEN_GRIND_KEYSTORE_PROPERTIES=/root/.config/open-grind/keystore.properties \
  build
```

#### Sign & build with Nix

Point `OPEN_GRIND_KEYSTORE_PROPERTIES` at keystore.properties file and run the `nix run .#build-android`:

```bash
OPEN_GRIND_KEYSTORE_PROPERTIES=/home/you/.config/open-grind/keystore.properties \
  nix run .#build-android
```

#### Sign & build manually

`OPEN_GRIND_KEYSTORE_PROPERTIES` is a flake convenience and is ignored by a plain `tauri` build. Gradle reads `keystore.properties` from the Android project root, so place it there yourself (it is gitignored) before building:

```bash
cp ~/.config/open-grind/keystore.properties src-tauri/gen/android/keystore.properties
bun run tauri android build --apk
rm src-tauri/gen/android/keystore.properties   # optional: don't leave the password lying around
```

### Verifying a published Android release

Published artifacts carry a detached [minisign](https://jedisct1.github.io/minisign/) signature. Anyone can also check that the published binary was built from the source in this repository, no key required.

Android's v2/v3 signing block lives in a dedicated region between the last zip entry and the central directory; v1 (JAR) signatures live in `META-INF/*.SF`, `*.{RSA,EC,DSA}`, and modify `MANIFEST.MF`. Everything else — dex, native libs, resources, manifest, assets — is byte-identical between a signed and an unsigned build of the same source on the same toolchain.

All tools below ship with the dev shell — `nix develop` and you're ready.

> [!IMPORTANT]
> The canonical release build reproduces only in an `x86_64-linux` build environment — a native x86_64 Linux host, or the [Docker method](#build-with-docker-easiest) on any machine (that is also how [CI builds](#reproducible-ci-release) releases). A native `nix run .#build-android` on Apple Silicon macOS produces a different, non-matching APK.

```bash
nix develop

# 1. Reproduce the unsigned APK locally
git checkout v<tag>
nix run .#build-android
LOCAL=src-tauri/gen/android/app/build/outputs/apk/universal/release/open-grind-v<tag>-android-unsigned.apk

# 2. Fetch the published signed APK and its signature, side by side
#    (https://git.opengrind.org/open-grind/open-grind/releases)
PUBLISHED=/path/to/open-grind-v<tag>-android.apk   # minisign reads "$PUBLISHED.minisig"

# 3. Confirm the release signature
#    Key and its provenance: KEYS.md
if minisign -Vm "$PUBLISHED" -P RWReleaseOpenGrindurRQcmR+NovOaU5IEU3LM5l6TcXJvOGYw2m4O+; then
  echo "✓ signature valid and verified"
else
  echo "✗ signature invalid, do not install this APK" >&2
  exit 1
fi

# 4. Confirm the content reproduces
apk_content_hash() {
  unzip -Z1 "$1" \
    | grep -vE '^META-INF/(MANIFEST\.MF|[^/]+\.(SF|RSA|EC|DSA))$' \
    | while IFS= read -r entry; do
        printf '%s  %s\n' \
          "$(unzip -p "$1" "$entry" | sha256sum | cut -c1-64)" \
          "$entry"
      done
}
if diff <(apk_content_hash "$LOCAL") <(apk_content_hash "$PUBLISHED"); then
  echo "✓ APK hash checksum matches"
else
  echo "✗ APK hash checksum mismatch, local build does not match the published APK" >&2
  exit 1
fi
```

If steps 3 and 4 both succeed, the published APK was built from this commit and signed by Open Grind's governance key.

## macOS

There is no Docker path here: containers on Linux cannot run Darwin binaries, and Apple's licence restricts macOS virtualization to Apple hardware, so a macOS build needs a Mac. Nix still pins most of the toolchain, so build from inside the dev shell.

### Build and package

```bash
nix develop
bun run package:macos
```

This builds the app, signs it, and writes a zip to `src-tauri/target/release/artifacts/`. That zip is the only macOS artifact — it is what people download and what the in-app updater installs.

The build always enables the `keychain` feature, so a packaged artifact is shaped like a release whoever builds it, which is what makes verification symmetric. Ad-hoc builds therefore cannot read back credentials an earlier build wrote; use `bun run tauri dev` for day-to-day work.

A release build refuses to run from anywhere but `/Applications` or `~/Applications`, since replacing itself in place is only possible from there. It shows a native dialog and quits before any window is created.

Build inside the dev shell if you care about reproducing: two clean release builds there produce a byte-identical binary, measured on `aarch64-darwin`. Debug builds do not reproduce — their symbol and debug tables differ between runs — which is why `package:macos` defaults to `--release`.

### Signing and notarization

| variable               | default | effect                                                         |
| ---------------------- | ------- | -------------------------------------------------------------- |
| `MACOS_SIGN_IDENTITY`  | `-`     | `-` is ad-hoc: runs on your machine, not distributable         |
| `MACOS_NOTARY_PROFILE` | unset   | `notarytool` keychain profile; when set, notarizes and staples |

`src-tauri/entitlements.plist` is passed to `codesign` when it exists.

For distribution, store the notary credentials once, then build:

```bash
xcrun notarytool store-credentials open-grind \
  --apple-id you@example.com --team-id TEAMID --password app-specific-password

MACOS_SIGN_IDENTITY="Developer ID Application: Name (TEAMID)" \
MACOS_NOTARY_PROFILE=open-grind \
  bun run package:macos
```

### Verifying a published macOS release

Signing embeds a secure timestamp and stapling adds a notarization ticket, so a distributed app is never byte-identical to a local build. Putting both through the same sign-then-strip cycle cancels that out and leaves the rest comparable:

```bash
nix develop
git checkout v<tag>
bun run package:macos
bun run verify:macos /path/to/open-grind-v<tag>-macos-arm64.zip
```

It exits non-zero and prints the differing files when they do not match.

## Credential storage

Open Grind keeps the session, device identity, and media signing key in the platform's own credential store: Keychain on iOS, Keystore on Android, Credential Manager on Windows, and the Secret Service (GNOME Keyring, KWallet, etc) over D-Bus on Linux.

Two targets fall back to a file store: `credentials/` in the app data directory, each file `0600` inside a `0700` directory.

- macOS, by default. Keychain entries are tied to the code-signing identity, so an unsigned build cannot read back what an earlier build wrote, which breaks local development ([`ac38b2c`](https://git.opengrind.org/open-grind/open-grind/commit/ac38b2c)).
- Linux, only when no Secret Service is reachable, such as a headless box with no D-Bus session bus.

> [!IMPORTANT]
> A macOS build that is distributed must be code-signed and built with the `keychain` feature, which swaps the file store for the Keychain. [`bun run package:macos`](#build-and-package) does both.

## Trusting the build environment

Before running any build or verification steps, you are trusting several components. This section explains what each is, where it comes from, and how to independently verify it.

### Verifying Nix and flake.lock

[flake.lock](./flake.lock) pins every flake input to an exact content hash: JDK, Android SDK, NDK, Rust, Bun, Node.js.

1. Confirm the nixpkgs revision in flake.lock resolves to a commit on the official NixOS/nixpkgs repository:

```bash
grep -A3 '"nixpkgs"' flake.lock # note the "rev" value
# verify it exists at https://github.com/NixOS/nixpkgs/commit/<rev>
```

2. Also read [flake.nix](./flake.nix) itself to verify build steps

### Verifying the Gradle wrapper jar

The wrapper jar at `src-tauri/gen/android/gradle/wrapper/gradle-wrapper.jar` is committed and pinned to Gradle 8.14.5.

```bash
shasum -a 256 src-tauri/gen/android/gradle/wrapper/gradle-wrapper.jar
```

Compare against [Gradle's published checksums](https://gradle.org/release-checksums/) for 8.14.5 (`7d3a4ac4de1c32b59bc6a4eb8ecb8e612ccd0cf1ae1e99f66902da64df296172`).

## Reproducible CI release

See [ci/](./ci/).

## Reproducibility

Every input that affects the output bytes is pinned in exactly one place:

| Component                               | Where it's pinned                                                |
| --------------------------------------- | ---------------------------------------------------------------- |
| Docker base image (Docker build path)   | `Dockerfile` (`nixos/nix` pinned by `@sha256`)                   |
| nixpkgs                                 | `flake.lock`                                                     |
| Rust toolchain                          | `rust-toolchain.toml`                                            |
| macOS C toolchain (clang, cc, ld)       | `flake.lock` (nixpkgs clang wrapper, only inside `nix develop`)  |
| JDK                                     | `flake.nix` (`jdk21_headless`)                                   |
| Android compileSdk / minSdk / targetSdk | `src-tauri/gen/android/gradle.properties`                        |
| Android build-tools                     | `src-tauri/gen/android/gradle.properties`                        |
| Android NDK                             | `src-tauri/gen/android/gradle.properties`                        |
| Android CMake                           | `src-tauri/gen/android/gradle.properties`                        |
| Android Gradle Plugin                   | `src-tauri/gen/android/build.gradle.kts`                         |
| Gradle distribution                     | `src-tauri/gen/android/gradle/wrapper/gradle-wrapper.properties` |
| Kotlin                                  | `src-tauri/gen/android/build.gradle.kts`                         |
| Bun                                     | nixpkgs pin (via `flake.lock`)                                   |
| Node.js (runs `vite build`)             | nixpkgs pin (via `flake.lock`)                                   |
| Tauri CLI                               | `package.json` / `bun.lock`                                      |
| JS deps                                 | `bun.lock`                                                       |
| Cargo deps                              | `src-tauri/Cargo.lock`                                           |
| Dependency patches                      | [patches/](./patches), [src-tauri/patches/](./src-tauri/patches) |

The `opengrind.android.*` keys in `gradle.properties` are read by both Gradle and `flake.nix`. Bump them there once and both consumers pick up the new value.

`codesign`, `ditto` and `plutil` come from macOS itself and cannot be pinned by Nix. None of them affect the compiled code: `ditto` only packs the archive, and the signature is removed on both sides by [`verify:macos`](#verifying-a-published-macos-release) before comparing.

### Refreshing the lock

```bash
nix flake update
```

### Cargo / JS hygiene

`src-tauri/Cargo.lock` and `bun.lock` are reproducibility pins. Use lockfile-respecting commands for day-to-day work:

```bash
cargo build
bun ci
```

Never run `cargo update` or `bun update` without intentionally bumping dependencies and reviewing the diff.
