# Build resources

Place your app icons here before running `electron-build.sh`:

- `icon.png` — 1024×1024 PNG (used for Linux + as the source for other formats)
- `icon.icns` — macOS icon bundle
- `icon.ico` — Windows icon

Generate them from a single 1024×1024 PNG with:

```bash
# macOS
mkdir icon.iconset
for size in 16 32 64 128 256 512 1024; do
  sips -z $size $size icon.png --out icon.iconset/icon_${size}x${size}.png
done
iconutil -c icns icon.iconset -o icon.icns

# Windows (requires imagemagick)
convert icon.png -resize 256x256 icon.ico
```

If these files are missing, electron-builder will fall back to its default icon.
