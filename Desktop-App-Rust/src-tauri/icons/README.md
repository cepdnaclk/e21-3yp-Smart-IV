# Icons

Place your app icons here. Tauri requires the following files:

| File                | Size     | Platform      |
|---------------------|----------|---------------|
| `32x32.png`         | 32×32    | Windows/Linux |
| `128x128.png`       | 128×128  | Windows/Linux |
| `128x128@2x.png`    | 256×256  | macOS retina  |
| `icon.icns`         | Multi    | macOS         |
| `icon.ico`          | Multi    | Windows       |

## How to generate icons from a single PNG

Install the Tauri CLI and run:

```bash
npx tauri icon path/to/your-icon-1024x1024.png
```

This auto-generates all required sizes into this `icons/` folder.

## Quick placeholder (development only)

You can temporarily use any 1024×1024 PNG named `app-icon.png` in the project root and run the command above.
