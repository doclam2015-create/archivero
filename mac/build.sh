#!/bin/zsh
# Compila Archivero.app, la instala en /Applications y la deja en el Dock
set -e
cd "$(dirname "$0")/.."
B=build; APP="${TMPDIR:-/tmp}/archivero-build/Archivero.app"; mkdir -p "$(dirname "$APP")"
mkdir -p "$B"
swiftc -O mac/icon.swift -o "$B/icongen" && "$B/icongen" "$B"
rm -rf "$B/AppIcon.iconset" "$APP"; mkdir -p "$B/AppIcon.iconset"
for s in 16 32 128 256 512; do
  sips -z $s $s "$B/icon-mac-1024.png" --out "$B/AppIcon.iconset/icon_${s}x${s}.png" >/dev/null
  d=$((s*2)); sips -z $d $d "$B/icon-mac-1024.png" --out "$B/AppIcon.iconset/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$B/AppIcon.iconset" -o "$B/AppIcon.icns"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
swiftc -O mac/main.swift -o "$APP/Contents/MacOS/Archivero" -target arm64-apple-macos13.0
cp mac/Info.plist "$APP/Contents/Info.plist"
cp index.html manifest.webmanifest icon-192.png icon-512.png apple-touch-icon.png "$APP/Contents/Resources/"
cp -R js lib "$APP/Contents/Resources/"
cp "$B/AppIcon.icns" "$APP/Contents/Resources/AppIcon.icns"
xattr -cr "$APP"
codesign --force --deep --sign - "$APP"
rm -rf "/Applications/Archivero.app"
cp -R "$APP" /Applications/
# agregar al Dock si no está
if ! defaults read com.apple.dock persistent-apps | grep -q "Archivero.app"; then
  defaults write com.apple.dock persistent-apps -array-add "<dict><key>tile-data</key><dict><key>file-data</key><dict><key>_CFURLString</key><string>file:///Applications/Archivero.app/</string><key>_CFURLStringType</key><integer>15</integer></dict></dict></dict>"
  killall Dock
fi
echo "Instalada en /Applications/Archivero.app"
