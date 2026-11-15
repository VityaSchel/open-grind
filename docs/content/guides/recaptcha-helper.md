---
prev: false
next: false
title: 'reCAPTCHA helper'
---

# reCAPTCHA helper

Grindr asks some accounts for a captcha check when they sign in with email and password. On Android, Open Grind passes this check through the reCAPTCHA helper add-on. The add-on includes Google's proprietary reCAPTCHA library, so it's not part of Open Grind.

Grindr answers a wrong password and a missing captcha with the same error, so Open Grind offers the add-on after any refused sign-in. Check your email and password first.

## Requirements

- Android with Google Play services; microG isn't enough
- The official Grindr app installed; you don't need to sign in to it

Windows, Linux, macOS and iOS can't pass the captcha check.

## Install

1. Enter your email and password, then tap "Sign in"
2. If Grindr refuses the sign-in, Open Grind asks to install the add-on. Tap "Continue" and confirm Android's install prompt
3. Tap "Sign in" again

Alternatively, install it [manually](#installed-from-google-play).

The add-on has no icon on the home screen. To remove it, uninstall "Open Grind reCAPTCHA helper" in Android settings.

### Installed from Google Play

Open Grind from Google Play can't install other apps, so install the add-on yourself:

1. Open [reCAPTCHA helper releases](https://git.opengrind.org/open-grind/recaptcha-helper/releases) in your browser
2. Download `open-grind-recaptcha-helper-<version>-android.apk` and open it; Android asks your browser for permission to install apps once
3. Return to Open Grind and tap "Sign in" again

## If sign-in still fails

- **"Wrong email or password, or Grindr rejected the reCAPTCHA helper's check"**: sign in to the official Grindr app with the same email and password. If that works, Grindr rejected the check.
- **"Grindr rejected the reCAPTCHA helper's check"**: Grindr didn't accept the captcha score Google gave your device.
- **"The reCAPTCHA helper needs the official Grindr app installed"**: install Grindr from Google Play.

Grindr can reject the check even with the add-on installed. It passes more often on a phone with Google Play services, a locked bootloader and no root.

## Privacy

Each time Grindr asks for a captcha, the add-on sends device information to Google. See the [privacy policy](/privacy).
