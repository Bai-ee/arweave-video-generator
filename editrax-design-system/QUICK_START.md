# Quick Start Guide

## Copy to New Repository

```bash
# Copy the entire folder
cp -r editrax-design-system /path/to/new-repo/

# Or if you're in the new repo
cp -r /path/to/editrax-design-system ./
```

## File Structure

```
editrax-design-system/
├── README.md              # Overview and quick reference
├── QUICK_START.md         # This file
├── STYLE_GUIDE.md         # Complete implementation spec
├── fonts/
│   └── mathias-bold.ttf   # Primary font file
└── logos/
    ├── logo.svg           # Primary logo (vector)
    ├── color_bar.png      # Top border accent
    ├── et_horizontal.png  # Horizontal logo variant
    ├── et_new_logo.png    # Alternative logo
    ├── homepage_bg.png    # Background image
    ├── load.gif          # Loading animation
    └── og_img.jpg        # Open Graph image
```

## Essential CSS Setup

### 1. Font Loading

Add to your main CSS file or `<head>`:

```css
@font-face {
  font-family: "Mathias";
  src: url('./editrax-design-system/fonts/mathias-bold.ttf') format('truetype');
  font-weight: bold;
  font-style: normal;
  font-display: swap;
}
```

### 2. Core CSS Variables

```css
:root {
  /* Colors */
  --color-black: #000000;
  --color-white: #FFFFFF;
  --color-yellow-75: #E6E9E0;
  --accent-long: #10b981;
  --accent-short: #ef4444;
  
  /* Fonts */
  --font-mathias: "Mathias", sans-serif;
  --font-system: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif;
  
  /* Spacing */
  --spacing-2: 0.5rem;
  --spacing-4: 1rem;
  --spacing-6: 1.5rem;
  
  /* Border Radius */
  --radius-button: 10px;
  --radius-card: 12px;
  
  /* Transitions */
  --transition-base: 0.3s ease;
}
```

### 3. Base Background

```css
body {
  background: linear-gradient(180deg, #000000 0%, #0a0a0a 100%);
  color: var(--color-yellow-75);
  font-family: var(--font-system);
}
```

### 4. Particles.js Background (Optional)

```html
<!-- In your HTML -->
<div id="particles-js"></div>

<!-- Before closing </body> -->
<script src="https://cdn.jsdelivr.net/particles.js/2.0.0/particles.min.js"></script>
<script>
  particlesJS('particles-js', {
    particles: {
      number: { value: 50, density: { enable: true, value_area: 800 } },
      color: { value: '#E6E9E0' },
      shape: { type: 'circle' },
      opacity: { value: 0.5, random: true },
      size: { value: 2, random: true },
      line_linked: { enable: false },
      move: { enable: true, speed: 1, direction: 'none', random: false, straight: false, out_mode: 'out', bounce: false }
    },
    interactivity: { detect_on: 'canvas', events: { onhover: { enable: false }, onclick: { enable: false }, resize: true } },
    retina_detect: true
  });
</script>
```

```css
#particles-js {
  position: fixed;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
  z-index: -1;
  background: linear-gradient(180deg, #000000 0%, #0a0a0a 100%);
}
```

## Logo Usage

```html
<!-- Primary Logo -->
<img src="./editrax-design-system/logos/logo.svg" alt="Logo" class="logo-img" />

<!-- Color Bar (Top Border) -->
<img 
  src="./editrax-design-system/logos/color_bar.png" 
  alt="" 
  style="position: fixed; top: 0; left: 0; width: 100%; height: 5px; z-index: 9999; pointer-events: none;"
/>
```

## Button Example

```css
.btn-primary {
  font-family: var(--font-mathias);
  background-color: var(--color-yellow-75);
  color: var(--color-black);
  border: 2px solid var(--color-black);
  border-radius: 10px;
  padding: 1rem 1.5rem;
  font-size: 0.875rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  transition: all 0.3s ease;
  cursor: pointer;
}
```

## Next Steps

1. Read `STYLE_GUIDE.md` for complete specifications
2. Follow the implementation checklist (Section 10)
3. Reference component examples (Section 7)
4. Check framework translation notes (Section 11)

## Common Paths

- **Font:** `./editrax-design-system/fonts/mathias-bold.ttf`
- **Logo:** `./editrax-design-system/logos/logo.svg`
- **Color Bar:** `./editrax-design-system/logos/color_bar.png`

Adjust paths based on your project structure.
