# Open Grind Signing Keys

See also [BUILDING.md](./BUILDING.md) for reproducible builds. This document (KEYS.md) is signed (KEYS.md.asc) with Open Grind's PGP key below, you can verify it using `gpg --verify KEYS.md.asc KEYS.md`.

## PGP Public Key

Public key: <https://opengrind.org/pgp>

Fingerprint:

```
CB72 2EE9 67E4 FCAD 7C65 8FC6 9A1F 7F5F 5929 19D2
```

Armored:

```
-----BEGIN PGP PUBLIC KEY BLOCK-----

mDMEagOyrBYJKwYBBAHaRw8BAQdAyg0H1UG48kwMu/iOTcRHBsOSx8XOaH3dQprB
vTp/U360OE9wZW4gR3JpbmQgR292ZXJuYW5jZSAoaHR0cHM6Ly9vcGVuZ3JpbmQu
b3JnL2dvdmVybmFuY2UpiJMEExYKADsWIQTLci7pZ+T8rXxlj8aaH39fWSkZ0gUC
agOyrAIbAQULCQgHAgIiAgYVCgkICwIEFgIDAQIeBwIXgAAKCRCaH39fWSkZ0gUU
AP9fjzZCM1QnRaBoeaYW9ZsIqxLD1cNcRQTr1ZDxyrDfZAD8CpXHm6z40FflnYpH
fPPsr3kmJDmYmWfBQopOV/ZkeAK4MwRqA7OuFgkrBgEEAdpHDwEBB0Bv7x60FRQP
vNovgvpuyRpJBrRQ0S5v9aL1czIQOHh/7Ij1BBgWCgAmFiEEy3Iu6Wfk/K18ZY/G
mh9/X1kpGdIFAmoDs64CGwIFCQHhM4AAgQkQmh9/X1kpGdJ2IAQZFgoAHRYhBDJ/
VO0dIzjm07OTASL4OLBKFubeBQJqA7OuAAoJECL4OLBKFubectsBAKOs4M+zRpvc
z0IwhuQbra4zenJiMUsC3dtdP9MMTV9aAQCAnU9dBM42IYdm9MTLy/2e1K4lIeV0
L5btj2UQ3ZPmB15mAQDJNf08gI4nMXzsVH2rulMkYVW9RFaKy0INrWXvBmzexwEA
n9ALznossxQtTWKrTg6+kwpmc/7ZVXzhGCXcHUAZWwo=
=b377
-----END PGP PUBLIC KEY BLOCK-----
```

Verify release:

```bash
gpg --fetch-keys https://opengrind.org/pgp.asc
gpg --verify opengrind.apk.asc opengrind.apk
```

## Android APK Signing

Certificate's SHA-256 fingerprint:

```
28:05:FD:D8:F0:BA:DB:94:24:D3:24:4C:5E:5B:34:73:CE:F5:B8:79:8E:C1:11:73:82:E8:9E:DA:45:C3:65:8C
```

[Guide on verifying release APKs](./BUILDING.md#verifying-a-published-release): apksigner should output `Signer #1 certificate SHA-256 digest: 2805fdd8f0badb9424d3244c5e5b3473cef5b8798ec1117382e89eda45c3658c` matching certificate's SHA-256 above.

## Governance certification

Open Grind's public PGP key is certified by [governance's decision making authority](./GOVERNANCE.md) — Viktor Shchelochkov (https://hloth.dev, [PGP key](https://hloth.dev/pgp)):

```
-----BEGIN PGP PUBLIC KEY BLOCK-----

mDMEagOyrBYJKwYBBAHaRw8BAQdAyg0H1UG48kwMu/iOTcRHBsOSx8XOaH3dQprB
vTp/U360OE9wZW4gR3JpbmQgR292ZXJuYW5jZSAoaHR0cHM6Ly9vcGVuZ3JpbmQu
b3JnL2dvdmVybmFuY2UpiJMEExYKADsWIQTLci7pZ+T8rXxlj8aaH39fWSkZ0gUC
agOyrAIbAQULCQgHAgIiAgYVCgkICwIEFgIDAQIeBwIXgAAKCRCaH39fWSkZ0gUU
AP9fjzZCM1QnRaBoeaYW9ZsIqxLD1cNcRQTr1ZDxyrDfZAD8CpXHm6z40FflnYpH
fPPsr3kmJDmYmWfBQopOV/ZkeAKIdQQTFgoAHRYhBANvfSJCl9hzpPzp2imemkUB
MqKMBQJqA7xrAAoJECmemkUBMqKMQuwA/2NdApZCriVplMjF5CgBpVG1kYvPesAk
O+R/CdsK0p5+AQCt/Y7X5UBMFTG8HcBivUMcHGhg8BQg/5LFWNWyFNlsA7gzBGoD
s64WCSsGAQQB2kcPAQEHQG/vHrQVFA+82i+C+m7JGkkGtFDRLm/1ovVzMhA4eH/s
iPUEGBYKACYWIQTLci7pZ+T8rXxlj8aaH39fWSkZ0gUCagOzrgIbAgUJAeEzgACB
CRCaH39fWSkZ0nYgBBkWCgAdFiEEMn9U7R0jOObTs5MBIvg4sEoW5t4FAmoDs64A
CgkQIvg4sEoW5t5y2wEAo6zgz7NGm9zPQjCG5ButrjN6cmIxSwLd210/0wxNX1oB
AICdT10EzjYhh2b0xMvL/Z7UriUh5XQvlu2PZRDdk+YHXmYBAMk1/TyAjicxfOxU
fau6UyRhVb1EVorLQg2tZe8GbN7HAQCf0AvOeiyzFC1NYqtODr6TCmZz/tlVfOEY
JdwdQBlbCg==
=5Fn1
-----END PGP PUBLIC KEY BLOCK-----
```