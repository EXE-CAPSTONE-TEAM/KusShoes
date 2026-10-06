# Design System & Visual Truth (DESIGN.md)

## 1. Design Philosophy & Brand Personality
- **Aesthetic Direction:** e.g. Minimalist, brutalist, high-density dashboard, editorial.
- **Brand Voice & Tone:** Clear, concise, authoritative, friendly.
- **Anti-Patterns / Clichés to Avoid:**
  - ❌ No arbitrary purple gradient keywords.
  - ❌ No icon-stuffed bento boxes without clear utility.
  - ❌ No textureless gray surfaces.
  - ❌ No non-responsive layouts.

## 2. Design Tokens & Visual Hierarchy
- **Typography:**
  - Font Families: Headings (Primary Display), Body (Readable Sans/Serif), Code (Mono).
  - Scale: `text-xs`, `text-sm`, `text-base`, `text-lg`, `text-xl`, `text-2xl`, `text-4xl`.
- **Color Palette (Tailored HSL / Semantic Tokens):**
  - Primary / Accent:
  - Surface & Background:
  - Text & Contrast:
  - Border & Dividers:
- **Spacing & Rhythm:** Consistent scale (4px, 8px, 12px, 16px, 24px, 32px, 48px).
- **Elevation & Radius:** Subtle border radius, curated shadow elevation.

## 3. Component Conventions
- **Buttons & Interactive Elements:** Default, Hover, Active, Disabled, Loading states.
- **Inputs & Form Controls:** Focus ring, error helper text, validation states.
- **Cards & Containers:** Structured padding, clear header/body/footer separation.
- **Feedback & Notifications:** Toast alerts, inline error banners, empty states.

## 4. Motion & Micro-interactions
- **Transitions:** Standard duration (150ms-250ms), ease-out curves.
- **Reduced Motion:** Respect `prefers-reduced-motion` media queries.
