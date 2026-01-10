# EditTrax Design System

Portable design system package for the EditTrax/Arweave Video Generator visual identity.

## Contents

- **STYLE_GUIDE.md** - Complete style guide and implementation specification
- **fonts/** - Mathias font family (TTF format)
- **logos/** - All brand assets and logo files

## Quick Start

1. Copy this entire folder to your new repository
2. Read `STYLE_GUIDE.md` for complete implementation details
3. Reference the assets in your project:
   - Fonts: `./fonts/mathias-bold.ttf`
   - Logos: `./logos/logo.svg` (or other variants)

## Font Installation

### CSS @font-face

```css
@font-face {
  font-family: "Mathias";
  src: url('./fonts/mathias-bold.ttf') format('truetype');
  font-weight: bold;
  font-style: normal;
  font-display: swap;
}
```

### Tailwind Config

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      fontFamily: {
        'mathias': ['"Mathias"', 'sans-serif'],
      },
    },
  },
}
```

## Logo Files

- **logo.svg** - Primary logo (vector, scalable)
- **color_bar.png** - Top border accent (5px height, full width)
- **et_horizontal.png** - Horizontal logo variant
- **et_new_logo.png** - Alternative logo variant
- **homepage_bg.png** - Background image (if needed)
- **load.gif** - Loading animation
- **og_img.jpg** - Open Graph image

## Color Palette

Primary colors (from style guide):
- **Yellow-75:** `#E6E9E0` - Primary accent
- **Black:** `#000000` - Base background
- **Green:** `#10b981` - Success/selected states
- **Red:** `#ef4444` - Error/destructive actions

See `STYLE_GUIDE.md` for complete color system.

## Implementation

Follow the step-by-step checklist in `STYLE_GUIDE.md` section 10 for implementation guidance.

## Framework Support

The style guide includes translation notes for:
- Tailwind CSS
- CSS Modules
- Styled Components
- Vanilla CSS
- Design Tokens (JSON)

## License

Check with project maintainers for font and logo licensing.

---

**Version:** 1.0  
**Last Updated:** 2025-01-27
