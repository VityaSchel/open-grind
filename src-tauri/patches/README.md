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

## tauri-codegen

Embedded assets and CSP hashes are emitted in hash-map and `readdir` order. The patch sorts both.

**Delete when `tauri-codegen > 2.6.3` publishes** — [tauri#15777](https://github.com/tauri-apps/tauri/pull/15777) is merged and supersedes it.
