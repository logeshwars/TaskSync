# Logo & Favicon Setup

## Files Created

- **`logo.svg`** - Full logo for your project (use on landing page, GitHub, documentation)
- **`favicon.svg`** - Favicon for browser tabs and bookmarks

## How to Use

### In HTML
Add this to your `<head>` section:

```html
<!-- Favicon -->
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="shortcut icon" href="/favicon.ico">

<!-- Logo on your page -->
<img src="/logo.svg" alt="Task Manager" width="200" height="200">
```

### Design System
- **Primary Color**: `#0052cc` (Professional Blue)
- **Secondary Color**: `#0039a6` (Deep Blue)
- **Accent**: `#e8eef7` (Soft Blue Gray)
- **Font Recommendation**: Use a modern, professional sans-serif (e.g., Inter, Segoe UI, -apple-system)

## Converting to favicon.ico (Optional)

If you need `.ico` format for older browsers:

1. **Using online converter**: Upload `favicon.svg` to [convertio.co](https://convertio.co/svg-ico/)
2. **Using ImageMagick**:
   ```bash
   convert favicon.svg -define icon:auto-resize=64,48,32,16 favicon.ico
   ```
3. **Using ffmpeg**:
   ```bash
   ffmpeg -i favicon.svg -o favicon.ico
   ```

## Customization Tips

- **Logo**: Edit colors in the `<linearGradient>` elements to match your brand
- **Favicon**: Keep it simple - the clean checkmark + list design works at any size
- **Scalability**: Both files are SVG format, so they scale perfectly to any resolution

Enjoy your new branding! 🎨
