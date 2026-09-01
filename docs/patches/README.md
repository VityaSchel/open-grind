# Dependency patches

Applied on `bun install`.

## `vitepress`

This patch adds three optional fields to `HeroAction`:

- `icon` — a `DefaultTheme.FeatureIcon`, `VPImage` (18px, 20px at `size="big"`). Strings are inlined as HTML.
- `badge` — short text displayed as a pill.
- `platforms` — a list of `{ icon, label }` rendered as a row below the button.

Changes in `VPButton`:

- `.has-icon` / `.has-badge` switch to `inline-flex`, `gap: 8px`, and `9px` for badges.
- Badge: `color-mix(in srgb, currentColor 10%, transparent)`, pill radius, 12px/600 (13px at `big`).
- Badged buttons get `padding: 0 9px 0 17px` at `medium`, `0 12px 0 17px` at `big`.

`VPHero`:

- `has-platforms` when any action has a platform row
