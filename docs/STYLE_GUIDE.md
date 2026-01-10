# EditTrax / Arweave Video Generator
## Style Guide & Implementation Spec

**Version:** 1.0  
**Last Updated:** 2025-01-27  
**Status:** Canonical Visual System Document

---

## 1. DESIGN OVERVIEW

The EditTrax design system embodies a **cinematic, industrial, lo-fi aesthetic** with a dark, technical foundation. The visual language communicates:

- **Emotional Tone:** Technical precision, underground/warehouse aesthetic, professional yet raw
- **User Perception:** Industrial tool, professional video production interface, no-nonsense utility
- **Core Identity:** Dark backgrounds with high-contrast yellow accents, particle-based depth, radial gradient treatments, and uppercase typography

**Critical Consistency Requirements:**
- Black (#000000) base with subtle gradient depth
- Yellow-75 (#E6E9E0) as the primary accent color (never pure white)
- Mathias font for all headings and UI labels (uppercase, bold)
- Radial gradient treatments on interactive elements
- Particles.js background system (static particles, no interactivity)
- 12px border radius maximum (10px standard)
- Inset shadows for depth, never drop shadows on cards

---

## 2. TYPOGRAPHY SYSTEM

### Primary Font: Mathias

**Font Family:** `"Mathias", sans-serif`  
**Source:** Local font file (`/fonts/mathias-bold.ttf`)  
**Font Weight:** `bold` (700)  
**Font Display:** `swap`

**Fallback Stack:**
```css
font-family: "Mathias", sans-serif;
```

**Usage:**
- All headings (H1-H6)
- All button text
- All UI labels and section headers
- Status indicators
- Table headers
- Modal titles
- Accordion triggers

**Typography Rules:**
- **Text Transform:** `uppercase` (all headings, buttons, labels)
- **Letter Spacing:** `0.05em` (standard), `0.08em` (headings/labels)
- **Font Size:** See usage table below

### Secondary Font: System Stack

**Font Family:**
```css
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif;
```

**Usage:**
- Body text
- Form inputs
- Table cell content
- Helper text
- Descriptions
- Metadata

### Typography Scale

| Element | Font Family | Font Size | Line Height | Letter Spacing | Text Transform | Weight |
|---------|-------------|-----------|-------------|----------------|---------------|--------|
| H1 | Mathias | 1.8rem (28.8px) | 1.2 | 0.08em | uppercase | bold |
| H2 | Mathias | 1.5rem (24px) | 1.3 | 0.08em | uppercase | bold |
| H3 | Mathias | 1.25rem (20px) | 1.3 | 0.08em | uppercase | bold |
| H4 | Mathias | 1.15rem (18.4px) | 1.4 | 0.08em | uppercase | bold |
| H5 | Mathias | 1rem (16px) | 1.4 | 0.08em | uppercase | bold |
| H6 | Mathias | 0.95rem (15.2px) | 1.4 | 0.08em | uppercase | bold |
| Body | System | 1rem (16px) | 1.5 | 0.01em | none | normal |
| Body Small | System | 0.9rem (14.4px) | 1.45 | 0.01em | none | normal |
| Button | Mathias | 0.875rem (14px) | 1.2 | 0.05em | uppercase | bold |
| Button Small | Mathias | 0.75rem (12px) | 1.2 | 0.05em | uppercase | bold |
| Label/Heading | Mathias | 0.9rem (14.4px) | 1.3 | 0.08em | uppercase | bold |
| Eyebrow | Mathias | 0.75rem (12px) | 1.3 | 0.08em | uppercase | normal |
| Helper Text | System | 0.85rem (13.6px) | 1.4 | 0.01em | none | normal |
| Table Header | Mathias | 0.95rem (15.2px) | 1.3 | 0.1em | uppercase | bold |
| Table Cell | System | 0.95rem (15.2px) | 1.4 | 0.01em | none | normal |
| Status Indicator | Mathias | 0.7rem (11.2px) | 1.2 | 0.05em | uppercase | bold |

### CSS Variables

```css
:root {
  --font-mathias: "Mathias", sans-serif;
  --font-heading: "Mathias", sans-serif;
  --font-system: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif;
  --font-body: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif;
}
```

### Tailwind Configuration

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      fontFamily: {
        'mathias': ['"Mathias"', 'sans-serif'],
        'system': ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', '"Fira Sans"', '"Droid Sans"', '"Helvetica Neue"', 'sans-serif'],
      },
      fontSize: {
        'eyebrow': ['0.75rem', { lineHeight: '1.3', letterSpacing: '0.08em' }],
        'button': ['0.875rem', { lineHeight: '1.2', letterSpacing: '0.05em' }],
        'label': ['0.9rem', { lineHeight: '1.3', letterSpacing: '0.08em' }],
      },
    },
  },
}
```

### Font Loading

```html
@font-face {
  font-family: "Mathias";
  src: url('./fonts/mathias-bold.ttf') format('truetype');
  font-weight: bold;
  font-style: normal;
  font-display: swap;
}
```

---

## 3. COLOR SYSTEM

### Primary Brand Colors

| Color Name | HEX | RGB | Usage |
|------------|-----|-----|-------|
| Black | `#000000` | `rgb(0, 0, 0)` | Base background, primary text on yellow |
| White | `#FFFFFF` | `rgb(255, 255, 255)` | Pure white (rare, used sparingly) |
| Yellow-75 | `#E6E9E0` | `rgb(230, 233, 224)` | **PRIMARY ACCENT** - All UI text, borders, highlights |
| Yellow-125 | `#A6752B` | `rgb(166, 117, 43)` | Secondary accent (rare) |

### Blue Scale (Dark Backgrounds)

| Color Name | HEX | RGB | Usage |
|------------|-----|-----|-------|
| Blue-810 | `#1C1C33` | `rgb(28, 28, 51)` | Dark card backgrounds |
| Blue-820 | `#353554` | `rgb(53, 53, 84)` | Borders, dividers |
| Blue-830 | `#14142B` | `rgb(20, 20, 43)` | Table headers, dark surfaces |

### Gray Scale (Neutrals)

| Color Name | HEX | RGB | Usage |
|------------|-----|-----|-------|
| Gray-660 | `#373737` | `rgb(55, 55, 55)` | Secondary text, muted elements |
| Gray-760 | `#282828` | `rgb(40, 40, 40)` | Borders, table dividers |
| Helper Text | `#c4c7bd` | `rgb(196, 199, 189)` | Body copy, descriptions |

### Accent Colors (Status/State)

| Color Name | HEX | RGB | Usage |
|------------|-----|-----|-------|
| Accent Long (Green) | `#10b981` | `rgb(16, 185, 129)` | Success, selected states, positive indicators |
| Accent Short (Red) | `#ef4444` | `rgb(239, 68, 68)` | Error, delete actions, negative indicators |
| Accent Neutral | `#6b7280` | `rgb(107, 114, 128)` | Neutral states, inactive |
| Red-75 | `#FC0023` | `rgb(252, 0, 35)` | Critical alerts |
| Edit Button BG | `#7f1d1d` | `rgb(127, 29, 29)` | Special button background |

### Status Indicator Colors

| Status | HEX | RGB | Usage |
|--------|-----|-----|-------|
| Healthy/Active | `#10b981` | `rgb(16, 185, 129)` | System health indicators (green dot) |
| Error/Down | `#ef4444` | `rgb(239, 68, 68)` | System error indicators (red dot) |
| Inactive/Unknown | `#888888` | `rgb(136, 136, 136)` | Default/loading state (gray dot) |

### Background Gradients

**Base Background:**
```css
background: linear-gradient(180deg, #000000 0%, #0a0a0a 100%);
```

**Radial Gradient Pattern (Interactive Elements):**
```css
/* Unselected/Gray State */
background: 
  radial-gradient(ellipse at center, 
    rgba(45, 45, 50, 1) 0%, 
    rgba(45, 45, 50, 0.95) 40%, 
    rgba(35, 35, 40, 0.9) 80%, 
    rgba(26, 26, 30, 0.85) 100%),
  #1a1a1a;

/* Selected/Green State */
background: 
  radial-gradient(ellipse at center, 
    rgba(16, 185, 129, 0.25) 0%, 
    rgba(16, 185, 129, 0.2) 40%, 
    rgba(12, 140, 97, 0.15) 80%, 
    rgba(8, 100, 70, 0.1) 100%),
  rgba(16, 185, 129, 0.15);

/* Yellow Button State */
background: 
  radial-gradient(ellipse at center, 
    rgba(230, 233, 224, 1) 0%, 
    rgba(230, 233, 224, 0.95) 40%, 
    rgba(200, 203, 194, 0.9) 80%, 
    rgba(180, 183, 174, 0.85) 100%),
  var(--color-yellow-75);
```

### Opacity Usage

| Element | Opacity | Usage |
|---------|---------|-------|
| Modal Background | `rgba(0, 0, 0, 0.90)` | 90% black overlay |
| Card Background | `rgba(0, 0, 0, 0.2)` to `rgba(0, 0, 0, 0.6)` | Glass/blur effects |
| Selected State Overlay | `rgba(16, 185, 129, 0.15)` to `rgba(16, 185, 129, 0.25)` | Green tint on selection |
| Hover Overlay | `rgba(16, 185, 129, 0.1)` to `rgba(16, 185, 129, 0.2)` | Subtle green on hover |
| Chip Backgrounds | `rgba(16, 185, 129, 0.15)` | Status chips |

### CSS Variables

```css
:root {
  /* Core Colors */
  --color-black: #000000;
  --color-white: #FFFFFF;
  --color-yellow-75: #E6E9E0;
  --color-yellow-125: #A6752B;
  --color-blue-810: #1C1C33;
  --color-blue-820: #353554;
  --color-blue-830: #14142B;
  --color-gray-660: #373737;
  --color-gray-760: #282828;
  --color-red-75: #FC0023;
  --color-edit-button-bg: #7f1d1d;
  
  /* Accent Colors */
  --accent-long: #10b981;
  --accent-short: #ef4444;
  --accent-neutral: #6b7280;
}
```

### Color Usage Rules

**DO:**
- Use Yellow-75 (#E6E9E0) for all primary UI text
- Use black (#000000) as base background
- Use green (#10b981) for selected/active states
- Use red (#ef4444) for errors and destructive actions
- Use radial gradients for interactive elements

**DON'T:**
- Never use pure white (#FFFFFF) for UI text (use Yellow-75)
- Never use drop shadows (use inset shadows)
- Never use flat colors on buttons (always use radial gradients)
- Never use colors outside the defined palette

---

## 4. BACKGROUND SYSTEM

### Base Background

**Color:** Black gradient from `#000000` to `#0a0a0a`  
**Direction:** Vertical (180deg)  
**Implementation:**
```css
body {
  background: linear-gradient(180deg, #000000 0%, #0a0a0a 100%);
}
```

### Particles.js Background

**Library:** particles.js v2.0.0  
**CDN:** `https://cdn.jsdelivr.net/particles.js/2.0.0/particles.min.js`  
**Container:** `#particles-js`  
**Z-Index:** `-1` (behind all content)

**Configuration:**
```javascript
particlesJS('particles-js', {
  particles: {
    number: { 
      value: 50, 
      density: { 
        enable: true, 
        value_area: 800 
      } 
    },
    color: { 
      value: '#E6E9E0'  // Yellow-75
    },
    shape: { 
      type: 'circle' 
    },
    opacity: { 
      value: 0.5, 
      random: true 
    },
    size: { 
      value: 2, 
      random: true 
    },
    line_linked: { 
      enable: false  // No connections between particles
    },
    move: { 
      enable: true, 
      speed: 1, 
      direction: 'none', 
      random: false, 
      straight: false, 
      out_mode: 'out', 
      bounce: false 
    }
  },
  interactivity: { 
    detect_on: 'canvas', 
    events: { 
      onhover: { 
        enable: false  // No hover interaction
      }, 
      onclick: { 
        enable: false  // No click interaction
      }, 
      resize: true  // Responsive to window resize
    } 
  },
  retina_detect: true
});
```

**CSS Positioning:**
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

### Background Layering Strategy

1. **Base Layer (z-index: -1):** Particles.js canvas with black gradient
2. **Content Layer (z-index: 0+):** All UI elements, cards, modals
3. **Overlay Layer (z-index: 10+):** Modals, dropdowns, tooltips
4. **Top Bar (z-index: 9999):** Color bar image at top

### Texture / Noise / Grain

**Current Implementation:** None (pure particles.js)  
**Future Considerations:** If adding grain/noise, use CSS `background-image` with SVG noise pattern at low opacity (5-10%)

### Motion Behavior

- **Particles:** Slow, continuous drift (speed: 1)
- **No user interaction:** Particles do not respond to hover or click
- **Static background:** Gradient remains fixed
- **Performance:** Retina detection enabled, particles adapt to screen density

### Fallback Behavior

If particles.js fails to load:
- Background falls back to solid black gradient
- No visual breakage (gradient is in CSS)
- Graceful degradation

### Implementation Notes

- Particles are **decorative only** - no functional purpose
- Particle count (50) is optimized for performance
- Color matches primary accent (Yellow-75: #E6E9E0)
- Opacity is randomized (0.5 base) for depth variation
- Size is small (2px) to maintain subtlety

---

## 5. LAYOUT & SPACING RULES

### Max Content Width

| Breakpoint | Max Width | Usage |
|------------|-----------|-------|
| Desktop | `72rem` (1152px) | Main content container |
| Tablet | `100%` | Full width |
| Mobile | `100%` | Full width with padding |

**Implementation:**
```css
.container {
  max-width: 72rem; /* 1152px */
  margin: 0 auto;
  padding: 0 1rem;
}
```

### Section Padding

| Breakpoint | Horizontal Padding | Vertical Padding |
|------------|---------------------|------------------|
| Desktop | `1rem` (16px) | `1.5rem` (24px) |
| Tablet | `1rem` (16px) | `1rem` (16px) |
| Mobile | `0.5rem` (8px) | `0.75rem` (12px) |

### Grid System

**Standard Grid:**
- **Columns:** `repeat(auto-fit, minmax(260px, 1fr))`
- **Gap:** `1rem` (16px) desktop, `0.75rem` (12px) mobile
- **Usage:** Video cards, folder grids

**Two-Column Grid (Mobile):**
- **Columns:** `repeat(2, 1fr)`
- **Gap:** `0.5rem` (8px)
- **Usage:** Folder selection, archive files

**Single Column (Mobile):**
- **Columns:** `1fr`
- **Gap:** `1rem` (16px)
- **Usage:** Video lists, accordions

### Vertical Rhythm

**Base Unit:** `0.5rem` (8px)  
**Multipliers:** 0.5rem, 0.75rem, 1rem, 1.5rem, 2rem

| Element | Spacing |
|---------|---------|
| Section Gap | `1.5rem` (24px) |
| Card Padding | `1rem` (16px) |
| Button Padding | `0.75rem 1.25rem` (12px 20px) |
| Input Padding | `0.75rem 1rem` (12px 16px) |
| Table Cell Padding | `0.75rem` (12px) |
| Modal Padding | `1.5rem` (24px) |

### Spacing Scale (CSS Variables)

```css
:root {
  --spacing-2: 0.5rem;   /* 8px */
  --spacing-3: 0.75rem;  /* 12px */
  --spacing-4: 1rem;     /* 16px */
  --spacing-6: 1.5rem;   /* 24px */
  --spacing-8: 2rem;     /* 32px */
}
```

### Breakpoint Definitions

| Breakpoint | Min Width | Max Width | Usage |
|------------|-----------|-----------|-------|
| Mobile | `0px` | `640px` | Primary mobile styles |
| Tablet | `641px` | `1024px` | Tablet adjustments |
| Desktop | `1025px` | `∞` | Default desktop styles |

**Implementation:**
```css
/* Mobile */
@media (max-width: 640px) { /* ... */ }

/* Tablet */
@media (min-width: 641px) and (max-width: 1024px) { /* ... */ }

/* Desktop (default, no media query) */
```

---

## 6. SHAPE LANGUAGE

### Border Radius System

| Element | Radius | Value | Usage |
|---------|--------|-------|-------|
| Standard | `--radius-md` | `0.375rem` (6px) | Small elements |
| Large | `--radius-lg` | `0.5rem` (8px) | Cards, inputs |
| Button | `10px` | `0.625rem` | All buttons |
| Maximum | `12px` | `0.75rem` | Folder cards, selects |
| Circular | `999px` | `50%` | Status dots, dismiss buttons |

**CSS Variables:**
```css
:root {
  --radius-md: 0.375rem;  /* 6px */
  --radius-lg: 0.5rem;     /* 8px */
  --radius-5: 5px;
  --radius-10: 10px;
}
```

### Shape Usage Rules

**Sharp (0px):**
- Never used (all elements have some rounding)

**Rounded (6-8px):**
- Cards
- Inputs
- Selects
- Modals

**Highly Rounded (10-12px):**
- Buttons (10px standard)
- Folder cards (12px)
- Interactive selection items (12px)

**Circular (999px/50%):**
- Status indicator dots (8px diameter)
- Dismiss buttons (18px-32px diameter)

### Card Shapes

- **Border Radius:** `12px` (0.75rem)
- **Border Width:** `2px`
- **Border Style:** `solid`
- **Padding:** `1rem` (16px) standard, `0.75rem` (12px) mobile

### Input Shapes

- **Border Radius:** `12px` (0.75rem)
- **Border Width:** `2px`
- **Border Color:** Yellow-75 (#E6E9E0) default, Green (#10b981) on focus/hover

### Button Silhouettes

- **Primary Button:** `10px` radius, solid fill
- **Secondary Button:** `12px` radius, bordered, radial gradient background
- **Ghost Button:** `10px` radius, transparent, bordered
- **Circular Button:** `999px` radius (dismiss, close)

---

## 7. COMPONENT SYSTEM

### Buttons

#### Primary Button (Yellow)

**Visual Description:**
- Solid yellow-75 background with radial gradient
- Black text
- Black border (2px)
- Box shadow (elevated)

**CSS:**
```css
.btn-primary {
  background-color: var(--color-yellow-75);
  color: var(--color-black);
  border: 2px solid var(--color-black);
  border-radius: 10px;
  box-shadow: var(--shadow-2xl);
  font-family: var(--font-mathias);
  padding: 1rem 1.5rem;
  font-size: 0.875rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  transition: background-color 0.3s ease, box-shadow 0.3s ease;
}
```

**States:**
- **Default:** Yellow-75 background, black text
- **Hover:** Slightly darker yellow (opacity 0.9)
- **Active:** Pressed state (opacity 0.8)
- **Disabled:** Gray background, reduced opacity

#### Secondary Button (Bordered)

**Visual Description:**
- Radial gradient gray background
- Yellow-75 text and border
- Inset shadows for depth
- Transitions to green on hover

**CSS:**
```css
.btn-secondary {
  background: 
    radial-gradient(ellipse at center, 
      rgba(45, 45, 50, 1) 0%, 
      rgba(45, 45, 50, 0.95) 40%, 
      rgba(35, 35, 40, 0.9) 80%, 
      rgba(26, 26, 30, 0.85) 100%),
    #1a1a1a;
  color: var(--color-yellow-75);
  border: 2px solid #555;
  border-radius: 12px;
  box-shadow: 
    inset 0 1px 3px rgba(0, 0, 0, 0.3), 
    inset 0 0 15px rgba(0, 0, 0, 0.15);
  transition: all 0.3s ease;
}

.btn-secondary:hover {
  background: 
    radial-gradient(ellipse at center, 
      rgba(16, 185, 129, 0.2) 0%, 
      rgba(16, 185, 129, 0.15) 40%, 
      rgba(12, 140, 97, 0.1) 80%, 
      rgba(8, 100, 70, 0.08) 100%),
    rgba(16, 185, 129, 0.1);
  border-color: #10b981;
  box-shadow: 
    inset 0 1px 3px rgba(0, 0, 0, 0.2), 
    inset 0 0 20px rgba(16, 185, 129, 0.08),
    0 0 15px rgba(16, 185, 129, 0.2);
}
```

**States:**
- **Default:** Gray radial gradient, yellow text
- **Hover:** Green tint overlay, green border, green glow
- **Active:** Slightly more intense green
- **Disabled:** Reduced opacity, no hover effect

#### Green Gradient Button

**Visual Description:**
- Solid green radial gradient
- White text
- Inset and drop shadows
- Elevated appearance

**CSS:**
```css
.btn-green-gradient {
  background: 
    radial-gradient(ellipse at center, 
      rgba(16, 185, 129, 1) 0%, 
      rgba(16, 185, 129, 0.95) 40%, 
      rgba(12, 140, 97, 0.9) 80%, 
      rgba(8, 100, 70, 0.85) 100%),
    #10b981;
  color: white;
  border: none;
  border-radius: 10px;
  box-shadow: 
    inset 0 1px 3px rgba(0, 0, 0, 0.3), 
    inset 0 0 20px rgba(0, 0, 0, 0.15),
    0 4px 6px rgba(0, 0, 0, 0.3);
}

.btn-green-gradient:hover {
  background: 
    radial-gradient(ellipse at center, 
      rgba(20, 205, 145, 1) 0%, 
      rgba(20, 205, 145, 0.95) 40%, 
      rgba(16, 165, 115, 0.9) 80%, 
      rgba(12, 125, 85, 0.85) 100%),
    #14d391;
  box-shadow: 
    inset 0 1px 3px rgba(0, 0, 0, 0.25), 
    inset 0 0 25px rgba(0, 0, 0, 0.12),
    0 6px 12px rgba(0, 0, 0, 0.35);
}
```

### Cards

#### Standard Card (Glass Effect)

**Visual Description:**
- Semi-transparent black background
- Backdrop blur (20px)
- Yellow border (2px)
- Multi-layer shadow

**CSS:**
```css
.card-edittrax {
  background-color: rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 2px solid var(--color-yellow-75);
  border-radius: 10px;
  padding: 0;
  box-shadow: 
    3px 3px 10px rgba(0, 0, 0, 0.6), 
    -3px -3px 10px rgba(0, 0, 0, 0.6);
  overflow: hidden;
}
```

#### Dark Card

**Visual Description:**
- Solid dark blue background
- Blue border
- Standard shadow

**CSS:**
```css
.card-dark {
  background-color: var(--color-blue-830);
  border: 2px solid var(--color-blue-820);
  border-radius: 10px;
  padding: 1.5rem;
  box-shadow: 
    3px 3px 10px rgba(0, 0, 0, 0.6), 
    -3px -3px 10px rgba(0, 0, 0, 0.6);
}
```

### Modals / Overlays

**Visual Description:**
- Fixed overlay (90% black)
- Centered content
- Black background with yellow border
- Radial gradient inner background
- Large shadow

**CSS:**
```css
.modal-bg {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100vh;
  z-index: 10;
  background-color: rgba(0, 0, 0, 0.90);
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-content {
  background-color: var(--color-black);
  border: 2px solid var(--color-yellow-75);
  width: 500px;
  max-width: 90vw;
  border-radius: 8px;
  padding: 1.5rem;
  box-shadow: 
    3px 3px 10px rgba(0, 0, 0, 0.6), 
    -3px -3px 10px rgba(0, 0, 0, 0.6);
  z-index: 9999;
}
```

**States:**
- **Open:** Visible with fade-in
- **Close:** Fade-out animation

### Navigation

**Visual Description:**
- Transparent header
- Centered logo
- Status indicators (top-left)
- Action buttons (top-right)

**CSS:**
```css
.header-edittrax {
  background-color: transparent;
  padding: 1rem;
  width: 100%;
}

.logo-img {
  height: 40px;
  width: auto;
}
```

### Inputs / Forms

#### Styled Select

**Visual Description:**
- Dark radial gradient background
- Yellow border (2px)
- Yellow text
- Custom dropdown arrow
- Inset shadows

**CSS:**
```css
.select-styled {
  width: 100%;
  padding: 0.75rem 1rem;
  border: 2px solid var(--color-yellow-75);
  border-radius: 12px;
  background: 
    radial-gradient(ellipse at center, 
      rgba(20, 20, 25, 1) 0%, 
      rgba(20, 20, 25, 0.95) 40%, 
      rgba(15, 15, 20, 0.9) 80%, 
      rgba(10, 10, 15, 0.85) 100%),
    #0a0a0a;
  color: var(--color-yellow-75);
  font-family: var(--font-mathias);
  font-size: 0.9rem;
  box-shadow: 
    inset 0 1px 3px rgba(0, 0, 0, 0.3), 
    inset 0 0 15px rgba(0, 0, 0, 0.15);
}

.select-styled:hover,
.select-styled:focus {
  border-color: #10b981;
  box-shadow: 
    inset 0 1px 3px rgba(0, 0, 0, 0.25), 
    inset 0 0 20px rgba(0, 0, 0, 0.12),
    0 0 10px rgba(16, 185, 129, 0.2);
  outline: none;
}
```

**States:**
- **Default:** Yellow border, dark background
- **Hover/Focus:** Green border, green glow
- **Disabled:** Reduced opacity

### Tooltips / Callouts

**Visual Description:**
- Dark background with border
- Yellow text
- Small padding
- Subtle shadow

**Implementation:** Inline styles or utility classes (no dedicated component yet)

### Badges / Tags

#### Status Chips

**Visual Description:**
- Small rounded badges
- Colored background with matching text
- Low opacity background

**CSS:**
```css
.chip {
  border-radius: 0.375rem;
  padding: 0.35rem 0.65rem;
  font-family: var(--font-body);
  font-size: 0.85rem;
  letter-spacing: 0.01em;
}

.chip-success {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
}

.chip-warning {
  background: rgba(251, 191, 36, 0.15);
  color: #fbbf24;
}

.chip-error {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}
```

### Interactive Selection Items

#### Folder Select Item

**Visual Description:**
- Square or rectangular card
- Radial gradient background
- Border changes on selection
- Green tint when selected

**CSS:**
```css
.folder-select-item {
  display: flex;
  align-items: center;
  padding: 1rem;
  border-radius: 12px;
  border: 2px solid;
  transition: all 0.3s ease;
}

.folder-select-item.unselected {
  background: 
    radial-gradient(ellipse at center, 
      rgba(45, 45, 50, 1) 0%, 
      rgba(45, 45, 50, 0.95) 40%, 
      rgba(35, 35, 40, 0.9) 80%, 
      rgba(26, 26, 30, 0.85) 100%),
    #1a1a1a;
  border-color: #555;
  box-shadow: 
    inset 0 1px 3px rgba(0, 0, 0, 0.3), 
    inset 0 0 15px rgba(0, 0, 0, 0.15);
}

.folder-select-item.selected {
  background: 
    radial-gradient(ellipse at center, 
      rgba(16, 185, 129, 0.25) 0%, 
      rgba(16, 185, 129, 0.2) 40%, 
      rgba(12, 140, 97, 0.15) 80%, 
      rgba(8, 100, 70, 0.1) 100%),
    rgba(16, 185, 129, 0.15);
  border-color: #10b981;
  box-shadow: 
    inset 0 1px 3px rgba(0, 0, 0, 0.2), 
    inset 0 0 20px rgba(16, 185, 129, 0.1),
    0 0 10px rgba(16, 185, 129, 0.15);
}
```

### Collapsible Cards

**Visual Description:**
- Yellow header with black text
- Radial gradient yellow background
- Dark body when expanded
- Yellow border throughout

**CSS:**
```css
.collapsible-toggle {
  width: 100%;
  background: 
    radial-gradient(ellipse at center, 
      rgba(230, 233, 224, 1) 0%, 
      rgba(230, 233, 224, 0.95) 40%, 
      rgba(200, 203, 194, 0.9) 80%, 
      rgba(180, 183, 174, 0.85) 100%),
    var(--color-yellow-75);
  color: black;
  border: none;
  padding: 0.9rem 1rem;
  font-family: var(--font-mathias);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  box-shadow: 
    inset 0 1px 3px rgba(0, 0, 0, 0.3), 
    inset 0 0 20px rgba(0, 0, 0, 0.15);
}

.collapsible-body {
  padding: 1rem 1.2rem 1.25rem;
  background: 
    radial-gradient(ellipse at center, 
      rgba(20, 20, 30, 0.7) 0%, 
      rgba(0, 0, 0, 0.6) 100%);
  border-top: 2px solid var(--color-yellow-75);
}
```

---

## 8. MOTION & INTERACTION

### Easing Curves

**Standard Easing:** `ease` (CSS default)  
**Usage:** All transitions

**Custom Easing:** None (using CSS defaults)

### Duration Standards

| Element | Duration | Usage |
|---------|----------|-------|
| Base Transition | `0.3s` | Buttons, cards, inputs |
| Hover State | `0.3s` | All interactive elements |
| Modal Open/Close | `0.2s` | Fade animations |
| Status Updates | `0.3s` | Color transitions |

**CSS Variable:**
```css
:root {
  --transition-base: 0.3s ease;
}
```

### Scroll Behavior

- **Smooth Scrolling:** Not enabled (default browser behavior)
- **Scroll Containers:** Horizontal scroll for tables on mobile
- **Overflow:** `overflow-x: auto` for table containers

### Hover Philosophy

**General Rule:** Subtle state changes, never dramatic

**Button Hover:**
- Opacity change: `1` → `0.9` → `0.8` (on press)
- Border color change (gray → green for secondary)
- Box shadow enhancement

**Card Hover:**
- Border color change (gray → green)
- Slight scale increase (`transform: scale(1.02)`)
- Green glow effect

**Input Hover:**
- Border color change (yellow → green)
- Green glow effect

### Entrance / Exit Animations

**Modals:**
- **Entrance:** Fade in (opacity 0 → 1)
- **Exit:** Fade out (opacity 1 → 0)
- **Duration:** 0.2s

**Collapsible Sections:**
- **Expand:** Display block with smooth height transition
- **Collapse:** Display none (no animation currently)

**Status Indicators:**
- **Color Change:** Smooth transition (0.3s)
- **Dot Color:** Gray → Green (healthy) or Gray → Red (error)

### When Motion Should NOT Be Used

- **System Status Updates:** Instant color changes (no animation)
- **Data Loading:** No skeleton loaders or shimmer effects
- **Page Transitions:** None (single-page application)
- **Text Changes:** Instant (no fade)

### Motion Performance

- **GPU Acceleration:** Not explicitly used (rely on browser defaults)
- **Will-Change:** Not set (browser optimization)
- **Transform:** Used sparingly (scale on hover only)

---

## 9. LOGO & BRAND ASSETS

### Logo Placement

**Header Logo:**
- **Position:** Centered in header
- **Height:** `40px` (desktop), `32px` (mobile)
- **Width:** Auto (maintains aspect ratio)
- **Alignment:** Center

**Implementation:**
```css
.logo-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.logo-img {
  height: 40px;
  width: auto;
}
```

### Clear Space

**Minimum Clear Space:** `0.5rem` (8px) around logo  
**Recommended Clear Space:** `1rem` (16px) around logo

### Size Constraints

| Context | Height | Width |
|---------|--------|-------|
| Header (Desktop) | `40px` | Auto |
| Header (Mobile) | `32px` | Auto |
| Footer | `32px` | Auto |
| Favicon | `32px` | `32px` |

### Background Compatibility

**Logo Colors:**
- **Primary:** Yellow-75 (#E6E9E0) on black
- **Inverted:** Not used (always yellow on dark)

**Background Requirements:**
- Logo must always appear on dark background (black or dark gradient)
- Never place on light backgrounds
- Maintains visibility on particle background

### Color Bar (Top Border)

**Asset:** `/logos/color_bar.png`  
**Position:** Fixed at top of viewport  
**Height:** `5px` (fixed)  
**Width:** `100%`  
**Z-Index:** `9999` (above all content)  
**Pointer Events:** `none`

**Implementation:**
```html
<img 
  src="/logos/color_bar.png" 
  alt="" 
  style="
    position: fixed; 
    top: 0; 
    left: 0; 
    width: 100%; 
    height: 5px; 
    max-height: 5px; 
    z-index: 9999; 
    pointer-events: none; 
    display: block; 
    object-fit: cover;
  "
>
```

### Do / Don't Examples

**DO:**
- ✅ Use logo at specified heights (40px desktop, 32px mobile)
- ✅ Center logo in header
- ✅ Maintain clear space around logo
- ✅ Use on dark backgrounds only
- ✅ Include color bar at top of page

**DON'T:**
- ❌ Never use logo on light backgrounds
- ❌ Never scale logo below 32px
- ❌ Never place logo without clear space
- ❌ Never remove color bar
- ❌ Never change logo colors

---

## 10. IMPLEMENTATION CHECKLIST

### Step-by-Step Implementation Guide

#### 1. Fonts

- [ ] Load Mathias font file (`/fonts/mathias-bold.ttf`)
- [ ] Define `@font-face` with `font-display: swap`
- [ ] Set up system font fallback stack
- [ ] Apply Mathias to all headings and buttons
- [ ] Apply system font to body text
- [ ] Verify uppercase transformation on headings
- [ ] Verify letter spacing (0.05em buttons, 0.08em headings)

#### 2. Tokens

- [ ] Define all CSS color variables
- [ ] Define spacing scale variables
- [ ] Define border radius variables
- [ ] Define shadow variables
- [ ] Define transition variables
- [ ] Create Tailwind config (if using Tailwind)
- [ ] Export design tokens as JSON (optional)

#### 3. Background

- [ ] Set base body gradient (`#000000` to `#0a0a0a`)
- [ ] Include particles.js library (CDN or local)
- [ ] Create `#particles-js` container
- [ ] Configure particles.js with exact settings:
  - [ ] 50 particles
  - [ ] Yellow-75 color (#E6E9E0)
  - [ ] Opacity 0.5 (random)
  - [ ] Size 2 (random)
  - [ ] Speed 1
  - [ ] No line links
  - [ ] No interactivity
- [ ] Position particles container (fixed, z-index: -1)
- [ ] Add color bar image at top (5px height, z-index: 9999)
- [ ] Test fallback (particles.js disabled)

#### 4. Components

- [ ] **Buttons:**
  - [ ] Primary button (yellow, black text)
  - [ ] Secondary button (gray gradient, yellow text, green hover)
  - [ ] Green gradient button
  - [ ] Ghost button (transparent, yellow border)
- [ ] **Cards:**
  - [ ] Glass card (backdrop blur, semi-transparent)
  - [ ] Dark card (solid blue background)
  - [ ] Folder select item (gray/green states)
  - [ ] Video card
- [ ] **Modals:**
  - [ ] Modal overlay (90% black)
  - [ ] Modal content (black, yellow border)
  - [ ] Close button
- [ ] **Inputs:**
  - [ ] Styled select (dark gradient, yellow border)
  - [ ] Text input (matching select style)
  - [ ] Checkbox (custom styling)
- [ ] **Navigation:**
  - [ ] Header (transparent)
  - [ ] Logo container
  - [ ] Status indicators
- [ ] **Tables:**
  - [ ] Table container (scrollable)
  - [ ] Table header (blue background, yellow text)
  - [ ] Table cells (dark, white text)
- [ ] **Collapsible:**
  - [ ] Toggle button (yellow header)
  - [ ] Collapsible body (dark gradient)

#### 5. Motion

- [ ] Set base transition (0.3s ease)
- [ ] Add hover states to all interactive elements
- [ ] Implement modal fade animations
- [ ] Add status indicator color transitions
- [ ] Verify no motion on data updates
- [ ] Test performance (no jank)

#### 6. QA Pass Criteria

**Visual Consistency:**
- [ ] All headings use Mathias font, uppercase
- [ ] All buttons use Mathias font, uppercase
- [ ] All text uses Yellow-75 (#E6E9E0), never white
- [ ] All borders are 2px solid
- [ ] All border radius values match spec (10px buttons, 12px cards)
- [ ] All shadows are inset (no drop shadows on cards)
- [ ] All interactive elements have radial gradients
- [ ] Green hover states work on all secondary elements

**Background:**
- [ ] Particles.js loads and displays correctly
- [ ] Background gradient is visible
- [ ] Color bar appears at top
- [ ] Z-index layering is correct (particles behind, content above)

**Responsive:**
- [ ] Mobile breakpoint (640px) works correctly
- [ ] Tablet breakpoint (641px-1024px) works correctly
- [ ] Desktop (1025px+) works correctly
- [ ] Grid layouts adapt (2 columns mobile, auto-fit desktop)
- [ ] Font sizes scale appropriately
- [ ] Spacing adjusts for mobile

**Interactivity:**
- [ ] All buttons have hover states
- [ ] All inputs have focus states
- [ ] Selection states work (green tint)
- [ ] Modals open/close smoothly
- [ ] Collapsible sections expand/collapse

**Performance:**
- [ ] No layout shift on load
- [ ] Particles.js doesn't cause performance issues
- [ ] Transitions are smooth (60fps)
- [ ] No console errors

**Accessibility:**
- [ ] Color contrast meets WCAG AA (yellow on black)
- [ ] Interactive elements have focus states
- [ ] Text is readable at all sizes
- [ ] Status indicators have text labels

---

## 11. FRAMEWORK-AGNOSTIC TRANSLATION NOTES

### Tailwind CSS

**Configuration:**
```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        'yellow-75': '#E6E9E0',
        'blue-810': '#1C1C33',
        'blue-820': '#353554',
        'blue-830': '#14142B',
        'gray-660': '#373737',
        'gray-760': '#282828',
        'accent-long': '#10b981',
        'accent-short': '#ef4444',
      },
      fontFamily: {
        'mathias': ['"Mathias"', 'sans-serif'],
        'system': ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', '"Fira Sans"', '"Droid Sans"', '"Helvetica Neue"', 'sans-serif'],
      },
      borderRadius: {
        'button': '10px',
        'card': '12px',
      },
      boxShadow: {
        'inset-sm': 'inset 0 1px 3px rgba(0, 0, 0, 0.3), inset 0 0 15px rgba(0, 0, 0, 0.15)',
        'inset-lg': 'inset 0 1px 3px rgba(0, 0, 0, 0.2), inset 0 0 20px rgba(16, 185, 129, 0.08), 0 0 15px rgba(16, 185, 129, 0.2)',
      },
    },
  },
}
```

**Usage Example:**
```html
<button class="font-mathias uppercase text-yellow-75 bg-yellow-75 text-black border-2 border-black rounded-button px-6 py-4 text-sm tracking-wider shadow-2xl">
  BUTTON TEXT
</button>
```

### CSS Modules

**Structure:**
```css
/* Button.module.css */
.button {
  font-family: var(--font-mathias);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  /* ... */
}

.buttonPrimary {
  background-color: var(--color-yellow-75);
  color: var(--color-black);
  /* ... */
}
```

**Usage:**
```jsx
import styles from './Button.module.css';

<button className={`${styles.button} ${styles.buttonPrimary}`}>
  BUTTON TEXT
</button>
```

### Styled Components

**Theme Object:**
```javascript
const theme = {
  colors: {
    yellow75: '#E6E9E0',
    black: '#000000',
    accentLong: '#10b981',
    // ... all colors
  },
  fonts: {
    mathias: '"Mathias", sans-serif',
    system: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, ...',
  },
  spacing: {
    sm: '0.5rem',
    md: '1rem',
    lg: '1.5rem',
  },
  borderRadius: {
    button: '10px',
    card: '12px',
  },
};
```

**Component Example:**
```javascript
import styled from 'styled-components';

const Button = styled.button`
  font-family: ${props => props.theme.fonts.mathias};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background-color: ${props => 
    props.primary 
      ? props.theme.colors.yellow75 
      : 'transparent'
  };
  color: ${props => 
    props.primary 
      ? props.theme.colors.black 
      : props.theme.colors.yellow75
  };
  border: 2px solid ${props => 
    props.primary 
      ? props.theme.colors.black 
      : props.theme.colors.yellow75
  };
  border-radius: ${props => props.theme.borderRadius.button};
  /* ... */
`;
```

### Vanilla CSS

**Use CSS Variables:**
```css
:root {
  /* All variables defined here */
}

.button {
  font-family: var(--font-mathias);
  background-color: var(--color-yellow-75);
  /* ... */
}
```

**HTML:**
```html
<button class="button button-primary">BUTTON TEXT</button>
```

### Design Tokens (JSON)

**Structure:**
```json
{
  "colors": {
    "yellow75": {
      "value": "#E6E9E0",
      "rgb": "rgb(230, 233, 224)",
      "usage": "Primary accent color"
    },
    "black": {
      "value": "#000000",
      "rgb": "rgb(0, 0, 0)",
      "usage": "Base background"
    }
  },
  "typography": {
    "fontFamily": {
      "mathias": {
        "value": "\"Mathias\", sans-serif",
        "fallback": "sans-serif"
      }
    },
    "fontSize": {
      "button": {
        "value": "0.875rem",
        "px": "14px"
      }
    }
  },
  "spacing": {
    "sm": {
      "value": "0.5rem",
      "px": "8px"
    }
  },
  "borderRadius": {
    "button": {
      "value": "10px",
      "px": "10px"
    }
  }
}
```

**Usage:**
- Import into design tools (Figma, Sketch)
- Generate CSS/SCSS from tokens
- Use with Style Dictionary or similar tools
- Maintain single source of truth

---

## APPENDIX: ASSUMPTIONS & AMBIGUITIES

### Documented Assumptions

1. **Particles.js Configuration:** Assumed from code inspection. If live site differs, update particle count, color, and behavior.
2. **Mobile Breakpoint:** Set at 640px based on CSS. Verify against actual design requirements.
3. **Logo Asset:** Assumed SVG or PNG format. Verify actual format and dimensions.
4. **Color Bar:** Assumed horizontal gradient image. Verify actual design and colors.

### Flagged Ambiguities

1. **Three.js/Canvas:** No Three.js implementation found. If future implementation is needed, maintain particle aesthetic (subtle, non-interactive).
2. **Animation Library:** No animation library detected. If adding complex animations, maintain 0.3s duration standard.
3. **Dark Mode:** System appears to be dark-only. If light mode is needed, create separate color palette.
4. **Print Styles:** No print styles defined. If needed, create high-contrast print stylesheet.

### Recommendations

1. **Create Design Tokens JSON:** Export all values to JSON for tooling integration.
2. **Add Animation Guidelines:** If motion increases, document easing curves and timing functions.
3. **Accessibility Audit:** Verify WCAG compliance, especially color contrast ratios.
4. **Component Library:** Consider building React/Vue component library with these tokens.
5. **Storybook Integration:** Document components in Storybook with design tokens.

---

**END OF STYLE GUIDE**

*This document is the canonical source of truth for the EditTrax/Arweave Video Generator visual system. All implementations must reference this document for consistency.*
