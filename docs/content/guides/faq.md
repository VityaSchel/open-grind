---
prev: false
next: false
title: 'FAQ'
---

# Open Grind FAQ

## Open Grind status

::: details How to download Open Grind APK?

**Follow instructions at [https://opengrind.org/download](/guides/download)**. Do not download apk files outside of the official pages. If you're an advanced technical user, consider [building Open Grind](https://git.opengrind.org/open-grind/open-grind/src/branch/main/BUILDING.md#build-open-grind) yourself on your computer.

:::

::: details When will an “X” feature be available? When does the next update come out?

Visit [issues tracker](https://git.opengrind.org/open-grind/open-grind/issues) to search for a specific feature and track its status.

Visit [milestones](https://git.opengrind.org/open-grind/open-grind/milestones) to track progress of the next update.

Join [#announcements:opengrind.org](https://matrix.to/#/#announcements:opengrind.org) to get announcements about new releases.

Join [#dev:opengrind.org](https://matrix.to/#/#dev:opengrind.org) to follow the project development progress.

:::

::: details Can I pay to gain access to the testing phase early? Or to speed up development?

No, **Open Grind is 100% free, transparent and will always be**. No crypto, no NFTs, no merch, no paid versions, no community badges, no paid support, nothing at all. It's literally impossible to give money to Open Grind project. Anyone who claims otherwise is a scammer.

If you do intend to voluntarily donate money as a thank-you **to particular contributors**, refer to [FUNDING.md](https://git.opengrind.org/open-grind/open-grind/src/branch/main/FUNDING.md) file to find a list of donation links for each individual contributor.

Donations are optional, won't grant any privileges, and **there is no single governance entity that accepts donations on Open Grind's behalf.**

:::

::: details How many users does Open Grind have?

We genuinely have no idea, and it's a good thing: there are exactly zero trackers, analytics, data collection in the app. There is no "ping", no "install counter", nothing that reports back that you exist; Grindr can't infer that either because Open Grind strives to be stealthy and mask itself in the official app disguise.

The only indirect counters are:

1. Download count on Releases page
   - It **does not track IP address**, it's a simple integer counter that is increased each time someone sends the HTTP request to download the file. Nothing about the request is logged or stored.
2. Number of joined accounts in the official discussion venues
   - Such as number of participants in the official Matrix chat room (no limit on how many accounts a person can have or which homeservers they join from)
   - Number of registered users on git.opengrind.org (**IP addresses are not stored**)
   - Keep in mind these platforms do not collect or store any personally identifiable data about users

Open Grind has opt-in auto-updater that sends an anonymous request to git.opengrind.org, but these requests are not logged or stored. If you installed the app from F-Droid, Obtainium, Aurora Store or Google Play, the auto-updater is disabled entirely and this does not apply to you. The first-run screen presents this choice with the checkbox pre-checked, nothing is sent until you confirm, and you can change it any time in Settings → App.

**As of September 1st, 2026, the estimated number of users is ~67 000 based on the downloads counter.**

:::

## Open Grind features

::: details Is Open Grind similar to GrindrPlus?

**Open Grind is not affiliated with GrindrPlus.** GrindrPlus project is dead after the developers shut down all resources in May 2026. There is no support for GrindrPlus installation issues in this chat.

GrindrPlus was a modified version of Grindr application. Open Grind is a completely separate third-party client that's written from scratch. Any features from Grindr's official app have to be developed from scratch in the app, but that also means no patches are necessary to remove bloat from the official version.

Open Grind is completely free, open source and transparent: no ads, no purchases, no trackers, licensed under MIT software license. **Open Grind is not a fork.** However, many projects started from Open Grind's foundation and some are considered forks _of_ Open Grind.

:::

::: details What about other apps such as Free Grind and GrindrX?

These are forks of Open Grind building upon its foundation. Neither are affiliated/verified/endorsed by Open Grind developers. All third-party clients put your personal sensitive information at risk. Avoid using Grindr clients that weren't audited independently, as they might contain spyware.

Open Grind is 100% transparent and has [reproducible builds](https://git.opengrind.org/open-grind/open-grind/src/branch/main/REPRODUCIBILITY.md), so each published release can be proved to have been built from a given publicly available code snapshot.

:::

::: details Is Open Grind a new platform? Is Open Grind similar to Grindr Web? What's MVP?

Grindr Web is a client application, it's what allows you to access Grindr, i.e. its interface. Open Grind is a client application too. MVP is just a version type, i.e. v0.1.0, defining bare minimum functionality for daily Grindr use.

It's not possible to run Open Grind in a web browser. There's a **[Grindr Web Unlock](https://git.opengrind.org/open-grind/grindr-web-unlock) project** by Open Grind developers (available for all browsers), that puts best efforts to remove client-side paywalls on web.grindr.com, but does have some known issues and limitations.

:::

::: details Is location spoofing possible? Can you fake your geolocation?

Yes, it's built-in. You must explicitly choose a location before you can use Open Grind. On mobile platforms you can also auto-update your location in real time using your device's GPS.

See [Location spoofing](/guides/features/location-spoofing-teleport)

:::

::: details Is it possible to bypass age verification?

**Open Grind does not implement age verification flow and does not have any means of bypassing it. There will be no attempt at integrating any logic related to age verification in the app.** If your account was locked due to age verification laws, you're advised to download the official app once and complete verification there.

If you're unable to comply with the age verification laws because you're underage, you're strongly advised against attempting to bypass it or manifesting in any public communities or forums affiliated with Open Grind.

:::

::: details Does Open Grind bypass bans?

There are no features that aim specifically at bypassing account bans in Open Grind. However, some Open Grind features indirectly assist in this, such as random device id and zero trackers to link multiple accounts to single person.

:::

::: details How to create an account?

Currently not possible. Follow [#21](https://git.opengrind.org/open-grind/open-grind/issues/21) for updates. Use the official app to create an account and then sign in to Open Grind.

:::

::: details How to sign in with Google?

See https://opengrind.org/guides/sign-in-with-google

:::

::: details How to sign in with Facebook?

Currently not possible. Follow [#88](https://git.opengrind.org/open-grind/open-grind/issues/88) for updates.

:::

::: details How to sign in with a phone number?

Currently not possible. Track https://git.opengrind.org/open-grind/open-grind/issues/29 to follow updates.

:::

::: details Are there any AI features in Open Grind?

No, and likely will never be.

:::

## Open Grind development

::: details How can I help development?

- **Developers, testers, reverse engineering devs:** Get involved and [contribute code](https://git.opengrind.org/open-grind/open-grind/src/branch/main/CONTRIBUTING.md).
- **Everyone else:** Spread the word. Share the link to Open Grind. Tell your friends about it.

:::

::: details What are the community rules for discussion chat rooms?

See [CODE\_OF\_CONDUCT.md](https://git.opengrind.org/open-grind/open-grind/src/branch/main/CODE_OF_CONDUCT.md)

:::

::: details Is it possible to customize colors of the UI?

Currently not possible. Follow [#230](https://git.opengrind.org/open-grind/open-grind/issues/230) for updates.

:::

## Common issues & other questions

::: details Cascade shows nearby people mixed with some profiles far away.

That's how items are returned from API, specifically the first ten are "open" and then there's only profileId, which a client can fetch in bulk. UX improvements are planned for this issue but not in the works yet.

Follow [#149](https://git.opengrind.org/open-grind/open-grind/issues/149) and [#150](https://git.opengrind.org/open-grind/open-grind/issues/150) for updates.

:::

::: details Is GrindrPlus Discord server gone?

Yes, it's been confirmed that it's been deleted. In its last weeks, the server was mostly off topic anyway. Any intel regarding Grindr API is welcome in Open Grind's [#dev:opengrind.org](https://matrix.to/#/#dev:opengrind.org).

:::

::: details How to verify a certain build is safe and trusted?

Releases are signed with [minisign](https://jedisct1.github.io/minisign/) and ship a detached `.minisig`. The release signing key, and the governance PGP key that certifies it, can be found in [KEYS.md](https://git.opengrind.org/open-grind/open-grind/src/branch/main/KEYS.md).

You can also [reproduce the build](https://git.opengrind.org/open-grind/open-grind/src/branch/main/BUILDING.md#verify-android-release) to verify it came from this source.

:::
