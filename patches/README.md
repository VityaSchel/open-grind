# Dependency patches

Applied on `bun install`.

Bun applies each hunk at its recorded line number without matching the context, so a patch that only shifted by a line on a newer version corrupts the file without an error, and `bun patch --commit` then records the corruption. After a version bump, apply the old patch to the pristine tarball with `patch -p1`, which does match context, regenerate the patch from that tree, and check the installed package matches it.

## `@sveltejs/kit`

Sorts the three `fs.readdirSync()` calls in `src/utils/filesystem.js` (`copy`, `walk` and `resolve_entry`) whose order decides build output, so a rebuild elsewhere produces the same bytes. `copy` and `walk` read `Dirent`s, so they sort by name: a plain `.sort()` compares `"[object Dirent]"` and changes nothing.

See [sveltejs/kit#15313](https://github.com/sveltejs/kit/issues/15313). Kit 3 sorts the route walker upstream ([#16074](https://github.com/sveltejs/kit/pull/16074)) and replaced the `src/params/` directory with a single file, so those two sites left the patch.

`patchedDependencies` is linked to exact version, and bun silently drops an entry that no longer resolves, so a SvelteKit version bump disables this patch. Regenerate it as described above, replace the old key, and confirm `bun.lock` still lists it.

## `vaul-svelte`

Drawers bounced back into view during the close animation. A `pointerout` that ended a drag while the pointer was still captured and a `swipeAmount` of `0` read as absent.

See [huntabyte/vaul-svelte#139](https://github.com/huntabyte/vaul-svelte/issues/139). [#140](https://github.com/huntabyte/vaul-svelte/pull/140) fixes only the `animation-fill-mode` part.

## `svelte-sonner`

A press on a toast that can't be dismissed still set `swiping`, and `pointerup` returns early for such a toast, so it stayed in the swiping state. A pointer the browser cancelled, for example when a touch turned into a scroll, never ended the drag either. The patch skips the swipe start for a toast that can't be dismissed and ends the drag on `pointercancel`.

Per-position stacking, which this patch used to carry, is upstream since 1.2.0.

## `bits-ui`

Dropdown and context menu items ignored a hovering pen. Every menu hover handler returns early unless `pointerType` is `"mouse"`, so an S Pen never focused an item, opened a submenu or kept the submenu grace area. The patch adds `isHoverPointerEvent()`, true for a mouse or for a pen with no buttons pressed, and uses it in those handlers. A pen on the glass or holding its barrel button still acts like touch, so pen scrolling does not move focus. The context menu trigger's long-press keeps `isMouseEvent()`: `pointerup` carries no buttons, so a pen-inclusive check would skip clearing the 700 ms timer and every pen tap would open the menu.

Radix has the same mouse-only gate, see [radix-ui/primitives#1403](https://github.com/radix-ui/primitives/issues/1403).

A single-choice toggle group rendered its radios inside a plain `group`. Chromium groups ARIA radios only under a `radiogroup` ancestor, so Android never announced a chosen option as "In group, option 1 of 2". The patch gives a single-choice root the `radiogroup` role. A multiple-choice root stays a `group` of `aria-pressed` buttons.
