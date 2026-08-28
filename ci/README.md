# CI

Self-hosted Forgejo runners on rented ephemeral VMs. Release builds run the same commit on several providers and are published only when every provider produced the same bytes.

## Workflows

| Workflow     | Trigger              | Description                                                                                                                                                                                                                                                                                         |
| ------------ | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `build.yml`  | manual               | Builds the Android APK (`nix run .#build-android`), the x86_64 and arm64 Linux `.deb` ([linux/](./linux)) and each Windows installer ([windows/](./windows)) on several providers, compares the results (`verify.ts`). One job per artifact; the dispatch picks which artifacts and which providers |
| `check.yml`  | pull request         | Lint, format, types, unit, Rust and end-to-end tests, plus the version and backup-rules invariants                                                                                                                                                                                                  |
| `fdroid.yml` | manual               | Rebuilds the APK the way F-Droid's buildserver does ([fdroid/](./fdroid))                                                                                                                                                                                                                           |
| `audit.yml`  | weekly, pull request | `cargo deny` and `bun audit`                                                                                                                                                                                                                                                                        |
| `keys.yml`   | push                 | Checks the published keys against `KEYS.md` (`verify-keys.ts`)                                                                                                                                                                                                                                      |
| `warm.yml`   | push                 | Keeps the check workflow caches warm                                                                                                                                                                                                                                                                |

## Scripts

| Script                     | Used by                                                                      |
| -------------------------- | ---------------------------------------------------------------------------- |
| `setup-build.sh`           | Build boxes. Android and Windows: Nix; Linux: Podman                         |
| `check-release-version.sh` | Refuse to build a `-dev` version unless the run allows it                    |
| `linux/build.sh`           | Build, repack and name the `.deb` inside the Linux image                     |
| `windows/build.sh`         | Cross-build and name one installer, `x64` or `arm64`                         |
| `verify.ts`                | Every artifact, one copy per box in `BOXES`/`ARM_BOXES`; either may be empty |
| `sign.ts`                  | Sign. APK: apksigner and minisign; the rest: minisign                        |
| `cache.ts`, `rust-env.sh`  | Check runner caches                                                          |
| `check-image.sh`           | The check runner image                                                       |
