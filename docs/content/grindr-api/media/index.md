# Media

Media files in Grindr are stored on cdns.grindr.com:443 hosted by Amazon CloudFront powered by AmazonS3. All CDN files are accessible without [authorization](/grindr-api/api-authorization) but some are protected with signed URLs. No [security headers](/grindr-api/security-headers) or `Authorization` need to be present in a request to CDN.

Caching is supported via [ETag header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/ETag) — MD5 hash of image file. Image files might have `image/jpeg`, `image/png` or `image/webp` type, based on original.

Media files are identified by either a 40-character (public files) or 64-character (signed files) hexadecimal string. Although not confirmed for all types of media, it appears to be SHA-1 hash for 40-character hash and SHA-256 hash for 64-character hash. Confirmed cases: [Audio](/grindr-api/messaging/messages#audiomessagebody) uses SHA-256 for its 64-character mediaHash.

## CDN request headers

The official app sends `Accept: image/webp,image/*;q=0.8` and the same [User-Agent](/grindr-api/security-headers#user-agent) as the API, plus `Accept-Encoding: gzip` unless the request carries a `Range`. Same [TLS and HTTP/2 fingerprint](/grindr-api/security-headers). No `Authorization`, no `L-*` headers, no cookies.

Signed URLs rotate their `Signature` on every fetch while the rest of the URL stays stable, so cache on the URL without its query.

Album videos are played with `android.media.MediaPlayer` User-Agent:

```
Dalvik/<vmVersion> (Linux; U; Android <os>; <deviceModel> Build/<buildId>)
```

- `vmVersion`: ART version, `2.1.0` on every current release
- `os`, `deviceModel`: same values as the app [User-Agent](/grindr-api/security-headers#user-agent)
- `buildId`: `Build.ID` of that exact OS build, e.g. `UQ1A.240105.004` — device- and patch-specific, with no counterpart in any Grindr header

Example: `Dalvik/2.1.0 (Linux; U; Android 14; Pixel 8 Build/UQ1A.240105.004)`

Its first request carries no `Range`; seeking re-requests with an open-ended `Range: bytes=<offset>-`.

There are two types of files stored on CDN.

<Subpages />