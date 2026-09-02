# CI

Self-hosted Forgejo runners on rented ephemeral VMs.

## Workflows

| Workflow     | Trigger              | Description                                                                                                                                         |
| ------------ | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `build.yml`  | manual               | Builds the universal Android APK, the x86_64 and arm64 Linux deb and AppImage and Windows installers on several providers, verifies reproducibility |
| `check.yml`  | pull request         | Lint, format, types, unit, Rust and end-to-end tests, plus the version and backup-rules invariants                                                  |
| `fdroid.yml` | manual               | Rebuilds the APK the way F-Droid's buildserver does ([fdroid/](./fdroid))                                                                           |
| `audit.yml`  | weekly, pull request | `cargo deny` and `bun audit`                                                                                                                        |
| `keys.yml`   | push                 | Checks the published keys against `KEYS.md` (`verify-keys.ts`)                                                                                      |
| `warm.yml`   | push                 | Keeps the check workflow caches warm                                                                                                                |

## Scripts

| Script                     | Used by                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| `setup-build.sh`           | Build boxes, `podman` or `nix`; a job installs only what it runs                         |
| `check-release-version.sh` | Refuse to build a `-dev` version unless the run allows it                                |
| `linux/build.sh`           | Build, repack and name the `.deb`, then assemble the `.AppImage`, inside the Linux image |
| `windows/build.sh`         | Cross-build and name one installer, `x64` or `arm64`                                     |
| `verify.ts`                | Every artifact, one copy per box in `BOXES`/`ARM_BOXES`; either may be empty             |
| `sign.ts`                  | Sign. APK: apksigner and minisign; the rest: minisign                                    |
| `cache.ts`, `rust-env.sh`  | Check runner caches                                                                      |
| `check-image.sh`           | The check runner image                                                                   |
