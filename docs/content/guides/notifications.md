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

On Android, choose one of two modes: [Slow Mode](#android-slow-mode) (default) or [Fast Mode](#android-fast-mode) (recommended).

To change alert level, sound, whether text of the notification appears on the lock screen, change settings in Android system settings directly.

### Slow Mode {#android-slow-mode}

Slow Mode is the default notifications mode on Android. Open Grind checks for new events in the background **about every 15 minutes**. Android may force the interval to be longer, for example in battery saver or when you haven't opened the app for a while.

Slow Mode doesn't notify about received taps, because Grindr marks you online every time an app checks for them. Use [Fast Mode](#android-fast-mode) to get tap notifications.

### Fast Mode {#android-fast-mode}

Fast Mode on Android **shows notifications instantly**. Tap "Configure" under "Fast Mode" in Notifications settings to choose how notifications arrive: through the [FCM service add-on](#android-fcm-service-add-on) or through [fcm-relay + UnifiedPush](#android-fcm-relay). Once one is set up, that button reads "FCM service" or "fcm-relay" instead.

#### FCM service add-on {#android-fcm-service-add-on}

The add-on uses closed-source Google's Firebase services, which requires installing Open Grind's [FCM service add-on](https://git.opengrind.org/open-grind/fcm-service) and having Google Play services or microG.

To enable Fast Mode with the add-on:

1. Tap the button under "Fast Mode" in Notifications settings
2. Choose "FCM service add-on" and tap "Continue"
   - If your version of Open Grind allows direct add-on downloads, it will be downloaded & installed automatically, in which case you can skip the remaining steps
   - Otherwise (e.g. when Open Grind was installed from Google Play), download and install the add-on manually:
3. Open [fcm-service add-on releases](https://git.opengrind.org/open-grind/fcm-service/releases) page
4. Download `open-grind-fcm-service-<version>-android.apk` and open it; Android asks your browser for permission to install apps once
5. Return to Open Grind and choose "FCM service add-on" again to turn Fast Mode on

#### fcm-relay + UnifiedPush {#android-fcm-relay}

For advanced users. Notifications come from your own fcm-relay through a UnifiedPush distributor, without Google Play services or microG on the phone.

Requirements:

- A [UnifiedPush distributor](https://unifiedpush.org/users/distributors/) app, such as [ntfy](https://unifiedpush.org/users/distributors/ntfy/), installed and set up first
- A self-hosted [fcm-relay](https://git.opengrind.org/open-grind/fcm-relay) 1.1.0 or newer, one per Grindr account

To enable Fast Mode with fcm-relay:

1. Tap the button under "Fast Mode" in Notifications settings
2. Choose "fcm-relay + UnifiedPush"
3. If Android asks, choose your distributor
4. Tap "Save" or "Share" to get `config.json`
5. Put it where fcm-relay reads its config (see [fcm-relay's usage](https://git.opengrind.org/open-grind/fcm-relay#usage)) and restart fcm-relay
6. Tap "Done"
7. Find `verification code 123-456` in the fcm-relay log and type the code in Open Grind

Notes:

- A new config is needed after signing out, switching accounts, reinstalling Open Grind, changing the distributor or losing fcm-relay's `state.json`. Open Grind switches to Slow Mode until you configure fcm-relay + UnifiedPush again.
- `config.json` contains private keys. Copy it to the fcm-relay machine directly, not through chats or cloud services.
- Notifications about received taps work, as with the add-on.

## Windows

Notifications only arrive when Open Grind is running.

To change the banners, sound or lock screen previews, go to Settings → System → Notifications → Open Grind.

## macOS

Notifications only arrive when Open Grind is running.

To change the alert style, sound or previews, go to System Settings → Notifications → Open Grind.

## Linux

Open Grind shows notifications through your desktop's notification service. GNOME, KDE Plasma and most other desktops work out of the box. On a standalone window manager, install a notification service, such as [dunst](https://dunst-project.org/) or [mako](https://github.com/emersion/mako) manually.

Notifications only arrive when Open Grind is running.

To change how notifications look or sound, use your desktop's notification settings.
