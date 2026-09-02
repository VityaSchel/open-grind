# Open Grind Reproducibility

Reproducibility verifies that a released artifact was built from a given source code snapshot. This is stronger than a simple artifact signature check, because it means you trust the code rather than whoever built it. Reproducibility verification requires [building](./BUILDING.md) the artifact in a deterministic way with pinned toolchain on a canonical OS and CPU arch. This means, you must pull ~30 GB of environment, allocate ~12 GB of RAM and run the build which takes up to 4 hours. If you trust Open Grind developers, simply [verify the signature](./BUILDING.md#verify-minisign-signature) instead.

The Linux, Windows and macOS recipes need a checkout with submodules — `git clone --recurse-submodules https://git.opengrind.org/open-grind/open-grind.git`, or `git submodule update --init` after switching tags. `src-tauri/vendor/grindr-google-oauth-webextension` is compiled into the desktop binaries; without it the build fails in `include_str!`.

- [Open Grind Reproducibility](#open-grind-reproducibility)
    - [Trusting the build environment](#trusting-the-build-environment)
        - [Verifying Nix and flake.lock](#verifying-nix-and-flakelock)
        - [Verifying the Gradle wrapper jar](#verifying-the-gradle-wrapper-jar)
    - [Pinned inputs](#pinned-inputs)
    - [Android](#android)
    - [Linux](#linux)
    - [Windows](#windows)
    - [macOS](#macos)

## Trusting the build environment

Before running any build or verification steps, you are trusting several components. This section explains what each is, where it comes from, and how to independently verify it.

### Verifying Nix and flake.lock

[flake.lock](./flake.lock) pins every flake input to an exact content hash: JDK, Android SDK, NDK, Rust, Bun, Node.js. Read it to verify build steps. Then confirm the nixpkgs revision in flake.lock resolves to a commit on the official NixOS/nixpkgs repository:

```bash
grep -A3 '"nixpkgs"' flake.lock # note the "rev" value
# -> "rev": "da5ad661ba4e5ef59ba743f0d112cbc30e474f32",
# Verify it exists at https://github.com/NixOS/nixpkgs/commit/da5ad661ba4e5ef59ba743f0d112cbc30e474f32
```

### Verifying the Gradle wrapper jar

The wrapper jar at `src-tauri/gen/android/gradle/wrapper/gradle-wrapper.jar` is committed and pinned to Gradle 8.14.5.

```bash
shasum -a 256 src-tauri/gen/android/gradle/wrapper/gradle-wrapper.jar
# -> 7d3a4ac4de1c32b59bc6a4eb8ecb8e612ccd0cf1ae1e99f66902da64df296172
# Compare against Gradle's published checksums at https://gradle.org/release-checksums/#8.14.5
```

## Pinned inputs

Every input that affects the output bytes is pinned in exactly one place:

| Component                             | Where it's pinned                                                |
| ------------------------------------- | ---------------------------------------------------------------- |
| Docker base image (Docker build path) | `Dockerfile` (`nixos/nix` pinned by `@sha256`)                   |
| nixpkgs                               | `flake.lock`                                                     |
| Rust toolchain                        | `rust-toolchain.toml`                                            |
| Bun                                   | nixpkgs pin (via `flake.lock`)                                   |
| Node.js (runs `vite build`)           | nixpkgs pin (via `flake.lock`)                                   |
| Tauri CLI                             | `package.json` / `bun.lock`                                      |
| JS deps                               | `bun.lock`                                                       |
| Cargo deps                            | `src-tauri/Cargo.lock`                                           |
| Dependency patches                    | [patches/](./patches), [src-tauri/patches/](./src-tauri/patches) |

## Android

- **Canonical builder:** Linux x86_64; `nix run .#build-android`
- **Official releases:** multiple providers in `build.yml` CI and F-Droid
- Cross-compilation table **for Android builds**:

    |            | On x86_64   | On arm64                 |
    | ---------- | ----------- | ------------------------ |
    | On Linux   | _Canonical_ | Not buildable[^1]        |
    | On macOS   | Untested    | **NOT reproducible[^2]** |
    | On Windows | Untested    | Untested                 |

- Pinned inputs:

    | Component                               | Where it's pinned                                                |
    | --------------------------------------- | ---------------------------------------------------------------- |
    | JDK                                     | `flake.nix` (`jdk21_headless`)                                   |
    | Android compileSdk / minSdk / targetSdk | `src-tauri/gen/android/gradle.properties`                        |
    | Android build-tools                     | `src-tauri/gen/android/gradle.properties`                        |
    | Android NDK                             | `src-tauri/gen/android/gradle.properties`                        |
    | Android CMake                           | `src-tauri/gen/android/gradle.properties`                        |
    | Android Gradle Plugin                   | `src-tauri/gen/android/build.gradle.kts`                         |
    | Gradle distribution                     | `src-tauri/gen/android/gradle/wrapper/gradle-wrapper.properties` |
    | Kotlin                                  | `src-tauri/gen/android/build.gradle.kts`                         |

The `opengrind.android.*` keys in `gradle.properties` are read by both Gradle and `flake.nix`. Bump them there once and both consumers pick up the new value.

v1 (JAR) signatures (`META-INF/*.SF`, `*.{RSA,EC,DSA}`, `MANIFEST.MF`) and v2/v3 signing block (last zip entry and the central directory) are not reproducible. [apksigcopier](https://github.com/obfusk/apksigcopier) copies the v1 files (`META-INF/MANIFEST.MF`, `*.SF`, `*.{RSA,EC,DSA}`) and the v2/v3 signing block from the published APK onto the freshly built unsigned one. Everything else (dex, native libs, resources, manifest, assets) is byte-identical between a signed and an unsigned build of the same source on the same toolchain.

Needs `apksigcopier` and `apksigner`, both on `PATH` in `nix develop .#android`.

```bash
# 1. Reproduce the unsigned APK locally
git checkout v<tag>
nix run .#build-android
LOCAL="$(find src-tauri/gen/android/app/build/outputs/apk/universal/release -name '*-unsigned.apk')"

# 2. Fetch from https://git.opengrind.org/open-grind/open-grind/releases
PUBLISHED=/path/to/open-grind-v<tag>-android.apk
RELEASE_CERT=2805fdd8f0badb9424d3244c5e5b3473cef5b8798ec1117382e89eda45c3658c # KEYS.md

# 3. Confirm the content reproduces
SIGCOPIED="$(mktemp -d)/$(basename "$PUBLISHED")"
trap 'rm -rf "$(dirname "$SIGCOPIED")"' EXIT

if [ -s "$LOCAL" ] && [ -s "$PUBLISHED" ] &&
  apksigcopier copy "$PUBLISHED" "$LOCAL" "$SIGCOPIED" &&
  cmp "$SIGCOPIED" "$PUBLISHED" &&
  apksigner verify --print-certs "$PUBLISHED" | grep -qi "$RELEASE_CERT"; then
  echo "✓ the published APK is this build, signed with the release key"
else
  echo "✗ APK does not reproduce, or is not signed with the release key" >&2
  exit 1
fi
```

[^1]: Google publishes `aapt2` only for `linux` (x86-64)

[^2]: Different host toolchains, even within Nix environment. Builds are only reproducible with full Docker amd64 emulation.

## Linux

- **Canonical builder:** x86_64 Linux for x86_64 builds, arm64 Linux for arm64 builds; Debian 12 container; Docker/Podman
- **Official releases:** Multiple providers in `build.yml`, [ci/linux](ci/linux)
- Cross-compilation table **for Linux x86_64 builds**:

    |            | On x86_64   | On arm64                 |
    | ---------- | ----------- | ------------------------ |
    | On Linux   | _Canonical_ | Untested                 |
    | On macOS   | Untested    | **NOT reproducible[^3]** |
    | On Windows | Untested    | Untested                 |

- Cross-compilation table **for Linux arm64 builds**:

    |            | On x86_64 | On arm64             |
    | ---------- | --------- | -------------------- |
    | On Linux   | Untested  | _Canonical_          |
    | On macOS   | Untested  | **Reproducible[^4]** |
    | On Windows | Untested  | Untested             |

```bash
# 1. Reproduce the app locally
git checkout v<tag>
podman build -t open-grind-linux ci/linux
podman run --rm -v "$PWD:/work" open-grind-linux sh ci/linux/build.sh

# 2. Fetch both into one directory from https://git.opengrind.org/open-grind/open-grind/releases
PUBLISHED=/path/to/published

# 3. Confirm the content reproduces
for LOCAL in \
  src-tauri/target/release/bundle/deb/*.deb \
  src-tauri/target/release/bundle/appimage/*.AppImage
do
  name="$(basename "$LOCAL")"
  sha256sum "$LOCAL" "$PUBLISHED/$name"
  if cmp -s "$LOCAL" "$PUBLISHED/$name"; then
    echo "✓ $name matches"
  else
    echo "✗ $name mismatch, local build does not match the published artifact" >&2
    exit 1
  fi
done
```

[^3]: Different host toolchains, even within Nix environment. Builds are only reproducible with full Docker amd64 emulation.

[^4]: `Installed-Size` differs because tauri-bundler sums directory `len()` values, which are filesystem-specific (ext4 4096 vs APFS-backed virtiofs). Recomputing it from file sizes + 1 KiB per directory in `ci/linux/build.sh` makes both hosts produce the identical .deb.

## Windows

- **Canonical builder:** x86_64 Linux for both architectures, `nix run .#build-windows-x64` / `.#build-windows-arm64`
- **Official releases:** Multiple providers in `build.yml`
- Cross-compilation table **for Windows x86_64 builds**:

    |            | On x86_64   | On arm64                 |
    | ---------- | ----------- | ------------------------ |
    | On Linux   | _Canonical_ | Untested                 |
    | On macOS   | Untested    | **NOT reproducible[^5]** |
    | On Windows | Untested    | Untested                 |

- Cross-compilation table **for Windows arm64 builds**:

    |            | On x86_64   | On arm64                 |
    | ---------- | ----------- | ------------------------ |
    | On Linux   | _Canonical_ | Untested                 |
    | On macOS   | Untested    | **NOT reproducible[^6]** |
    | On Windows | Untested    | Untested                 |

- Pinned inputs:

    | Component                          | Where it's pinned                                            |
    | ---------------------------------- | ------------------------------------------------------------ |
    | MSVC CRT and Windows SDK (Windows) | `XWIN_CRT_VERSION` / `XWIN_SDK_VERSION` in `nix/windows.nix` |

The NSIS installer ships unsigned next to a detached `.minisig`, so nothing inside it varies between builds and the whole file must match byte for byte. Build the one architecture you are verifying: `nix run` leaves tauri's own file name, and only CI renames it to the released asset name.

```bash
# 1. Reproduce the app locally
git checkout v<tag>

# x86_64:
nix run .#build-windows-x64
LOCAL="$(find src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis -name '*.exe')"

# arm64:
nix run .#build-windows-arm64
LOCAL="$(find src-tauri/target/aarch64-pc-windows-msvc/release/bundle/nsis -name '*.exe')"

# 2. Fetch from https://git.opengrind.org/open-grind/open-grind/releases
PUBLISHED=/path/to/open-grind-v<tag>-windows-<arch>.exe

# 3. Confirm the content reproduces
sha256sum "$LOCAL" "$PUBLISHED"

if cmp -s "$LOCAL" "$PUBLISHED"; then
  echo "✓ installer matches"
else
  echo "✗ installer mismatch, local build does not match the published installer" >&2
  exit 1
fi
```

[^5]: Different host toolchains, even within Nix environment. Builds are only reproducible with full Docker amd64 emulation.

[^6]: exe differs in `.text` (+1220 B on the Mac) and `.rdata` (−1840 B) with everything else matching; not fixable by us.

## macOS

- **Canonical builder:** macOS on Apple Silicon
- **Official releases:** Built locally, not attested
- Cross-compilation table **for macOS builds**:

    |          | On x86_64 | on arm64    |
    | -------- | --------- | ----------- |
    | On macOS | Untested  | _Canonical_ |

- Pinned inputs:

    | Component                         | Where it's pinned                                          |
    | --------------------------------- | ---------------------------------------------------------- |
    | macOS C toolchain (clang, cc, ld) | `flake.lock` (nixpkgs clang wrapper)                       |
    | macOS SDK                         | `flake.lock` (nixpkgs `apple-sdk`, exported as `SDKROOT`)  |
    | `plutil` (Info.plist)             | `flake.lock` (nixpkgs `xcbuild`)                           |
    | Checkout path and `CARGO_HOME`    | remapped to `/open-grind` and `/cargo` by `nix/common.nix` |

`codesign` and `ditto` come from macOS itself and cannot be pinned by Nix. Neither affects the compiled code: `ditto` only packs the archive, and the signature is removed from both sides before comparing.

A signature cannot be reproduced without its key, and removing one does not restore the pre-signing bytes, so both sides are brought to the same state instead: re-sign ad-hoc, remove that signature, delete the signature directory. That normalization is signing identity-independent. Stripping also hides the hardened runtime and the entitlements, so step 3 checks those first.

```bash
# 1. Reproduce the app locally
git checkout v<tag>
nix run .#build-macos
LOCAL="src-tauri/target/universal-apple-darwin/release/bundle/macos/Open Grind.app"

# 2. Fetch from https://git.opengrind.org/open-grind/open-grind/releases
PUBLISHED=/path/to/open-grind-v<tag>-macos.zip
WORK=$(mktemp -d)
ditto -x -k "$PUBLISHED" "$WORK/published"
APP="$(find "$WORK/published" -maxdepth 1 -name '*.app')"

# 3. Confirm the published app is hardened as released
if codesign -dvvv "$APP" 2>&1 | grep -q 'flags=.*runtime' &&
  ! codesign -d --entitlements - --xml "$APP" 2>/dev/null | grep -q get-task-allow; then
  echo "✓ hardened runtime on, no debug entitlement"
else
  echo "✗ published app is not hardened as released, do not run it" >&2
  exit 1
fi

# 4. Confirm the content reproduces
app_content_hash() {
  copy="$(mktemp -d)/app"
  ditto "$1" "$copy"
  codesign --force --deep --sign - "$copy" >/dev/null 2>&1
  codesign --remove-signature "$copy" >/dev/null 2>&1
  rm -rf "$copy/Contents/_CodeSignature" "$copy/Contents/CodeResources"
  find "$copy" \! -type d | sort | while IFS= read -r entry; do
    printf '%s  %s\n' \
      "$(shasum -a 256 "$entry" | cut -c1-64)" \
      "${entry#"$copy"}"
  done
}

if diff <(app_content_hash "$LOCAL") <(app_content_hash "$APP"); then
  echo "✓ app hash checksum matches"
else
  echo "✗ app hash checksum mismatch, local build does not match the published app" >&2
  exit 1
fi
```
