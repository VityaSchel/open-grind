# Dependency patches

Diffs against crates pulled from crates.io. Their sources are not committed.

`bun run patch-deps` downloads each `.crate`, checks it against the sha256 in [`scripts/patch-deps.ts`](../../scripts/patch-deps.ts), applies the diff, and writes `src-tauri/.patched/<name>`, which `[patch.crates-io]` points at and git ignores. It runs from `postinstall`, from `reproPreamble` in [`nix/common.nix`](../../nix/common.nix), which every release build uses, and from [`ci/fdroid/build-android.sh`](../../ci/fdroid/build-android.sh), which the F-Droid recipe uses. Re-runs compare a stamp and skip the network.

Edit the tree and write the diff back with:

```sh
bun run patch-deps -- --diff http2
```

`cargo deny` skips path dependencies, so check advisories for the patched versions by hand when bumping them.

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

Backport of [wry 0.56.0](https://github.com/tauri-apps/wry/releases/tag/wry-v0.56.0). **Delete with the move to `tauri-runtime-wry` 2.12**, the first to require `wry >= 0.56`.

On Android `ipc()` runs the IPC handler while holding the process-global `IPC` mutex, and `destroy_webview` takes it on the main thread when an activity is destroyed, so a sync command that waits on the main thread (`run_mobile_plugin`, any `app.path()` getter) never returns once a teardown is queued ahead of it.

| File                 | Change                                                                     |
| -------------------- | -------------------------------------------------------------------------- |
| `android/binding.rs` | Clone the IPC handler out of the map and drop the guard before calling it. |
| `android/mod.rs`     | Store it as `Arc<dyn Fn(Request<String>)>` so it can be cloned.            |

Not a backport: wry 0.57.0 still holds the lock. **Keep it.**

Android WebView paints `WebChromeClient.getDefaultVideoPoster()`, a gray play icon when it returns null, on every `<video>` without a `poster` until it plays or seeks. `android/kotlin/RustWebChromeClient.kt` returns a transparent bitmap instead. Backport of [wry#1804](https://github.com/tauri-apps/wry/pull/1804) from 0.56.1: **delete once the lock resolves `wry >= 0.56.1`**.

On Android and Apple wry hands the WebView the fully buffered body. A handler can instead register a `ResponseStream` and name its id in the `x-wry-stream` header, and the WebView gets the body as it arrives. Like the Android WebView, the reader skips to the request's `Range` start first.

| File                                    | Change                                                                                                                           |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `stream.rs`, `lib.rs`                   | `ResponseStream` and the id registry, exported on Android and Apple.                                                             |
| `android/stream.rs`                     | The four `stream*` natives.                                                                                                      |
| `android/binding.rs`                    | Register the natives in `android_binding!`.                                                                                      |
| `android/kotlin/`                       | `RustInputStream` reads through the natives. `RustWebViewClient` swaps it in for the `x-wry-stream` header, and R8 keeps it.     |
| `wkwebview/class/url_scheme_handler.rs` | A thread sends the stream in 64 KiB `didReceiveData` pieces with no default `Content-Length`, and `stopURLSchemeTask` closes it. |

Not a backport: **keep it when the 0.56 hunks are deleted.**

On Android wry serves custom protocols from `http(s)://<protocol>.localhost`, which Digital Asset Links can't verify. `WebViewBuilderExtAndroid::with_custom_protocol_host` serves one from `https://<host>` instead and answers every other form of that host with 403.

| File                                   | Change                                                                                                                                                      |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib.rs`, `error.rs`                   | `with_custom_protocol_host` and `Error::InvalidCustomProtocolHost`.                                                                                         |
| `custom_protocol_workaround.rs`        | Validate the host, map `<protocol>://localhost` to `https://<host>` and back, block the host over `http`, on another port, with userinfo or a trailing dot. |
| `android/mod.rs`, `android/binding.rs` | Map the start URL, route requests through the mapping, and hand the hosts to Kotlin.                                                                        |
| `android/kotlin/RustWebViewClient.kt`  | 403 for unhandled and service worker requests to the host, reload redirects to it.                                                                          |

Backport of [wry#1879](https://github.com/tauri-apps/wry/pull/1879). **Delete when a `tauri-runtime-wry` requiring a `wry` with `with_custom_protocol_host` is published.**

Android keyboards insert stickers and GIFs with `commitContent`, which the WebView accepts only in rich-text fields. `RustWebView` hands its input connection to the app's `KeyboardMedia`, which declares image types and stages what the keyboard sends. `WRY_RUSTWEBVIEW_CLASS_EXTENSION` can't carry this: Tauri's Gradle task runs cargo from the repo root, so `src-tauri/.cargo/config.toml` is never read.

| File                            | Change                                                                                               |
| ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `android/kotlin/RustWebView.kt` | Override `onCreateInputConnection` to wrap the connection with `{{package}}.keyboard.KeyboardMedia`. |

Not upstreamable: it calls app code. **Keep it.**

On macOS wry runs its drag code even when the app disables its drag-drop handler. It reads `NSFilenamesPboardType` with `unwrap`, which aborts on a drag that declares file names it never supplies ([wry#1756](https://github.com/tauri-apps/wry/issues/1756)), and it turns WebKit's "no operation" into Copy, so a drop the page didn't accept loads the dragged URL.

| File                                                  | Change                                                                       |
| ----------------------------------------------------- | ---------------------------------------------------------------------------- |
| `wkwebview/class/wry_web_view.rs`, `wkwebview/mod.rs` | Keep the handler as an `Option`, `None` when disabled.                       |
| `wkwebview/drag_drop.rs`                              | Without a handler, pass every drag callback to WebKit untouched.             |
| `wkwebview/drag_drop.rs`                              | Skip a file name list that is missing or malformed instead of unwrapping it. |

Not a backport: wry 0.57.0 still has both. **Keep it.**

## tauri-codegen

Embedded assets and CSP hashes are emitted in hash-map and `readdir` order. The patch sorts both.

**Delete when moving to `tauri-codegen` 2.7**, which ships [tauri#15777](https://github.com/tauri-apps/tauri/pull/15777). 2.6.3 does not.

## tauri, tauri-utils, tauri-runtime, tauri-runtime-wry

`app > androidHostname` serves the Android app from `https://<host>` instead of `http://tauri.localhost`, so autofill services can verify the origin through Digital Asset Links. The stock CLI rejects the key in `tauri.conf.json`, so the app sets it through `context.config_mut()`.

| Crate                                | Change                                                                                                         |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `tauri-utils`                        | `AppConfig::android_hostname` and the validated `AndroidHostname`.                                             |
| `tauri-runtime`, `tauri-runtime-wry` | `WebviewAttributes::android_hostname`, passed to wry's `with_custom_protocol_host`.                            |
| `tauri`                              | Move `tauri://localhost` URLs to the host, force `use_https_scheme`, and trust only that exact origin for IPC. |
| `tauri`                              | Test only: the mock runtime reports the webview's `use_https_scheme`, as upstream `dev` does.                  |
| `Cargo.toml`                         | Allow warnings, since a path dependency gets no `--cap-lints allow`.                                           |

Backport of [tauri#16220](https://github.com/tauri-apps/tauri/pull/16220). **Delete when a tauri release ships `app > androidHostname`**, and move the host into `tauri.conf.json`. Until then these four crates, wry and tauri-codegen move together: tauri-codegen 2.7 already requires tauri-utils 2.10.

## tauri-plugin-geolocation

`play-services-location` put four proprietary Play Services AARs into the APK, and the plugin returned no fix at all without Play Services.

| File                                   | Change                                                                                                                                         |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `android/build.gradle.kts`             | Drop the `play-services-location` dependency.                                                                                                  |
| `android/src/main/java/Geolocation.kt` | Reimplement on the platform `LocationManager` via `androidx.core.location`, which back-compats it to `minSdk` 28. GPS and network providers.   |
| `android/src/main/java/Geolocation.kt` | Fix `getLastLocation`, which kept the oldest fix within `maximumAge` instead of the freshest.                                                  |

Accuracy and time to first fix are worse where Play Services exists, since the platform API does no sensor fusion.

**Delete when upstream drops `play-services-location`.** [plugins-workspace#3377](https://github.com/tauri-apps/plugins-workspace/pull/3377) does not: it keeps the dependency and the GMS-first path, and needs API 31.
