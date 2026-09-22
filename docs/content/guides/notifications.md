---
prev: false
next: false
title: "Notifications"
---

# Notifications

Open Grind can notify you about new messages and taps on Android. Notifications are off until you turn them on: tap your photo in the bottom bar, then **App Settings → Notifications**.

## Turning notifications on and off

Turn on **Enable notifications**. On Android 13 and newer, Android asks for permission the first time. The switch turns on only after you allow it, and the rest of the screen stays disabled until then. If you refuse twice, Android stops asking, and the switch then opens Android's notification settings for Open Grind instead.

On older Android versions notifications are allowed by default, so the switch turns on right away. If you've blocked notifications for Open Grind, it opens Android's notification settings instead.

Turning the switch off stops both delivery modes and clears the notifications Open Grind has shown. In Fast mode it also unregisters from push with Grindr.

If you take the notification permission away from Open Grind in Android settings, Open Grind turns its switch off when you come back to it. Allowing notifications again in Android settings doesn't turn the switch back on. Use the switch.

## Delivery

|                                   | Fast mode                                                  | Slow mode                                          |
| --------------------------------- | ---------------------------------------------------------- | -------------------------------------------------- |
| Needs                             | The FCM service add-on, and Google Play services or microG | Nothing extra                                      |
| New messages and taps             | As they arrive                                             | About every 15 minutes, or later                   |
| A chat you read on another device | Its notification disappears when Grindr withdraws it       | Its notification disappears at the next check      |
| A message the sender unsends      | Disappears from the notification when Grindr withdraws it  | Stays until the next check after you read the chat |

In both modes each chat gets one notification with its recent messages, up to the last 8. Tapping it opens the chat. Tapping a tap notification opens your taps.

Neither mode shows notifications while Open Grind is open.

### Fast mode

Fast mode needs the [FCM service add-on](#installing-the-fcm-service) and Google Play services or microG. When you choose it, Open Grind registers for push with Grindr first and selects Fast mode only after that works. If registering fails, it stays in Slow mode and shows an error. **Copy details** on the error says why.

If Fast mode stops working, for example because the add-on was uninstalled or disabled, Open Grind switches to Slow mode the next time you open it and shows an error. **Copy details** on the error says why.

### Slow mode

Slow mode is the default. Open Grind checks for new messages and taps in the background about every 15 minutes while the device is online. Android may wait longer, for example in battery saver or when you haven't opened the app for a while.

Each check shows the latest message in every chat with unread messages, as your inbox reports it. If someone sends several messages between two checks, you see only the last one. Muted chats are skipped.

## Categories

- **New messages** can't be turned off in Open Grind. Turn it off in Android settings instead.
- **Received taps** can be turned off in Open Grind. Turning it off also clears the tap notifications already shown. Open Grind keeps this switch in sync with the tap notification setting in your Grindr account.

Android keeps its own switch for each category in **Android Settings → Apps → Open Grind → Notifications**. When a category is off there, Open Grind shows it as off, and turning it on in Open Grind opens Android's settings for that category so you can allow it.

## Installing the FCM service

When you choose Fast mode without the add-on, Open Grind asks you to download it. Tap **Continue**: Open Grind downloads the add-on, checks its signature, installs it and then turns on Fast mode.

Google Play builds, and builds you or someone else signed, can't install other apps. On those, **Continue** opens these steps or the add-on's download page in your browser. To install it yourself:

1. Open [FCM service releases](https://git.opengrind.org/open-grind/fcm-service/releases) in your browser
2. Download `open-grind-fcm-service-<version>-android.apk` and open it; Android asks your browser for permission to install apps once
3. Return to Open Grind and choose **Fast mode** again

The add-on has no screens of its own. It receives pushes from Google and hands them to Open Grind, which decides what to show. It contains Google's proprietary Firebase library, which is why it's a separate app.

## Verifying the download

Each release ships a `.minisig` signature next to the APK. To check it:

```sh
minisign -Vm open-grind-fcm-service-<version>-android.apk \
  -P RWReleaseOpenGrindurRQcmR+NovOaU5IEU3LM5l6TcXJvOGYw2m4O+
```

## Lock screen

Android, not Open Grind, decides whether message text appears on your lock screen. Change it in **Android Settings → Notifications → Notifications on lock screen**.
