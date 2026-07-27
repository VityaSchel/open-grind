# Open Grind Keys

This document is signed. Verify it with the governance key below, then trust everything else in it, including the release signing key:

```bash
gpg --fetch-keys https://opengrind.org/pgp
gpg --verify KEYS.md.asc KEYS.md
```

## Governance PGP key

Public key: <https://opengrind.org/pgp>

| Key               | Fingerprint                                         | Purpose                                                                 |
| ----------------- | --------------------------------------------------- | ----------------------------------------------------------------------- |
| Master            | `CB72 2EE9 67E4 FCAD 7C65 8FC6 9A1F 7F5F 5929 19D2` | Certification only. Never expires.                                      |
| Signing subkey    | `327F 54ED 1D23 38E6 D3B3 9301 22F8 38B0 4A16 E6DE` | Signs this document and advisories. Rotated yearly, expires 2027-05-12. |
| Encryption subkey | `603F CE1A 8D5C B36F 1805 472B 64E0 985C 0BC0 FAD2` | Encrypted reports ([SECURITY.md](./SECURITY.md)). Expires 2027-07-27.   |

The canonical key, as published at the URL above:

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
n9ALznossxQtTWKrTg6+kwpmc/7ZVXzhGCXcHUAZWwq4OARqZ697EgorBgEEAZdV
AQUBAQdApwDkOi7zrVPtRF3DPROzgHH57nELMvQaHQMa/3rlwnoDAQgHiH4EGBYK
ACYWIQTLci7pZ+T8rXxlj8aaH39fWSkZ0gUCamevewIbDAUJAeEzgAAKCRCaH39f
WSkZ0h3mAP9OnSl77nGPNUw/JYTAIgq4W407od0zF44spw+xMoDZNAEAnpTQaKMN
b4O3eJHsIrOtmBqzBEKRFuNqXz/uPGHImw0=
=WSDH
-----END PGP PUBLIC KEY BLOCK-----
```

## Release signing

Releases are signed with [minisign](https://jedisct1.github.io/minisign/) key:

```
RWReleaseOpenGrindurRQcmR+NovOaU5IEU3LM5l6TcXJvOGYw2m4O+
```

Each artifact ships a detached `.minisig` next to it:

```bash
minisign -Vm open-grind.apk -P RWReleaseOpenGrindurRQcmR+NovOaU5IEU3LM5l6TcXJvOGYw2m4O+
```

## Platforms signing

Android JKS SHA-256 fingerprint:

```
2805fdd8f0badb9424d3244c5e5b3473cef5b8798ec1117382e89eda45c3658c
```

## Governance certification

The current [decision making authority](./GOVERNANCE.md#maintainers) certifies the master key with their personal key, which ties the project key to whoever holds it. That signature is not part of the canonical key above and is published only here:

```
-----BEGIN PGP PUBLIC KEY BLOCK-----

mDMEagOyrBYJKwYBBAHaRw8BAQdAyg0H1UG48kwMu/iOTcRHBsOSx8XOaH3dQprB
vTp/U360OE9wZW4gR3JpbmQgR292ZXJuYW5jZSAoaHR0cHM6Ly9vcGVuZ3JpbmQu
b3JnL2dvdmVybmFuY2UpiJMEExYKADsWIQTLci7pZ+T8rXxlj8aaH39fWSkZ0gUC
agOyrAIbAQULCQgHAgIiAgYVCgkICwIEFgIDAQIeBwIXgAAKCRCaH39fWSkZ0gUU
AP9fjzZCM1QnRaBoeaYW9ZsIqxLD1cNcRQTr1ZDxyrDfZAD8CpXHm6z40FflnYpH
fPPsr3kmJDmYmWfBQopOV/ZkeAKIdQQQFggAHRYhBANvfSJCl9hzpPzp2imemkUB
MqKMBQJqZ7BmAAoJECmemkUBMqKMVbUBAKLJBaztZdOq/AhlWsWmRILfKokF/41n
5YPuRNxRJJ3BAP99iO+Bq3NI8/scnwoeNzZHVvpihgAN+nP6SHbaHr9fAbgzBGoD
s64WCSsGAQQB2kcPAQEHQG/vHrQVFA+82i+C+m7JGkkGtFDRLm/1ovVzMhA4eH/s
iPUEGBYKACYWIQTLci7pZ+T8rXxlj8aaH39fWSkZ0gUCagOzrgIbAgUJAeEzgACB
CRCaH39fWSkZ0nYgBBkWCgAdFiEEMn9U7R0jOObTs5MBIvg4sEoW5t4FAmoDs64A
CgkQIvg4sEoW5t5y2wEAo6zgz7NGm9zPQjCG5ButrjN6cmIxSwLd210/0wxNX1oB
AICdT10EzjYhh2b0xMvL/Z7UriUh5XQvlu2PZRDdk+YHXmYBAMk1/TyAjicxfOxU
fau6UyRhVb1EVorLQg2tZe8GbN7HAQCf0AvOeiyzFC1NYqtODr6TCmZz/tlVfOEY
JdwdQBlbCrg4BGpnr3sSCisGAQQBl1UBBQEBB0CnAOQ6LvOtU+1EXcM9E7OAcfnu
cQsy9BodAxr/euXCegMBCAeIfgQYFgoAJhYhBMtyLuln5PytfGWPxpoff19ZKRnS
BQJqZ697AhsMBQkB4TOAAAoJEJoff19ZKRnSHeYA/06dKXvucY81TD8lhMAiCrhb
jTuh3TMXjiynD7EygNk0AQCelNBoow1vg7d4kewis62YGrMEQpEW42pfP+48Ycib
DQ==
=Muah
-----END PGP PUBLIC KEY BLOCK-----
```
