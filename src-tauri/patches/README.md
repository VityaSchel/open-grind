# Dependency patches

Diffs against crates pulled from crates.io. Their sources are not committed.

`bun run patch-deps` downloads each `.crate`, checks it against the sha256 in [`scripts/patch-deps.ts`](../../scripts/patch-deps.ts), applies the diff, and writes `src-tauri/.patched/<name>`, which `[patch.crates-io]` points at and git ignores. It runs from `postinstall` and from `reproPreamble` in [`nix/common.nix`](../../nix/common.nix), which every release build and the F-Droid recipe use. Re-runs compare a stamp and skip the network.

Edit the tree and write the diff back with:

```sh
bun run patch-deps -- --diff tauri-codegen
```

## tauri-codegen

Embedded assets and CSP hashes are emitted in hash-map and `readdir` order. The patch sorts both.

**Delete when `tauri-codegen > 2.6.3` publishes** — [tauri#15777](https://github.com/tauri-apps/tauri/pull/15777) is merged and supersedes it.
