---
prev: false
next: false
title: 'Download Open Grind'
titleTemplate: ':title — free & open source Grindr client'
---

<script setup>
    import { VPButton } from 'vitepress/theme';
</script>

# Download Open Grind

Never download Open Grind from unofficial sources. The only official source of Open Grind releases is https://git.opengrind.org/open-grind/open-grind/releases. All releases are signed and reproducible.

> [!Warning] 🚧&nbsp;&nbsp;Open Grind is in active development.&nbsp;&nbsp;🚧
> [Contribute to the project](https://git.opengrind.org/open-grind/open-grind/) or [join the discussion](https://matrix.to/#/#opengrind:opengrind.org) to help us prioritize features and improvements.

## Android

<div class="vpbuttons-row">
    <VPButton href="https://git.opengrind.org/open-grind/open-grind/releases/download/v0.1.0-beta.4.1/open-grind-v0.1.0-beta.4.1-android.apk" size="medium">Download for Android (apk)</VPButton>
</div>

Install using your system's APK installer. Optionally, enable auto updates.

## Windows

<div class="vpbuttons-row">
    <VPButton href="https://git.opengrind.org/open-grind/open-grind/releases/download/v0.1.0-beta.4.1/open-grind-v0.1.0-beta.4.1-windows-x86_64.exe" size="medium">Download for Windows x86_64</VPButton>
    <VPButton href="https://git.opengrind.org/open-grind/open-grind/releases/download/v0.1.0-beta.4.1/open-grind-v0.1.0-beta.4.1-windows-arm64.exe" size="medium">Download for Windows arm64</VPButton>
</div>

Launch the installer and follow the steps. Optionally, enable auto updates. To uninstall, use the bundled uninstall.exe. Check "delete app data" to delete the session and preferences.

## Linux

For Linux distributions that aren't supported, please [build manually](https://git.opengrind.org/open-grind/open-grind/src/branch/main/BUILDING.md). Open Grind does not ship an AppImage yet, for two reasons: Tauri's AppImage bundler uses tooling from rolling versions at build time, so the result is not reproducible, and the bundle it produces fails to start on systems with Mesa 25 or newer, which includes current Arch and Fedora ([tauri#15665](https://github.com/tauri-apps/tauri/issues/15665)).

### deb (Debian, Ubuntu, Linux Mint, other Debian-based)

<div class="vpbuttons-row">
    <VPButton href="https://git.opengrind.org/open-grind/open-grind/releases/download/v0.1.0-beta.4.1/open-grind-v0.1.0-beta.4.1-linux-x86_64.deb" size="medium">Download for Debian/Ubuntu x86_64 (deb)</VPButton>
    <VPButton href="https://git.opengrind.org/open-grind/open-grind/releases/download/v0.1.0-beta.4.1/open-grind-v0.1.0-beta.4.1-linux-arm64.deb" size="medium">Download for Debian/Ubuntu arm64 (deb)</VPButton>
</div>

deb releases do not have in-app auto-updater.

To uninstall, manually clear all secrets from your Secret Service, then run `apt purge`.

#### Track updates with apt

Debian, Ubuntu and derivatives can install Open Grind from the project's own repository, so `apt` handles updates:

```sh
sudo install -d -m 0755 /etc/apt/keyrings
curl -fsSL https://git.opengrind.org/api/packages/open-grind/debian/repository.key \
	| sudo tee /etc/apt/keyrings/opengrind.asc > /dev/null
sudo tee /etc/apt/sources.list.d/opengrind.sources > /dev/null <<'EOF'
Types: deb
URIs: https://git.opengrind.org/api/packages/open-grind/debian
Suites: beta
Components: main
Signed-By: /etc/apt/keyrings/opengrind.asc
EOF
sudo apt update && sudo apt install open-grind
```

Open Grind is still in beta, so every release so far is published to the `beta` suite. Once stable, use `Suites: stable` to track those instead. To remove the repository, delete both files.

> [!Note] Trust
> The repository index is signed by a key held on the server. The release artifacts and their `.minisig` signatures stay the canonical, reproducible download — the repository only exists so updates arrive through your package manager.

### Arch Linux

As of September 1st, 2026, AUR has disabled account registration and new package publishing, so it's not possible to install Open Grind from AUR right now.

The PKGBUILD for Arch Linux can be found in [ci/aur/PKGBUILD](https://git.opengrind.org/open-grind/open-grind/src/branch/main/ci/aur/PKGBUILD).

## macOS

<div class="vpbuttons-row">
    <VPButton href="https://git.opengrind.org/open-grind/open-grind/releases/download/v0.1.0-beta.4.1/open-grind-v0.1.0-beta.4.1-macos.zip" size="medium">Download for macOS (universal)</VPButton>
</div>

Extract Open&nbsp;Grind.app from zip archive and move to Applications folder. To uninstall, move the app from Applications to Trash.

::: info If you get "Apple could not verify “Open Grind” is free of malware that may harm your Mac or compromise your privacy.",

1. Open System Settings
2. Go to "Privacy & Security"
3. Scroll to "“Open Grind” was blocked to protect your Mac."

![System Settings](assets/guides/download/macos-quarantine-system-settings.png)

4. Click "Open Anyway"
5. In the "Open “Open Grind”?" dialog click "Open Anyway"
6. Enter administrator password or Touch ID
:::


## iOS

**iOS is currently not supported.** Open Grind iOS builds are likely to be released in Fall 2026 with the upcoming publishing in the third party app stores.

