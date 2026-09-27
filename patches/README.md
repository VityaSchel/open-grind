# Dependency patches

Applied on `bun install`.

## `@sveltejs/kit`

Sorts the five `fs.readdirSync()` calls whose order decides build output, so a rebuild elsewhere produces the same bytes.

See [sveltejs/kit#15313](https://github.com/sveltejs/kit/issues/15313). [#16074](https://github.com/sveltejs/kit/pull/16074) is `version-3` only and sorts one of the five, so the patch outlives a v3 upgrade.

`patchedDependencies` is linked to exact version, and bun silently drops an entry that no longer resolves, so a SvelteKit version bump disables this patch. Re-apply with `bun patch`, replace the old key, confirm `bun.lock` still lists it.

## `vaul-svelte`

Drawers bounced back into view during the close animation. A `pointerout` that ended a drag while the pointer was still captured and a `swipeAmount` of `0` read as absent.

See ([huntabyte/vaul-svelte#138](https://github.com/huntabyte/vaul-svelte/issues/138)).

## `svelte-sonner`

A toast stacked itself behind every other toast on screen, not just the ones sharing its position, so a `bottom-center` toast pushed a `top-center` toast down by its own height plus the gap. `heights` is one global array and `HeightT` carries no position, so `toastsHeightBefore` summed across positions; upstream React sonner filters that list by position. The patch records the position with each measured height and filters on it.

## `bits-ui`

Dropdown and context menu items ignored a hovering pen. Every menu hover handler returns early unless `pointerType` is `"mouse"`, so an S Pen never focused an item, opened a submenu or kept the submenu grace area. The patch adds `isHoverPointerEvent()`, true for a mouse or for a pen with no buttons pressed, and uses it in those handlers. A pen on the glass or holding its barrel button still acts like touch, so pen scrolling does not move focus. The context menu trigger's long-press keeps `isMouseEvent()`: `pointerup` carries no buttons, so a pen-inclusive check would skip clearing the 700 ms timer and every pen tap would open the menu.

Radix has the same mouse-only gate, see [radix-ui/primitives#1403](https://github.com/radix-ui/primitives/issues/1403).
