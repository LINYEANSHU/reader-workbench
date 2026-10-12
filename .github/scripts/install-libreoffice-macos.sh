#!/usr/bin/env bash
set -euo pipefail

version=26.2.5
case "$(uname -m)" in
  arm64) folder=aarch64; arch=aarch64; sha256=c99fb4fe574437fc4cb820a4ca15271bca325920861f7139858b36d7f9df78ad ;;
  x86_64) folder=x86_64; arch=x86-64; sha256=e26180298685274b54aa7fe6e1101c65465a372f457a6748ebd642720811db36 ;;
  *) echo 'Unsupported macOS architecture' >&2; exit 1 ;;
esac

image="${RUNNER_TEMP:?}/reader-libreoffice.dmg"
mount="${RUNNER_TEMP}/reader-libreoffice-mount"
curl --fail --location --retry 3 \
  "https://download.documentfoundation.org/libreoffice/stable/${version}/mac/${folder}/LibreOffice_${version}_MacOS_${arch}.dmg" \
  --output "$image"
printf '%s  %s\n' "$sha256" "$image" | shasum -a 256 --check
mkdir -p "$mount"
hdiutil attach "$image" -readonly -nobrowse -mountpoint "$mount"
trap 'hdiutil detach "$mount"' EXIT
ditto "$mount/LibreOffice.app" /Applications/LibreOffice.app
echo 'READER_LIBREOFFICE=/Applications/LibreOffice.app/Contents/MacOS/soffice' >> "${GITHUB_ENV:?}"
/Applications/LibreOffice.app/Contents/MacOS/soffice --version
