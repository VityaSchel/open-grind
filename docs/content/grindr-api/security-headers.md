# Security headers

Security headers are HTTP headers that the Grindr API requires to be present and correctly formed in order to respond to requests. If any of these headers is missing or malformed, the API might respond with an error, e.g. `ACCOUNT_BANNED` (not really), 403 Forbidden HTTP status code or Cloudflare HTML block page.

- [Security headers](#security-headers)
  - [`Accept`](#accept)
  - [`L-Device-Info`](#l-device-info)
  - [`User-Agent`](#user-agent)
  - [`L-Time-Zone`](#l-time-zone)
  - [`L-Locale`](#l-locale)
  - [`L-Grindr-Roles`](#l-grindr-roles)
  - [Device-key upload signing](#device-key-upload-signing)
    - [The device key](#the-device-key)
    - [1. Register the key](#1-register-the-key)
    - [2. Sign each upload](#2-sign-each-upload)
    - [Signing errors](#signing-errors)
  - [Correct headers order](#correct-headers-order)
  - [Fingerprint](#fingerprint)
    - [TLS parameters](#tls-parameters)
    - [Behavior patterns](#behavior-patterns)
    - [TLS fingerprint](#tls-fingerprint)
      - [Cipher suites](#cipher-suites)
      - [Extensions](#extensions)
    - [HTTP/2 fingerprint](#http2-fingerprint)
      - [Frames](#frames)
      - [Pseudoheaders](#pseudoheaders)
    - [JA3/JA4 fingerprint hashes](#ja3ja4-fingerprint-hashes)

## `Accept`

Set `Accept: application/json` header on all requests except `/v3/bootstrap` — this one returns empty response if this header is present.

## `L-Device-Info`

Absence or incorrect forming of this header might lead to HTTP status 403 and Cloudflare block page.

```
<deviceId>;GLOBAL;<deviceType>;<totalRAM>;<screenResolution>;<advertisingId>
```

- `deviceId` — 16 hex characters
- `GLOBAL` — hardcoded channel/flavor
- `deviceType` — `1` if `Build.CPU_ABI == "x86"` (emulator), `2` if ARM
- `totalRam` — ActivityManager.MemoryInfo.totalMem
- `screenResolution` — "heightPx x widthPx" e.g. `2400x1080`
- `advertisingId` — Google Advertising ID, falls back to `00000000-0000-0000-0000-000000000000` if unavailable

Example: `a1b2c3d4e5f60789;GLOBAL;2;8026152960;2400x1080;550e8400-e29b-41d4-a716-446655440000`

## `User-Agent`

Absence or incorrect forming of this header might lead to HTTP status 400 and `urn:gr:err:header` API error or 403 [WebSocket](/grindr-api/websocket/index#websocket) connection error.

```
grindr3/25.20.0.147239;147239;<subscriptionTier>;<os>;<deviceModel>;<manufacturer>
```

- `subscriptionTier`: `Free`, `Plus`, `Xtra`, `Unlimited`, `Premium`, `Free_Plus`, `Free_Xtra`, `Free_Unlimited`, `Free_Premium`
- `os`: `Android 13`, `Android 14`, etc.
 
Example: `grindr3/25.20.0.147239;147239;Free;Android 13;Pixel 7;Google`

## `L-Time-Zone`

[Time zone](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones) in the format Country/Region. E.g. `America/New_York` or `Europe/Madrid`. Unknown whether this value is checked against your IP's ISP location.

## `L-Locale`

Should be set along with `Accept-Language` to a language. 

- Format for Accept-Language: `en-US`
- Format for L-Locale: `en_US`

Note the hyphen/underscore.

## `L-Grindr-Roles`

Should be a square-bracketed set of uppercased subscription tiers separated by comma without spaces or quotes, e.g. `[FREE]`. Only when the user is already authorized.

## Device-key upload signing

Starting with app version 26.10.0, the media-upload endpoints are protected by a per-request ECDSA signature bound to an ephemeral device key. Two endpoints require it:

- `POST /v5/media/upload` — profile images (signed successor of the unsigned `POST /v4/media/upload`, see [Upload media (signed)](/grindr-api/users/profiles#upload-media-signed))
- `POST /v6/chat/media/upload` — chat / drawer media (signed successor of the unsigned `POST /v5/chat/media/upload`, see [Upload media (signed)](/grindr-api/messaging/drawer#upload-media-signed))

The registration endpoints live under [Media](/grindr-api/media). The older unsigned upload versions still respond, so signing is only mandatory when calling these two newer paths.

Every binary value in this scheme (`publicKey`, `keyId`, signatures, `nonce`, body hash) is **base64url without padding** — the URL-safe alphabet (`-` and `_`), no trailing `=`. Every signature is **`SHA256withECDSA`** (ECDSA on the NIST P-256 / secp256r1 curve with SHA-256), serialized as an **ASN.1 DER** sequence and then base64url-encoded.

Two identifiers are reused from data the client already sends:

- `userId` — the numeric profile id of the authenticated session, as a decimal string.
- `androidId` — the 16 hex character device id, i.e. the **first** field of [`L-Device-Info`](#l-device-info) (the part before the first `;`).

### The device key

Generate one **P-256 (secp256r1)** key pair per session (the official app stores it in the Android Keystore under the alias `device_signing_key_<userId>`). Two strings are derived from the public key and reused everywhere:

- `publicKey` = `base64url( SubjectPublicKeyInfo DER )` — the X.509 SPKI (`spki`) encoding of the public key.
- `keyId` = `base64url( SHA-256( SubjectPublicKeyInfo DER ) )` — SHA-256 over the exact same SPKI bytes.

### 1. Register the key

Both calls require [Authorization](/grindr-api/api-authorization). First fetch a challenge:

```
POST /v1/verification/device-keys/challenge
```

Response (`ChallengeResponse`):

```json
{ "challenge": "<opaque string>", "expiresAt": "<ISO-8601 instant>" }
```

Build the canonical **registration string** by joining five fields with a literal `|` (U+007C `|`), in exactly this order:

```
<userId>|<keyId>|<publicKey>|<androidId>|<challenge>
```

Sign its UTF-8 bytes with the device key to obtain `registrationSignature = base64url( DER( ECDSA-P256-SHA256( message ) ) )`, then submit the key:

```
POST /v1/verification/device-keys
```

Body (`RegisterKeyRequest`):

```json
{
  "publicKey": "<base64url(SPKI)>",
  "keyId": "<base64url(SHA-256(SPKI))>",
  "registrationSignature": "<base64url(DER signature)>"
}
```

Response (`RegisterKeyResponse`): `{ "keyId": "<keyId>" }`, echoing the accepted key id.

### 2. Sign each upload

For every signed upload, compute three per-request values:

- `nonce` = `base64url( 32 random bytes )`, freshly generated each request.
- `timestamp` = the signing time as **Unix epoch milliseconds**, a decimal string. In-app this is `GrindrTime.getTime()` plus a small per-call offset, so it may be slightly skewed from the local clock; the server returns its own time on drift (see below).
- `bodyHash` = `base64url( SHA-256( rawRequestBody ) )` — SHA-256 of the exact bytes placed in the request body (the raw image/video `application/octet-stream` payload), not of any wrapper.

Build the canonical **upload string** by joining five fields with `|`, in exactly this order:

```
<bodyHash>|<timestamp>|<userId>|<androidId>|<nonce>
```

Sign its UTF-8 bytes with the same device key and send four headers alongside the upload:

| Header        | Value                                                            |
| ------------- | ---------------------------------------------------------------- |
| `X-Key-Id`    | `keyId` (base64url of `SHA-256(SPKI)`)                           |
| `X-Sig`       | `base64url( DER( ECDSA-P256-SHA256( uploadString ) ) )`          |
| `X-Timestamp` | the same `timestamp` (epoch milliseconds) embedded in the string |
| `X-Nonce`     | the same `nonce` embedded in the string                          |

The `X-Timestamp` and `X-Nonce` header values must be byte-for-byte identical to the `timestamp` and `nonce` used inside the signed string, or verification fails.

### Signing errors

A rejected signature returns a problem body (`UploadSigningErrorResponse`) with `type` and `detail` fields. The client matches the failure by substring on `type`:

- `timestamp_drift` — the clock is too far from the server. `detail` carries the server's current time as an ISO-8601 instant; recompute your `timestamp` offset from it and retry.
- `nonce_replayed` — the `nonce` was seen before; retry with a fresh one.

## Correct headers order

Appear in `HEADERS` frame (see below) in this order:

- `Authorization` (only if authorized)
- `L-Time-Zone`
- `L-Grindr-Roles`
- `L-Device-Info`
- `Accept` (always `application/json`)
- `User-Agent`
- `L-Locale`
- `Accept-language` — note the lowercase `l`

Other headers:

- `Host`
- `Connection` (always `Keep-Alive`)
- `Accept-Encoding` (always `gzip`)
- `Content-Length` or `Transfer-Encoding: chunked`
- `Cookie` (if necessary)

## Fingerprint

Getting all of HTTP security headers right is enough for the API to respond, but sooner or later you'll get hit with 403 HTTP errors from Cloudflare and HTML blocked pages. This is because Cloudflare, which protects Grindr API, learns request fingerprints and categorizes them as coming from the Grindr official app or botnets. Tens of requests might get through as some new fingerprint, but hundreds or thousands of requests with a fingerprint different from the official app will get blocked.

Request fingerprint is a characteristic derived from many factors, such as ClientHello, TLS encryption negotiation, HTTP pseudo-headers, TCP frame size, etc. The goal is to make all of these parameters match official Grindr clients (we focus on Android apk specifically, using the Java library used in the official Grindr app).

As of Grindr APK v26.8.2 (162647), the version of OkHttp used in the official app is `5.3.2`.

### TLS parameters

Chain: `Security.insertProviderAt(BouncyCastleProvider, 1)` &rarr; `ProviderInstaller.installIfNeeded(...)` (inserts `GmsCore_OpenSSL` at 1, demoting BC to position 2) &rarr; `SSLContext.getInstance("TLSv1.2")` resolves to the **GMS Conscrypt** (BoringSSL fork) provider. On Android 10+, OkHttp matches `Android10SocketAdapter` which delegates ALPN/session-ticket config to `android.net.ssl.SSLSockets` and `SSLParameters.setApplicationProtocols(...)` — the actual ClientHello bytes are emitted by **Conscrypt**. The ALPN list depends on which OkHttpClient instance is in use: the main API client passes `["h2","http/1.1"]`, the WebSocket client passes `["http/1.1"]` only.

Both TLS 1.3 and TLS 1.2 are offered. The `SSLContext.getInstance("TLSv1.2")` call sets a minimum-version hint, not a cap; Conscrypt's resulting socket enables both versions, and OkHttp's `ConnectionSpec.MODERN_TLS` intersection preserves both.

```
Cipher suites = MODERN_TLS list ∩ Conscrypt-supported (order preserved from MODERN_TLS)
```

**Record layer:** `legacy_version = 0x0303` (TLS 1.2/TLS 1.3).

### Behavior patterns

OkHttpClient constructed with these options:

- No redirects followed, both normal and SSL:

```java
followRedirects(false).followSslRedirects(false)
```

- No more than 20 concurrent requests to the same host:

```java
dispatcher.setMaxRequestsPerHost(20)
```

- Certificate is pinned with a single SHA-1 SPKI pin on the apex domain (not wildcard):

```java
CertificatePinner.Builder().add("grindr.mobi", "sha1/Ig2WwRMB85wQAed8JEkBXBaWics=")
```

To check real SHA-1 hash of SPKI with:

```sh
echo | openssl s_client -connect grindr.mobi:443 -servername grindr.mobi 2>/dev/null \
  | openssl x509 -pubkey -noout \
  | openssl pkey -pubin -outform der \
  | openssl dgst -sha1 -binary \
  | openssl base64
```

OkHttpClient uses these settings:

- Protocols: `[HTTP_2, HTTP_1_1]` &rarr; ALPN order: `h2, http/1.1`
- Connection specs: `[MODERN_TLS, CLEARTEXT]`
- Cipher suite: see below

### TLS fingerprint

#### Cipher suites

In this order, IANA hex:

| #   | Suite                                         | Code     |
| --- | --------------------------------------------- | -------- |
| 1   | TLS_AES_128_GCM_SHA256                        | `0x1301` |
| 2   | TLS_AES_256_GCM_SHA384                        | `0x1302` |
| 3   | TLS_CHACHA20_POLY1305_SHA256                  | `0x1303` |
| 4   | TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256       | `0xc02b` |
| 5   | TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256         | `0xc02f` |
| 6   | TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384       | `0xc02c` |
| 7   | TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384         | `0xc030` |
| 8   | TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256 | `0xcca9` |
| 9   | TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256   | `0xcca8` |
| 10  | TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA            | `0xc013` |
| 11  | TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA            | `0xc014` |
| 12  | TLS_RSA_WITH_AES_128_GCM_SHA256               | `0x009c` |
| 13  | TLS_RSA_WITH_AES_256_GCM_SHA384               | `0x009d` |
| 14  | TLS_RSA_WITH_AES_128_CBC_SHA                  | `0x002f` |
| 15  | TLS_RSA_WITH_AES_256_CBC_SHA                  | `0x0035` |

No `TLS_EMPTY_RENEGOTIATION_INFO_SCSV (0x00ff)`. BoringSSL omits it whenever the `renegotiation_info` extension is present in the ClientHello ([RFC 5746 §3.4](https://www.rfc-editor.org/rfc/rfc5746#section-3.4)) and Conscrypt always sends the extension.

#### Extensions

The ClientHello extension order is decided by BoringSSL, which Conscrypt is a thin JNI wrapper around. BoringSSL keeps a fixed table ([ssl/extensions.cc, line 4060](https://boringssl.googlesource.com/boringssl/+/refs/heads/main/ssl/extensions.cc#4060)); permutation is conditionally added by `permute_extensions`, which defaults to `false` ([ssl_lib.cc, line 387](https://boringssl.googlesource.com/boringssl/+/refs/heads/main/ssl/ssl_lib.cc#387)) and Conscrypt never enables. Extensions in wire order:

- `server_name (0)` — the hostname (`grindr.mobi`)
- `extended_master_secret (23)` — empty
- `renegotiation_info (65281)` — empty
- `supported_groups (10)` — `[x25519 (29), secp256r1 (23), secp384r1 (24)]`
- `ec_point_formats (11)` — `[uncompressed (0)]`
- `session_ticket (35)` — empty (`SSLSockets.setUseSessionTickets(true)`, `okhttp3.internal.platform.android.Android10SocketAdapter`). The actual TLS 1.3 ticket rides in `pre_shared_key` instead.
- `application_layer_protocol_negotiation (16)` — `["h2","http/1.1"]` for the main API client, `["http/1.1"]` for the WebSocket client
- `status_request (5)` — [OCSP](https://www.rfc-editor.org/rfc/rfc6960) (type byte `1`), `responder_id_list = empty`, `request_extensions = empty`
- `signature_algorithms (13)` — `ecdsa_secp256r1_sha256 (0x0403), rsa_pss_rsae_sha256 (0x0804), rsa_pkcs1_sha256 (0x0401), ecdsa_secp384r1_sha384 (0x0503), rsa_pss_rsae_sha384 (0x0805), rsa_pkcs1_sha384 (0x0501), rsa_pss_rsae_sha512 (0x0806), rsa_pkcs1_sha512 (0x0601), rsa_pkcs1_sha1 (0x0201)`
- `key_share (51)` — one entry: `x25519` with a 32-byte public key (38 bytes total including framing)
- `psk_key_exchange_modes (45)` — `[psk_dhe_ke (1)]`
- `supported_versions (43)` — `[TLS 1.3 (0x0304), TLS 1.2 (0x0303)]`
- `padding (21)` — [RFC 7685](https://www.rfc-editor.org/rfc/rfc7685.html) padding. BoringSSL targets a fixed ClientHello length (~512 bytes), so the padding length is whatever's needed to hit the target: 3 bytes when ALPN advertises `h2,http/1.1`, 6 bytes when ALPN advertises only `http/1.1`. Don't fingerprint on the padding length itself — fingerprint on its presence.
- `pre_shared_key (41)` — **only on session-resumption connections**, must be the last extension (TLS 1.3 spec). On a fresh connection (no cached session ticket), this extension is absent and the ClientHello has 13 extensions instead of 14, with a different JA3/JA4 hash.

The WebSocket OkHttpClient's ClientHello differs only in ALPN content (one entry vs two). JA4's `_b_c` halves are identical; the `_a` half differs (`h1` vs `h2`).

### HTTP/2 fingerprint

#### Frames

Sources: `okhttp3.internal.http2.Http2Connection` and `okhttp3.internal.http2.Http2Writer`.

- **CONNECTION PREFACE** — canonical `PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n` (24 bytes), [RFC 9113 §3.4](https://www.rfc-editor.org/rfc/rfc9113.html#name-http-2-connection-preface)
- **SETTINGS payload** — exactly one setting, `SETTINGS_INITIAL_WINDOW_SIZE (0x04) = 16777216` (16 MiB)
- **WINDOW_UPDATE** — `increment = 16711681 (= 16777216 - 65535)` on stream 0, sent immediately after SETTINGS
- **PRIORITY frames absent**
- **max frame size** = `16384` until peer's SETTINGS overrides
- **Stream IDs**: client uses odd IDs starting at 3
- **HPACK**: writer starts with table size 0 and follows peer-acknowledged size: `hpackWriter = new Hpack.Writer(0, false, buffer, ...)`, okhttp dynamically resizes only when the peer sends `SETTINGS_HEADER_TABLE_SIZE`

#### Pseudoheaders

Pseudo-headers in HTTP/2 are written by okhttp/internal/http2/Http2ExchangeCodec.java &rarr; `Http2ExchangeCodec` &rarr; `Companion` &rarr; `http2HeadersList` in **exactly this order**:

- `:method`
- `:path`
- `:authority`
- `:scheme`
- then all other headers lowercased in the order they were added, minus this skip-list: `connection, host, keep-alive, proxy-connection, te, transfer-encoding, encoding, te-trailers, :method, :path, :scheme, :authority` (hardcoded in `HTTP_2_SKIPPED_REQUEST_HEADERS` in `okhttp3.internal.http2.Http2ExchangeCodec`). Cookies are sent as a single `cookie:` header (okhttp 5 does not implement cookie-folding).

### JA3/JA4 fingerprint hashes

[JA4 spec](https://github.com/FoxIO-LLC/ja4/blob/main/technical_details/JA4.md). JA3 hashes the fullstring with MD5; JA4 hashes each half with SHA-256 truncated to the first 12 hex characters.

**Session-resumption ClientHello** (i.e. every connection after the first):

```
JA3 fullstring: 771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-51-45-43-21-41,29-23-24,0
JA3 hash:       62e5cbd375390b136bf5b06be231ed6b
JA4 (h2):       t13d1514h2_8daaf6152771_fadfdae04b4e
JA4 (h1):       t13d1514h1_8daaf6152771_fadfdae04b4e
```

**Cold-start ClientHello** (first connection after install / `pm clear`, no cached ticket): `pre_shared_key (41)` is absent, extension count drops from 14 to 13. The cipher-list half of JA4 (`8daaf6152771`) is identical to the warm variant; only the extension-set half changes.

```
JA3 fullstring: 771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-51-45-43-21,29-23-24,0
JA3 hash:       1d714db2228763eab228fc28ce7f8e4f
JA4 (h2):       t13d1513h2_8daaf6152771_eca864cca44a
JA4 (h1):       [not applicable, see below]
```

In the official Grindr app the WebSocket connection (h1 ALPN) is always warm, because the API client opens connections first and adds shared keys to the session ticket cache.

To test these fingerprints automatically we use [fingerprint_check.rs](). The public TLS-probe service [tls.peet.ws](https://tls.peet.ws/) is the destination of each probe, and its JA4 calculator is spec-incorrect (it drops the `padding (21)` extension from the sorted extension list before hashing — `40271e0a5736` instead of `eca864cca44a` for cold h2); the grindr.rs examples binary therefore recomputes JA4 spec-correctly from peet.ws's raw `ja4_r` field (which *does* report the full sorted extension list, including padding) rather than trusting peet.ws's pre-computed `ja4` field. The full set of extensions, the cipher list, the signature-algorithms list, and the HTTP/2 Akamai fingerprint `4:16777216|16711681|0|m,p,a,s` are wire-verified identical between our Rust backend and the official Grindr 26.8.2 Android app, in both cold and warm states.
