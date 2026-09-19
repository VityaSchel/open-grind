# Notifications

Open Grind delivers notifications two ways. Choose one in **Settings → App → Notifications**.

**Battery-friendly** works everywhere and needs nothing extra. Android decides when Open Grind may check for new messages: roughly every 15 minutes while you keep using the app, and hours apart once you stop.

**Instant** delivers each message as it arrives. It needs the Open Grind FCM service add-on, and Google Play services or microG on your device.

## Installing the FCM service

Open Grind offers to install the add-on when you choose Instant. Some builds can't install other apps — Google Play builds, and builds you or someone else signed. Install it yourself instead:

1. Open [FCM service releases](https://git.opengrind.org/open-grind/fcm-service/releases) in your browser
2. Download `open-grind-fcm-service-<version>-android.apk` and open it; Android asks your browser for permission to install apps once
3. Return to Open Grind and choose **Instant** again

The add-on has no screens of its own — it receives messages and hands them to Open Grind, which decides what to show.

## Verifying the download

Each release ships a `.minisig` signature next to the APK. To check it:

```sh
minisign -Vm open-grind-fcm-service-<version>-android.apk \
  -P RWReleaseOpenGrindurRQcmR+NovOaU5IEU3LM5l6TcXJvOGYw2m4O+
```

## Lock screen

Open Grind doesn't decide whether message text appears on your lock screen — Android does. Change it in **Android Settings → Notifications → Notifications on lock screen**.
