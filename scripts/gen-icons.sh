#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

XCRUN=(/usr/bin/env -u DEVELOPER_DIR -u SDKROOT /usr/bin/xcrun)
if [[ "$(uname)" != Darwin ]] || ! "${XCRUN[@]}" --find actool >/dev/null 2>&1; then
  echo "gen-icons needs macOS with Xcode 26 or later to compile the Liquid Glass icon" >&2
  exit 1
fi

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

# Notification small icon: Material's 24dp frame with a 20dp live area, so the
# mark fills the status bar instead of the launcher icon's adaptive safe zone
bun scripts/svg-to-android-vector.ts \
  contrib/logo/app-foreground-icon.svg \
  "$RES/drawable/ic_notification.xml" \
  --width 24 --height 24 --scale 1.6414 \
  --translate-x 0.82 --translate-y -46.78 --mono '#FFFFFF'

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

# macOS: actool output differs between runs, so the compiled icon is committed
cp contrib/logo/app-icon.svg contrib/logo/AppIcon.icon/Assets/mark.svg
minimum=$(bun -e 'console.log((await Bun.file("src-tauri/tauri.conf.json").json()).bundle.macOS.minimumSystemVersion)')
catalog=$(mktemp -d)
trap 'rm -rf "$catalog"' EXIT
"${XCRUN[@]}" actool "$PWD/contrib/logo/AppIcon.icon" --compile "$catalog" \
  --output-format human-readable-text --errors --warnings \
  --output-partial-info-plist "$catalog/Info.plist" \
  --app-icon AppIcon --include-all-app-icons \
  --platform macosx --target-device mac --minimum-deployment-target "$minimum"
cp "$catalog/Assets.car" src-tauri/icons/Assets.car
cp "$catalog/AppIcon.icns" src-tauri/icons/icon.icns
