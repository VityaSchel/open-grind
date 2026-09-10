---
prev: false
next: false
title: 'Grindr API bypasses'
---

# Grindr API bypasses

This page documents the history of discovered Grindr API server-side-gated feature bypasses, usually only available for users on paid subscription tiers.

## Honduras Bypass

This workaround was [initially posted by Morbo Morbo (@prixoxi:matrix.org)](https://matrix.to/#/!MNzF_r9RLVXG-Iyr5nPbjds-7-0rIgq1BZdzHXQjshE/$wr4ST-jDlhJjTZS3J7W-gGYKUvTMkWRJYVvBSE62Nl8), [extended by G454 (@g454:matrix.org)](https://matrix.to/#/!MNzF_r9RLVXG-Iyr5nPbjds-7-0rIgq1BZdzHXQjshE/$Q_QO4ogEaBMJ4htbxRdF_QJRUAY-ve4l0enjjfSjWfo), [step by step guide by Incognito (@pandod:matrix.org)](https://matrix.to/#/!MNzF_r9RLVXG-Iyr5nPbjds-7-0rIgq1BZdzHXQjshE/$bSjc6QAejI17MdKibySbMBa6x9iAbH7AJGRrB97XCLs):

1. Set the location to Honduras
2. Close the app in the background
3. Open the app; sending expiring images and unsending messages should work without subscription
4. Change the location back, and you'll still be able to send expiring images and unsend messages
5. Don't close the app (background), this method wil continue to work while the app is open in the backround

[Reported by @lanivani:matrix.org](https://matrix.to/#/!MNzF_r9RLVXG-Iyr5nPbjds-7-0rIgq1BZdzHXQjshE/$X2f7YYG9dL2cXn-Xv6dDYvMD4kXaP8mpQsSuGL7N_uo): Unlimited Expiring Pics, Unlimited Album Share, Unsending Messages also work in Nigeria.

Based on [codexrunner/regrind@9283c764ed](https://git.opengrind.org/codexrunner/regrind/commit/9283c764ed7cfe22c19d4e5709754278db862267), [codexrunner/regrind@3480334447](https://git.opengrind.org/codexrunner/regrind/commit/3480334447705aca27bab14480b688624a464f92): entitlements for a certain session are based on the geohash provided during token refresh. Consists with the app relaunch and bypass enablement during app working in background reports.

## Unsending messages

Attempts to unsend most types of messages without a paid subscription result in the following error with HTTP status 402[^unsending-messages-gate]:

```json
{
  "type": "urn:gr:err:tiered_feature",
  "title": "Feature not available with current subscription",
  "status": 402,
  "traceId": "6aa2d9d80000000018d2609d59f6a30f",
  "detail": "Principal '<USERID>' does not have access to feature 'UnsentMessage'",
  "profileId": <USERID>,
  "featureValue": "UnsentMessage"
}
```

### Honduras bypass (as of September 10th, 2026)

[Honduras bypass](#honduras-bypass) has been confirmed to be working[^unsending-messages-honduras-bypass].

## Expiring images sending limit

Attempts to send more than one expiring image per day result in the following error with HTTP status 402[^expiring-images-limit-gate]:

```json
{
  "type": "urn:gr:err:entitlement_limit",
  "title": "User has reached their entitlement limits",
  "status": 402,
  "traceId": "6a99e7c2000000007131eaa3dc886cbe"
}
```

### Honduras bypass (as of September 10th, 2026)

[Honduras bypass](#honduras-bypass) has been confirmed to be working[^expiring-images-honduras-bypass].

### No enforcement (until ~September 3rd, 2026)

Grindr API did not enforce entitlement check for number of expiring images sent until ~September 3rd, 2026.

## Incognito mode

Attempts to set Incognito server-side profile setting to `true` result in the following error with HTTP status 402[^incognito-gate]:

```json
{
  "type": "urn:gr:err:entitlement_limit",
  "title": "User has reached their entitlement limits",
  "status": 402,
  "traceId": "6aa17f82000000000c5d1ae66be6cb4e"
}
```

**No bypass has been discovered yet.**

### No enforcement (until ~August 17th, 2026)

Grindr API did not enforce entitlement check for Incognito until ~August 17th, 2026.


[^unsending-messages-gate]: https://git.opengrind.org/open-grind/open-grind/issues/319#issuecomment-2448
[^unsending-messages-honduras-bypass]: https://git.opengrind.org/open-grind/open-grind/issues/319#issuecomment-2453
[^expiring-images-limit-gate]: https://git.opengrind.org/open-grind/open-grind/issues/353#issuecomment-2847
[^expiring-images-honduras-bypass]: https://git.opengrind.org/open-grind/open-grind/issues/353#issuecomment-2883
[^incognito-gate]: https://git.opengrind.org/open-grind/open-grind/issues/247#issuecomment-2934
