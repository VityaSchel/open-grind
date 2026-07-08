# Open Grind FAQ

## Open Grind status

### \> How to download Open Grind APK?

**Follow instructions at https://opengrind.org/guides/download**. Do not download apk files outside of Releases page. If you're advanced technical user, consider building Open Grind yourself on your computer.

### \> When an “X” feature will be available? When the next update comes out?

Visit [issues tracker](https://git.opengrind.org/open-grind/open-grind/issues) to search for a specific feature and track its status. Visit [milestones](https://git.opengrind.org/open-grind/open-grind/milestones) to track progress of the next update. Follow #announcements:opengrind.org for major and release announcements. Join #dev:opengrind.org to see project progress in real time.

### \> Can I pay to gain access to the testing phase early? Or to speed up development?

No, **Open Grind is 100% free, transparent and will always be**. No crypto, no NFTs, no merch, no paid versions, no community badges, no paid support, nothing at all. It's literally impossible to give money to Open Grind project. Anyone who claims otherwise is a scammer.

If you do intend to volunteerly donate money as a thank-you **to particular contributors**, refer to [FUNDING.md](https://git.opengrind.org/open-grind/open-grind/src/branch/main/FUNDING.md) file to find a list of donation links for each individual contributor.

Donations are optional, won't grant any privileges, and **there is no single governance entity that accepts donations on Open Grind behalf.**

### \> What about other apps such as Free Grind and GrindrX?

Neither are affiliated/verified/endorsed by Open Grind. Never trust APKs downloaded from unofficial sources. Any third party clients put your personal sensitive information at risk, which is why Open Grind strives to be 100% transparent and has [reproducable builds](https://git.opengrind.org/open-grind/open-grind/src/branch/android-init/BUILDING.md).

### \> How many users Open Grind has?

We genuinely have no idea, and it's a good thing: there are exactly zero trackers, analytics, data collection in the app. There is no "ping", "install counter", automatic update checking or anything else that could give an estimate of how many people have actually installed the app; Grindr can't infer that either because Open Grind strives to be stealthy and mask itself in the official app disguise.

The only indirect counters are:

1. Download count on Releases page
   - It **does not track IP address**, it's a simple integer counter that is increased each time someone sends the HTTP request to download the file. Nothing about the request is logged or stored.
2. Number of joined accounts in the official discussion venues
   - Such as number of participants in the official Matrix chat room (no limit on how many accounts a person can have or which homeservers they join from)
   - Number of registered users on git.opengrind.org (**IP addresses are not stored**)
   - Keep in mind these platforms do not collect or store any personally-identifiable data about users

**As of July 8, 2026, the estimated number of users is ~25000 based on the downloads counter.**

## Open Grind features

### \> Is Open Grind similar to GrindrPlus?

**Open Grind is not affiliated with GrindrPlus.** GrindrPlus project is dead after the developers have shut down all resources in May 2026. There is no support for GrindrPlus installation issues in this chat.

GrindrPlus was a modified version of Grindr application. Open Grind is a completely separate third-party client that's written from scratch. Any features from Grindr's official app have to be developed from scratch in the app, but that also means no patches are necessary to remove bloat from the official version.

Open Grind is completely free, open source and transparent: no ads, no purchases, no trackers, licensed under MIT software license. **Open Grind is not a fork.** However many projects started from Open Grind's foundation and some are considered forks _of_ Open Grind.

### \> Is Open Grind a new platform? Is Open Grind similar to Grindr Web? What's MVP?

Grindr Web is a client application, it's what allows you to access Grindr, i.e. its interface. Open Grind is a client application too. MVP is just a version type, so there will be: MVP, Early Alpha Test, Early Beta Test, Release Candidate, then version numbers: v1.0, v1.1, v1.2-rc etc. Unfortunately there is no way to make Open Grind work for web browsers right now, so it's limited to native platform (installable Android apk, for example). Open Grind has first class support for desktop platforms.

There's also the **[Grindr Web Unlock](https://git.opengrind.org/open-grind/grindr-web-unlock) project**, available for all browsers, that puts best efforts to remove soft client-side paywalls on web.grindr.com, but does have some known issues and limitations, such as not being able to see conversations and messages history.

### \> Is location spoofing possible? Can you fake your geolocation?

Yes, it's built-in. You must explicitly choose a location before you can use Open Grind. On mobile platforms you can also automatically geolocation y using your device's GPS.

### \> Is it possible to bypass age verification?

**Open Grind does not implement age verification flow and does not have any means of bypassing it. There will be no attempt at integrating any logic related to age verification in the app.** If your account was locked due to age verification laws, you're advised to download the official app once and complete verification there.

**If you're** unable to comply with the age verification laws because you're **underage, you're strongly advised against attempting at bypassing it or manifesting in any public communities or forums affiliated with Open Grind.**

### \> Does Open Grind bypass bans?

There are no features that aim specifically at bypassing account bans in Open Grind. However, some Open Grind features indirectly assist in this, such as random device id and zero trackers to link multiple accounts to single person.

### \> How to create an account?

Currently not possible. Use the official app to create an account and then sign in in Open Grind. Track https://git.opengrind.org/open-grind/open-grind/issues/21 to follow updates.

### \> How to sign in with Google?

See https://opengrind.org/guides/sign-in-with-google

### \> How to login with phone number?

Currently not possible. Track https://git.opengrind.org/open-grind/open-grind/issues/29 to follow updates.

### \> Are there any AI features in Open Grind?

No, and likely will never be.

## Open Grind development

### \> How can I help development?

If you know any Rust developers, please link them to https://git.opengrind.org/open-grind/open-grind. Full-stack Tauri developers and API reverse engineers are also welcome. Spread the word. Use Telegram's semiofficial mirror to quickly share announcements: https://t.me/opengrind.

### \> What are the community rules for discussion chat rooms?

See [CODE\_OF\_CONDUCT.md](https://git.opengrind.org/open-grind/open-grind/src/branch/main/CODE_OF_CONDUCT.md)

### \> Is it possible to customize colors of the UI?

It's planned, but currently no UI/UX work has been done. If you're an advanced technical user, you could replace CSS variables and build the project for yourself.

## Common issues & other questions

### \> Cascade shows nearby people mixed with some profiles far away.

That's how items are returned from API, specifically the first ten are "open" and then there's only profileId, which a client can fetch in bulk. UX improvements are planned for this issue but not in the works yet.

### \> What version number works?

As of July, 2026, the confirmed working version for API is `26.9.1.163471`. If you don't know what that means, just use the latest Open Grind version.

### \> Is GrindrPlus Discord server gone?

Yes, it's been confirmed that it's been deleted. Last weeks, the server was mostly off topic anyway. Any intels regarding Grindr API are welcome in #dev:opengrind.org.

### \> How to verify a certain build is safe and trusted?

Use [Open Grind's PGP key](https://opengrind.org/pgp) to verify a release.

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
