# Notifications

Notifications are off until you turn them on, in **Settings → App → Notifications**. Android asks for permission the first time; the switch stays off while the dialog is open and turns on only once you allow it. Everything else on the screen stays disabled until then.

If you refuse twice, Android stops asking. The switch then takes you to Android's notification screen for Open Grind, where you can allow them.

Turning the switch off stops everything at once: Open Grind unregisters from push, cancels the background poll, and shows nothing that arrives afterwards. Notifications Grindr withdraws — an unsent message, a chat you have read elsewhere — still disappear from your shade.

Turning the permission back on in Android settings doesn't turn notifications back on in Open Grind. Use the switch.

## Delivery

**Fast mode** delivers each message as it arrives. It needs the Open Grind FCM service add-on, and Google Play services or microG on your device.

**Slow mode** works everywhere and needs nothing extra. Android decides when Open Grind may check for new messages: roughly every 15 minutes while you keep using the app, and hours apart once you stop.

## Categories

Each kind of notification has its own switch. Turning one off stops Open Grind showing it, in both delivery modes.

Android keeps its own switch per category, in **Android Settings → Apps → Open Grind → Notifications**. Android's wins: if you turn a category off there, Open Grind cannot turn it back on, and the in-app switch shows it as blocked with a link to the system screen.

## Installing the FCM service

Open Grind offers to install the add-on when you choose Fast mode. Some builds can't install other apps — Google Play builds, and builds you or someone else signed. Install it yourself instead:

1. Open [FCM service releases](https://git.opengrind.org/open-grind/fcm-service/releases) in your browser
2. Download `open-grind-fcm-service-<version>-android.apk` and open it; Android asks your browser for permission to install apps once
3. Return to Open Grind and choose **Fast mode** again

The add-on has no screens of its own — it receives messages and hands them to Open Grind, which decides what to show.

## Verifying the download

Each release ships a `.minisig` signature next to the APK. To check it:

```sh
minisign -Vm open-grind-fcm-service-<version>-android.apk \
  -P RWReleaseOpenGrindurRQcmR+NovOaU5IEU3LM5l6TcXJvOGYw2m4O+
```

## Lock screen

Open Grind doesn't decide whether message text appears on your lock screen — Android does. Change it in **Android Settings → Notifications → Notifications on lock screen**.
