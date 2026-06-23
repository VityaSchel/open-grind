#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

RES="src-tauri/gen/android/app/src/main/res"

# Desktop + iOS icons
bun tauri icon ./contrib/logo/app-icon.svg --ios-color='#0A0A0A'

# Android
rm -f "$RES"/mipmap-*dpi/ic_launcher.png \
      "$RES"/mipmap-*dpi/ic_launcher_round.png \
      "$RES"/mipmap-*dpi/ic_launcher_foreground.png \
      "$RES"/mipmap-anydpi-v26/ic_launcher_round.xml \
      "$RES"/drawable-v24/ic_launcher_foreground.xml \
      "$RES"/drawable/ic_launcher_background.xml
rmdir "$RES"/mipmap-mdpi "$RES"/mipmap-hdpi "$RES"/mipmap-xhdpi \
      "$RES"/mipmap-xxhdpi "$RES"/mipmap-xxxhdpi "$RES"/drawable-v24 2>/dev/null || true

mkdir -p "$RES/drawable"

# Foreground vector
bun scripts/svg-to-android-vector.ts \
  contrib/logo/app-foreground-icon.svg \
  "$RES/drawable/ic_launcher_foreground.xml" \
  --width 108 --height 108 --scale 0.832

# Monochrome icons
bun scripts/svg-to-android-vector.ts \
  contrib/logo/app-foreground-icon.svg \
  "$RES/drawable/ic_launcher_monochrome.xml" \
  --width 108 --height 108 --scale 0.832 --mono '#FFFFFF'

# Adaptive icon
cat > "$RES/mipmap-anydpi-v26/ic_launcher.xml" <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <foreground android:drawable="@drawable/ic_launcher_foreground"/>
  <background android:drawable="@color/ic_launcher_background"/>
  <monochrome android:drawable="@drawable/ic_launcher_monochrome"/>
</adaptive-icon>
XML

cat > "$RES/values/ic_launcher_background.xml" <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<resources>
  <color name="ic_launcher_background">#0A0A0A</color>
</resources>
XML

cp contrib/logo/icon.icns src-tauri/icons/icon.icns
