# Reproducibility

- [Reproducibility](#reproducibility)
    - [Verifying a published release](#verifying-a-published-release)
    - [Canonical builders](#canonical-builders)
    - [Trusting the build environment](#trusting-the-build-environment)
        - [Verifying Nix and flake.lock](#verifying-nix-and-flakelock)
        - [Verifying the Gradle wrapper jar](#verifying-the-gradle-wrapper-jar)
    - [Pinned inputs](#pinned-inputs)
        - [Refreshing the lock](#refreshing-the-lock)
        - [Cargo / JS hygiene](#cargo--js-hygiene)

## Verifying a published release

Every release asset has a detached [minisign](https://jedisct1.github.io/minisign/) signature made with the key in [KEYS.md](./KEYS.md). Anyone can rebuild the tagged commit and compare it with what was published.

| Platform | Recipe                                                             |
| -------- | ------------------------------------------------------------------ |
| Android  | [BUILDING.md](./BUILDING.md#verifying-a-published-android-release) |
| macOS    | [BUILDING.md](./BUILDING.md#verifying-a-published-macos-release)   |
| Linux    | [BUILDING.md](./BUILDING.md#verifying-a-published-linux-release)   |
| Windows  | [BUILDING.md](./BUILDING.md#verifying-a-published-windows-release) |

## Canonical builders

A release artifact only counts as reproduced when it was built where the release was built.

| Platform | Canonical builder                           | Toolchain                                    | Official infrastructure                    |
| -------- | ------------------------------------------- | -------------------------------------------- | ------------------------------------------ |
| Android  | x86_64 Linux                                | `nix run .#build-android`                    | Multiple providers in `build.yml`, F-Droid |
| Linux    | x86_64 Linux                                | Debian 12 container, [ci/linux/](./ci/linux) | Multiple providers in `build.yml`          |
| macOS    | Apple Silicon Mac, `nix develop .#macos`    | `bun run package:macos`                      | A single Mac builder, not attested         |
| Windows  | x86_64 Linux, `nix run .#build-windows-x64` | cargo-xwin, lld-link, NSIS                   | Multiple providers in `build.yml`          |

The CI side is described in [ci/README.md](./ci/README.md).

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

## Pinned inputs

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

`codesign`, `ditto` and `plutil` come from macOS itself and cannot be pinned by Nix. None of them affect the compiled code: `ditto` only packs the archive, and the signature is removed on both sides by [`verify:macos`](./BUILDING.md#verifying-a-published-macos-release) before comparing.

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
