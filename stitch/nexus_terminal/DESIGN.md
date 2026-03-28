# Design System Document

## 1. Overview & Creative North Star

### The Creative North Star: "The Digital Command"
This design system moves away from the cluttered, line-heavy aesthetic of traditional admin panels. Instead, it adopts a "Digital Command" philosophy: an editorial, high-end environment that treats Telegram management as a premium orchestration task. We leverage intentional white space, sophisticated tonal shifts, and asymmetrical layouts to create a sense of calm authority. By replacing rigid borders with depth-based layering, the UI feels expansive and responsive rather than boxed-in.

---

## 2. Colors

The palette is rooted in professional Deep Blues and Slate Grays, balanced by a "Clean White" surface logic that prioritizes readability and focus.

### The "No-Line" Rule
**Prohibit 1px solid borders for sectioning.** To achieve a premium feel, boundaries must be defined solely through background color shifts. For example, a data table container (`surface-container-lowest`) should sit on a main background (`surface`) without a stroke. The contrast between these two tokens is sufficient to define the edge.

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers. Depth is achieved by "stacking" the following tokens:
- **`surface` (#f7f9fb):** The base canvas.
- **`surface-container-low` (#f0f4f7):** Secondary sidebar or grouping areas.
- **`surface-container-lowest` (#ffffff):** The highest priority "sheet" where primary interaction occurs (e.g., a form or a card).

### The "Glass & Gradient" Rule
Floating navigation or modal headers should utilize **Glassmorphism**. Use semi-transparent variants of `surface` with a 12px-20px backdrop blur. Main CTAs must use a subtle linear gradient from `primary` (#0053db) to `primary_dim` (#0048c1) at a 135-degree angle to provide a "soul" that flat colors lack.

---

## 3. Typography

The system utilizes **Inter** for its neutral, highly legible character.

*   **Display (Editorial Impact):** Use `display-sm` for high-level dashboard metrics to give them a "newsroom" importance.
*   **Headline (Context):** `headline-sm` should be used for section titles (e.g., "Spam Protection Settings").
*   **Body (Utility):** `body-md` is the workhorse for data tables. Ensure a generous line height (1.5) to prevent the "wall of text" seen in original screenshots.
*   **Label (Metadata):** `label-md` should be used for table headers and form labels, often set in `on_surface_variant` (#566166) to create a clear visual hierarchy between "Field Name" and "Data."

---

## 4. Elevation & Depth

### The Layering Principle
Hierarchy is achieved through **Tonal Layering**. Place a `surface-container-lowest` card on a `surface-container-low` section. This creates a soft, natural lift that feels architectural rather than digital.

### Ambient Shadows
When an element must "float" (e.g., a dropdown or a fly-out sidebar), use an extra-diffused shadow:
- **Shadow Offset:** 0px 8px
- **Shadow Blur:** 32px
- **Shadow Color:** `on_surface` (#2a3439) at **4% opacity**.
This mimics natural ambient light and avoids the "muddy" look of standard 15-20% opacity shadows.

### The "Ghost Border" Fallback
If a border is required for accessibility in complex forms, use a **Ghost Border**: `outline_variant` (#a9b4b9) at **15% opacity**. Never use a 100% opaque border.

---

## 5. Components

### Buttons
- **Primary:** Gradient (`primary` to `primary_dim`), roundedness `md` (0.375rem). No border. White text.
- **Secondary:** Surface-tinted. Use `primary_container` background with `on_primary_container` text.
- **Tertiary/Ghost:** No background. `primary` text. Use for "Cancel" or low-priority actions.

### Data Tables (The "Structure Over Lines" Rule)
Forbid the use of vertical or horizontal divider lines.
- **Separation:** Use `spacing-4` (0.9rem) of vertical padding per row. 
- **Alternating Rows:** Use a subtle shift to `surface-container-low` for every second row if data density is high.
- **Headers:** Use `label-md` in uppercase with 0.05em letter spacing for an authoritative, editorial feel.

### Stats Cards
Instead of a simple box, use asymmetrical padding. 
- **Value:** `display-sm` color: `on_surface`.
- **Label:** `label-md` color: `on_surface_variant`, placed *above* the value.
- **Trend Indicator:** Small `tertiary` (green) chip with semi-transparent background.

### Modular Forms
Group related settings (like "Spam Protection") into "Logical Blocks." Each block sits on a `surface-container-low` background with `xl` (0.75rem) roundedness. 

---

## 6. Do's and Don'ts

### Do:
- **Do** use `spacing-10` (2.25rem) or `spacing-12` (2.75rem) between major sections to let the UI "breathe."
- **Do** use `tertiary` (#006b62) for success states and `error` (#9f403d) for high-alert spam triggers.
- **Do** align all text to a consistent baseline to maintain the "structured" feel requested.

### Don't:
- **Don't** use standard black (#000000). Always use `on_surface` (#2a3439) for text to maintain tonal depth.
- **Don't** use `none` or `sm` roundedness for large containers. Stick to `lg` or `xl` to soften the "professional" tool's edge.
- **Don't** use "Select All" checkboxes in tables if they create visual noise. Use a subtle hover-state checkbox instead.