# Dependency patches

Applied on `bun install`.

## `@sveltejs/kit`

`.sort()` on `fs.readdirSync()` calls during build cause inconsistencies and non-determenism.

See [sveltejs/kit#15313](https://github.com/sveltejs/kit/issues/15313), fixed by [sveltejs/kit#16074](https://github.com/sveltejs/kit/pull/16074).

## `vaul-svelte`

Drawers bounced back into view during the close animation. A `pointerout` that ended a drag while the pointer was still captured and a `swipeAmount` of `0` read as absent.

See ([huntabyte/vaul-svelte#138](https://github.com/huntabyte/vaul-svelte/issues/138)).
