# Dependency patches

Diffs against crates pulled from crates.io. Their sources are not committed.

`bun run patch-deps` downloads each `.crate`, checks it against the sha256 in [`scripts/patch-deps.ts`](../../scripts/patch-deps.ts), applies the diff, and writes `src-tauri/.patched/<name>`, which `[patch.crates-io]` points at and git ignores. It runs from `postinstall` and from `reproPreamble` in [`nix/common.nix`](../../nix/common.nix), which every release build and the F-Droid recipe use. Re-runs compare a stamp and skip the network.

Edit the tree and write the diff back with:

```sh
bun run patch-deps -- --diff http2
```

## http2

The HTTP/2 stack under `wreq`. Cloudflare sees every frame we send, so these hunks make them match okhttp.

| File                                      | Change                                                                                                                                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hpack/header.rs`                         | Index `authorization`, as `Hpack.Writer` does, instead of re-sending the whole session token per request. This keeps it in the dynamic table for the connection's lifetime (RFC 7541 §7.1). |
| `hpack/header.rs`                         | Emit pseudo-headers other than `:authority` unindexed. `:protocol` is excluded: `index_static` has no entry for it and `Table::index` asserts one exists.                                   |
| `hpack/encoder.rs`                        | Huffman-code a literal only when strictly shorter.                                                                                                                                          |
| `client.rs`                               | Flush after the initial SETTINGS so it lands in its own TLS record.                                                                                                                         |
| `proto/connection.rs`, `proto/go_away.rs` | Close without sending GOAWAY, both on idle pooled connections and after the peer's own.                                                                                                     |
| `proto/streams/recv.rs`                   | [RUSTSEC-2026-0258](https://rustsec.org/advisories/RUSTSEC-2026-0258): drop empty DATA frames that do not end the stream.                                                                   |
| `lib.rs`                                  | Allow `mismatched_lifetime_syntaxes`, since a path dependency gets no `--cap-lints allow`.                                                                                                  |

`http2` is a fork of `h2` under a different name, so advisories against `h2` never match it. **Re-check them by hand when bumping.**

The rest will not be upstreamed: the flush was [declined](https://github.com/0x676e67/http2/issues/68), and `mod hpack` is private, so the HPACK hunks are unreachable from a dependent crate.

## wry

On Android the custom-protocol handler runs while the process-global `REQUEST_HANDLER` mutex is held, and it blocks there for up to 30s waiting on the responder, so every media fetch and asset load is serialised.

| File                         | Change                                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `android/binding.rs`         | Clone the handler out of the map and drop the guard before calling it.                                                   |
| `android/mod.rs`             | Store it as `Arc<dyn Fn ... + Send + Sync>` so it can be cloned.                                                         |
| `lib.rs`, `wkwebview/mod.rs` | `Send + Sync` on `custom_protocols`, both `with_*_custom_protocol` bounds and `protocol_ptrs`, which the clone requires. |
| `Cargo.toml`                 | Allow warnings, since a path dependency gets no `--cap-lints allow`.                                                     |

Backport of [wry 0.56.0](https://github.com/tauri-apps/wry/releases/tag/wry-v0.56.0). **Delete when a `tauri-runtime-wry` requiring `wry >= 0.56` is published**.

## tauri-codegen

Embedded assets and CSP hashes are emitted in hash-map and `readdir` order. The patch sorts both.

**Delete when `tauri-codegen > 2.6.3` publishes** — [tauri#15777](https://github.com/tauri-apps/tauri/pull/15777) is merged and supersedes it.

## tauri-plugin-geolocation

`play-services-location` put four proprietary Play Services AARs into the APK, and the plugin returned no fix at all without Play Services.

| File                                   | Change                                                                                                                                         |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `android/build.gradle.kts`             | Drop the `play-services-location` dependency.                                                                                                  |
| `android/src/main/java/Geolocation.kt` | Reimplement on the platform `LocationManager` via `androidx.core.location`, which back-compats it to `minSdk` 28. GPS and network providers.   |
| `android/src/main/java/Geolocation.kt` | Fix `getLastLocation`, which kept the oldest fix within `maximumAge` instead of the freshest.                                                  |

Accuracy and time to first fix are worse where Play Services exists, since the platform API does no sensor fusion.

**Delete when upstream drops `play-services-location`.** [plugins-workspace#3377](https://github.com/tauri-apps/plugins-workspace/pull/3377) does not: it keeps the dependency and the GMS-first path, and needs API 31.
