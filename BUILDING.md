# Build Open Grind

Pick your platform, then a method within it. Everything below the platform sections applies to both.

- [Build Open Grind](#build-open-grind)
    - [Android](#android)
        - [Build apk with Nix in Docker (easiest)](#build-apk-with-nix-in-docker-easiest)
        - [Build apk with Nix only (faster)](#build-apk-with-nix-only-faster)
        - [Build apk manually (advanced)](#build-apk-manually-advanced)
        - [Sign Android build](#sign-android-build)
        - [Verify Android release](#verify-android-release)
    - [Linux](#linux)
        - [Build Linux deb](#build-linux-deb)
        - [Sign Linux build](#sign-linux-build)
        - [Verify Linux release](#verify-linux-release)
    - [Windows](#windows)
        - [Build Windows installer](#build-windows-installer)
        - [Sign Windows build](#sign-windows-build)
        - [Verify Windows release](#verify-windows-release)
    - [macOS](#macos)
        - [Build macOS app](#build-macos-app)
        - [Sign and notarize macOS build](#sign-and-notarize-macos-build)
        - [Verify macOS release](#verify-macos-release)
    - [Credential storage](#credential-storage)
    - [Reproducibility](#reproducibility)
    - [Verify minisign signature](#verify-minisign-signature)

## Android

### Build apk with Nix in Docker (easiest)

This method does not require installing Nix to your machine, but requires more disk space. It essentially automates [native Nix build method](#build-apk-with-nix-only-faster) for you with zero setup needed.

> [!IMPORTANT]
> **The image is pinned to `linux/amd64`.** The Android NDK ships only an x86_64 host cross-compiler — also the canonical reproducible target — so the build always runs in an `x86_64-linux` environment.
>
> **Apple Silicon:** On Apple Silicon (arm64) macOS it runs under Docker Desktop's amd64 emulation. The universal (4-ABI) release build OOMs at Docker Desktop's default ~8 GB, so raise the memory limit to **at least 12 GB** (Settings &rarr; Resources &rarr; Memory) before building. Keep in mind, the Docker build on macOS will take about 3-4 hours on M1 Pro. Start with building a single ABI with `-e OPEN_GRIND_ANDROID_ABI=aarch64` to test if your Mac has enough resources. Apple Silicon Docker build reproduces the canonical release, a native `nix run .#build-android` on `aarch64-darwin` does not (different host toolchain).

Prerequisites:

- [Docker](https://docs.docker.com/get-started/get-docker/) with Compose installed
- ~30 GB of free disk space (the ~12 GB toolchain plus build caches; the first run needs ~15 GB transient)
- \>= 12 GB of RAM allocated to Docker

1. Install Docker on your host system
2. Build the thin image: `docker compose build`
3. Build the apk: `docker compose run --rm build`
4. Retrieve the apk from `src-tauri/gen/android/app/build/outputs/apk/universal/release/open-grind-v<version>-android-unsigned.apk` on your host system
5. Follow [Sign Android build](#sign-android-build) steps to make the build installable on your Android device

To clean-up Docker after that:

```bash
docker compose down -v   # removes the toolchain + all cache volumes (~25 GB)
docker image rm open-grind-build   # removes the thin image
```

### Build apk with Nix only (faster)

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

### Build apk manually (advanced)

If you already have an Android toolchain (e.g. via Android Studio) and Rust installed, you can build against those directly. This reuses what is already on your machine instead of downloading the pinned ~12 GB toolchain, so it saves a lot of disk, but the artifact is not reproducible.

Prerequisites:

- **Rust** via [rustup](https://rustup.rs) — [rust-toolchain.toml](./rust-toolchain.toml) pins 1.95.0 and lists the Android targets, which rustup installs automatically the first time you build in the repo
- **JDK 21** (e.g. [Temurin](https://adoptium.net), or Android Studio's bundled JDK) — 17+ will likely build but won't match a release
- **Android SDK** via Android Studio's SDK Manager (or the command-line `sdkmanager`): SDK Platform 36, Build-Tools 35.0.0, NDK 29.0.14206865, CMake 3.22.1
- **[Bun](https://bun.sh)**

1. Point Tauri at your SDK / NDK / JDK:

```bash
export JAVA_HOME="$(/usr/libexec/java_home -v 21)" # or your JDK 21 path
export ANDROID_HOME="$HOME/Android/sdk" # or your Android SDK path
export NDK_HOME="$ANDROID_HOME/ndk/29.0.14206865"
```

2. Build:

```bash
bun install
bun run tauri android build --apk
```

3. Retrieve the apk from `src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk` on your host system
4. Follow [Sign Android build](#sign-android-build) to make the build installable on your Android device

### Sign Android build

You need to follow these instructions in order to install the APK on an Android device, otherwise attempts to install it will throw "App not installed as package appears to be invalid." error. Not required for reproducibility verification. Never commit or otherwise publish anything about your keystore.

1. Create a JKS once:

```bash
keytool -genkey -v \
  -keystore ~/.config/open-grind/release.jks \
  -alias open-grind \
  -keyalg EC \
  -groupname secp256r1 \
  -sigalg SHA256withECDSA \
  -validity 20000
```

2. Create keystore.properties:

```bash
cp /path/to/open-grind/contrib/keystore.properties.example ~/.config/open-grind/keystore.properties
# Edit ~/.config/open-grind/keystore.properties, note the password
```

3. Sign the apk:

```bash
OPEN_GRIND_KEYSTORE_PROPERTIES=~/.config/open-grind/keystore.properties
bun /path/to/open-grind/ci/sign.ts /path/to/open-grind.apk /out/path/to/open-grind-signed.apk
```

### Verify Android release

- [Verify minisign signature](#verify-minisign-signature) to prove the APK was built by Open Grind developers
- [Reproduce the release](./REPRODUCIBILITY.md#android) to prove the APK was built from the open source code

## Linux

The release `.deb` is built in a pinned Debian 12 container ([ci/linux/](./ci/linux)) so the binary links against Debian 12's system libraries. The glibc floor is 2.34, which covers Debian 12+ and Ubuntu 22.04+. The Nix shell is for development only — its glibc is newer than any shipping distribution. `nix run .#build-linux` builds a `.deb` too, but against Nix's glibc, so it does not install on a normal distribution. Use the container for anything that leaves your machine.

Other Linux formats:

- `.rpm` — tauri-bundler passes the version through unsanitised and RPM's `Version` cannot contain `-`, so every prerelease is rejected; there is no `rpm.version` override
- AppImage — tauri-bundler downloads linuxdeploy and its plugins from unpinned branches at bundle time, and the default bundle breaks on Mesa 25+ ([tauri#15665](https://github.com/tauri-apps/tauri/issues/15665))
- Bundled codecs — The app uses the system WebKitGTK, which decodes through the system GStreamer; shipping codecs would only duplicate what `Recommends` already installs

### Build Linux deb

Needs Podman or Docker.

```bash
podman build -t open-grind-linux ci/linux
podman run --rm -v "$PWD:/work" open-grind-linux sh ci/linux/build.sh
```

The result is `src-tauri/target/release/bundle/deb/open-grind-v<version>-linux-<arch>.deb`. The script repacks what `tauri build` produced with `dpkg-deb` under `SOURCE_DATE_EPOCH`, because tauri-bundler writes wall-clock mtimes and unsorted entries ([tauri#13612](https://github.com/tauri-apps/tauri/issues/13612)).

Runtime notes:

- Video needs GStreamer: `gstreamer1.0-plugins-good` for MP4 and `gstreamer1.0-libav` for H.264, both declared as `Recommends`. Fedora strips patent-encumbered codecs from its own packages.
- Without a Secret Service (a headless box, or no D-Bus session) the login is kept in a plain file under the app data directory and the app says so on launch.
- Location is not available through the geolocation plugin on Linux. Set it from the command palette by geohash.

### Sign Linux build

Linux builds ship unsigned.

### Verify Linux release

- [Verify minisign signature](#verify-minisign-signature) to prove the .deb was built by Open Grind developers
- [Reproduce the release](./REPRODUCIBILITY.md#linux) to prove the .deb was built from the open source code

## Windows

Windows is cross-compiled from Linux with [cargo-xwin](https://github.com/rust-cross/cargo-xwin). Two clean Linux builds of one commit write a reproducible exe and NSIS installer.

### Build Windows installer

Nix runs the full `tauri build --bundles nsis`. On first use cargo-xwin downloads Microsoft's CRT and Windows SDK (about 1 GB) into `~/.cache/cargo-xwin`.

```bash
# x86_64:
nix develop .#windows-x64
cargo xwin check --manifest-path src-tauri/Cargo.toml --lib --target x86_64-pc-windows-msvc

# arm64:
nix develop .#windows-arm64
cargo xwin check --manifest-path src-tauri/Cargo.toml --lib --target aarch64-pc-windows-msvc
```

### Sign Windows build

Windows builds ship unsigned.

### Verify Windows release

- [Verify minisign signature](#verify-minisign-signature) to prove the .exe was built by Open Grind developers
- [Reproduce the release](./REPRODUCIBILITY.md#windows) to prove the .exe was built from the open source code

## macOS

A macOS build needs a Mac. Nix pins the toolchain and remaps the build paths the compilers would otherwise bake into the binary, so the release build runs through the flake.

### Build macOS app

```bash
nix run .#build-macos
```

This builds a universal app, signs it, and writes a reproducible zip to `src-tauri/target/release/artifacts/`. The build always enables the `keychain` feature, ad-hoc builds therefore cannot read back credentials an earlier build wrote. A release build refuses to run from anywhere but `/Applications` or `~/Applications`. Debug builds do not reproduce; the release profile is the default, `nix run .#build-macos -- --debug` to opt out.

### Sign and notarize macOS build

| Variable               | Default | Description                                                    |
| ---------------------- | ------- | -------------------------------------------------------------- |
| `MACOS_SIGN_IDENTITY`  | `-`     | `-` is ad-hoc                                                  |
| `MACOS_NOTARY_PROFILE` | unset   | `notarytool` keychain profile; when set, notarizes and staples |

`src-tauri/entitlements.plist` is passed to `codesign` when it exists.

For distribution, store the notary credentials once, then build:

```bash
xcrun notarytool store-credentials open-grind \
  --apple-id you@example.com --team-id TEAMID --password app-specific-password

MACOS_SIGN_IDENTITY="Developer ID Application: Name (TEAMID)" \
MACOS_NOTARY_PROFILE=open-grind \
  nix run .#build-macos
```

### Verify macOS release

- [Verify minisign signature](#verify-minisign-signature) to prove the .zip was built by Open Grind developers
- [Reproduce the release](./REPRODUCIBILITY.md#macos) to prove the .app was built from the open source code

## Credential storage

Open Grind keeps the session, device identity, and media signing key in the platform's own credential store: Keychain on iOS, Keystore on Android, Credential Manager on Windows, and the Secret Service (GNOME Keyring, KWallet, etc) over D-Bus on Linux.

Two targets fall back to a file store: `credentials/` in the app data directory, each file `0600` inside a `0700` directory.

- macOS, by default. Keychain entries are tied to the code-signing identity, so an unsigned build cannot read back what an earlier build wrote, which breaks local development ([`ac38b2c`](https://git.opengrind.org/open-grind/open-grind/commit/ac38b2c)).
- Linux, only when no Secret Service is reachable, such as a headless box with no D-Bus session bus.

> [!IMPORTANT]
> A macOS build that is distributed must be code-signed and built with the `keychain` feature, which swaps the file store for the Keychain. [`nix run .#build-macos`](#build-macos-app) does both.

## Reproducibility

What is pinned, which builds reproduce, and how CI proves it: [REPRODUCIBILITY.md](./REPRODUCIBILITY.md).

## Verify minisign signature

Published artifacts are signed with [minisign](https://jedisct1.github.io/minisign/) signature. You can confirm the key and its provenance in [KEYS.md](./KEYS.md).

[Install minisign](https://github.com/jedisct1/minisign#installation), then check the .minisig signature of downloaded artifact at `/path/to/file`:

```bash
PUBLISHED=/path/to/file

if minisign -Vm "$PUBLISHED" -P RWReleaseOpenGrindurRQcmR+NovOaU5IEU3LM5l6TcXJvOGYw2m4O+; then
  echo "✓ signature valid and verified"
else
  echo "✗ signature invalid, do not install this APK" >&2
  exit 1
fi
```
