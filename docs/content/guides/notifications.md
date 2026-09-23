---
prev: false
next: false
title: "Notifications"
---

# Notifications

Open Grind supports the following notification categories in Grindr:

- **New messages**
- **Received taps**

To enable notifications, go to **App Settings → Notifications**. Support varies by platform.

## Android

On Android, choose one of two modes: [Slow mode](#android-slow-mode) (default) or [Fast mode](#android-fast-mode) (recommended).

To change alert level, sound, whether text of the notification appears on the lock screen, change settings in Android system settings directly.

### Slow mode {#android-slow-mode}

Slow mode is the default notifications mode on Android. Open Grind checks for new events in the background **about every 15 minutes**. Android may force the interval to be longer, for example in battery saver or when you haven't opened the app for a while.

### Fast mode {#android-fast-mode}

Fast mode on Android **shows notifications instantly**, but uses closed-source Google's Firebase services, which requires installing Open Grind's [FCM service add-on](#installing-the-fcm-service) and having Google Play services or microG.

To enable the fast mode:

1. Choose "Fast mode" in Notifications settings
2. Tap "Continue"
   - If your version of Open Grind allows direct add-on downloads, it will be downloaded & installed automatically, in which case you can skip the remaining steps
   - Otherwise (e.g. when Open Grind was downloaded from F-Droid or Google Play), download and install the add-on manually:
3. Open [fcm-service add-on releases](https://git.opengrind.org/open-grind/fcm-service/releases) page
4. Download `open-grind-fcm-service-<version>-android.apk` and open it; Android asks your browser for permission to install apps once
5. Return to Open Grind and choose "Fast mode" again

## Windows

Not supported yet. See [#384](https://git.opengrind.org/open-grind/open-grind/issues/384).

## macOS

Not supported yet. See [#385](https://git.opengrind.org/open-grind/open-grind/issues/385).

## Linux

Not supported yet. See [#386](https://git.opengrind.org/open-grind/open-grind/issues/386).
