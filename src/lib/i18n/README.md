# i18n

Interface text lives in `locales/<bcp47>/<namespace>.json` as i18next JSON v4. Edit `en` only. Weblate writes the other languages, and a missing translation falls back to English. Spain Spanish (`es`) first falls back to Latin American Spanish (`es-419`).

## Adding a string

1. Add it to `locales/en/<namespace>.json` in American English, under a camelCase key named after where it shows, such as `feedback.requestBlocked.rotate`, and word it by the [copy rules](#copy-rules).
2. Run `bun run gen:i18n` so `t()` and `Rich.svelte` accept the new key.
3. Render it with `t("namespace.key", params)` from `$lib/i18n`, or with `Rich.svelte` when it has tags or a component in a placeholder.
4. When a file has no raw text left, add it to `translatedSvelteFiles` or `translatedScriptFiles` in `eslint.config.js`.
5. Commit. The pre-commit hook checks the locale files, regenerates `generated.ts` and stops the commit until you stage it.

## Copy rules

- Use Apple title case only for names: titles that are names or noun phrases, such as “Choose Location” or “No Taps Yet”, section headings, tabs, navigation and landmarks, badges, filter names, chips, toggles and sliders, and picker options.
- Use sentence case for everything else: buttons, menu items, links, error and status titles even when short, titles that are statements or questions (with no period), and all prose.
- Proper names and Grindr feature names keep their capitals in any case, such as Open Grind, Grindr, Right Now and Viewed Me.
- Write curly quotes and apostrophes (“ ” ’), primes for heights (5′11″), a closed en dash for ranges (18–30) and the single-character ellipsis (…).
- End every sentence of a message that has more than one sentence with a period.
- Word a one-time failure as “Couldn’t …” and a lasting state as “Can’t …” or a plain statement. Use “Still can’t …” only after the user retries a lasting state by hand, and keep “Failed to …” for English-only diagnostics.
- Leave out “we”, “us”, “our” and “please”.
- Say “user” for another member’s account (block, hide, report), “profile” for what is shown, and “account” only for your own.

## Message syntax

`{{name}}` is something the app supplies whole, such as a number, a name or an icon. `<name>…</name>` wraps text that translators write, such as a link label. Name tags and placeholders after what they hold, such as `<gridLink>` or `{{menuIcon}}`, never a generic `<link>`. Plurals are `key_one` and `key_other`, picked by `{{count}}`, and text for zero needs its own key.

## Rich text

```svelte
{#snippet gridLink(text: string)}<a href="/">{text}</a>{/snippet}

<Rich key="interest.taps.empty.description" {gridLink} />
```

`Rich.svelte` takes one prop per name in the message. A tag takes a snippet that must render the translated text it receives. svelte-check does not catch a snippet that leaves it out. A placeholder takes a string, `{{count}}` takes a number, and a placeholder outside every tag can take a snippet that renders a component instead. Plain `.ts` code uses `richParts()`.

## Following the language

Text must update when the language changes, so call `t()` where the text is shown. Reapply text that a library writes into the DOM once from an `$effect`, or with `followLocale()` outside a component. Show an error toast that stays open with `showPersistentErrorToast()`. Map enum ids to message keys, and wrap the map in `translatedLabels()` where code reads labels by id. Its labels translate on each read, so copy them only where they are shown.

Diagnostics such as console output and copied error details stay English. To reuse a message there, render it with `sourceText()`, which always returns the English text.

## Regional formats

Words follow the app's language. Numbers, dates and times follow the system's regional settings: the 12- or 24-hour clock and its hour padding, decimal and grouping separators, and a numbering system the user chose. Dates use the language's variant for the system region when CLDR has one, so their day and month order follows the system, along with that variant's month abbreviations. Without such a variant they keep the language's own order, because reordering would break its grammar. Format with the helpers in `format.ts`, never with a fixed pattern. Plural forms stay on the language. In dev builds, `?regional=de-DE-u-hc-h12` or a JSON snapshot pins the regional settings for the session.

## Changing a string

A new meaning, tag or placeholder needs a new key. To rename a key, lock the Weblate components and merge their pending changes, then run `bun scripts/i18n/rename-key.ts <old> <new>`. It moves the key in every language and rewrites its quoted uses in `src/`.

## Finding raw English

In dev builds, `?locale=en-XA` shows every translated string accented and padded, and `?locale=ar-XB` shows it right to left, so raw English stands out. `e2e/i18n-pseudo.spec.ts`, `e2e/i18n-pseudo-settings.spec.ts` and `e2e/i18n-pseudo-updates.spec.ts` fail when raw English shows on the pages they visit or in the toasts they show.

## Marking keys

`?locale=en-XM` shows English with each message wrapped in invisible markers: tag characters that spell its key, or the base key of a plural form. Formatted numbers and dates carry no markers. `markers.ts` writes and reads them, so a tool can tell which keys a screen shows. Text with letter spacing moves by one letter space per marker, and `e2e/i18n-markers.spec.ts` fails when a marker shows. Builds made with `OPEN_GRIND_DEMO=1 OPEN_GRIND_SCREENSHOTS=1` accept `?locale=` and the pseudo-locales, as dev builds do.

## Screenshots for translators

`bun run gen:i18n-screenshots` builds the demo with `OPEN_GRIND_SCREENSHOTS=1`, serves it on port 5396 and captures the views in `scripts/i18n-screenshots/scenes` into `i18n-screenshots/`. `--skip-build` reuses `build/`, `--view <id>` captures only the scenes that contain that view, and `--out` and `--port` move the output and the server. Each scene drives its views in English in a fresh browser context, and each view is screenshotted and scanned for markers in the same `en-XM` frame. A view with a `scroller` adds a numbered view, such as `settings/app#2`, for each further screen that shows a new key. To add a view, add a scene, list it in `scenes/index.ts` and capture it with `--view <id>`.

A scene sets its demo state in `demo`, picks another shim OS in `shim` and answers, rejects, sequences or holds native commands in `native`. Its steps can change the demo state with `changeScene`, for example to fail the next request, change native answers with `overrideNative`, emit Tauri events with `emitEvent` and pick generated photos and videos with `chooseGeneratedMedia`. The demo state can answer commands (`methodAnswers`), fail commands and requests, album uploads included, or leave them `pending`, its `inbox` replaces the demo conversations with seeds that the demo builds into inbox rows and threads, `profiles` changes fields of demo profiles on their pages and grid tiles, and `maskedProfiles` answers profiles masked the way Grindr answers one that blocked you, or one you blocked. A view that shows a spinner or skeleton on purpose calls `showsLoading`, so settling stops waiting for it. `clippy.avif` has no license, so every run serves a generated placeholder in its place, and a view fails if the real image is served.

`manifest.json` holds `commit`, the `failed` view ids and each view as `{image, sha256, pixelHash, platform, keys: [{key, box, via, top, highlight}], ms}`. `image` is `images/<id>.webp`, or `images/<base>.<n>.webp` for a numbered view `<base>#<n>`. `box` is in image pixels, `via` is `text` or `attribute`, and `top` marks an overlay. `pixelHash` hashes the captured RGBA pixels before WebP encoding. It cannot be recomputed from the WebP, so compare it only with earlier manifests. `highlight` is `{image, sha256, pixelHash}` for a copy of the view at `images/<id>/<key>.webp` or `images/<base>.<n>/<key>.webp`. The copy draws a hollow `#FFFF00` rectangle edged in black around each place the key shows, or around the element that carries an attribute key, or around what it holds when the element has no box of its own. A failed id also covers every `<id>#<n>`: the run cannot know how many screens an earlier run kept, so an uploader keeps them all. A view fails when its steps throw, a request leaves localhost, the page throws or an emoji shows, and the later views of its scene fail with it. `settings/app` is captured twice and fails when the two differ in pixels. `coverage.json` lists the keys no view showed and visible text without markers, and never fails the run. Keys no browser screen shows go into `scripts/i18n-screenshots/uncapturable.json` with the reason.

`.forgejo/workflows/i18n-screenshots.yml` runs the capture when a push to `i18n` changes the English messages, `scripts/i18n-screenshots` or the workflow, or when started by hand. It keeps the output for 7 days as the `i18n-screenshots` artifact, which the Weblate uploader reads. The screenshots are public: images, videos and map tiles are made during the run, every other request outside localhost is blocked, and the demo data in these builds holds no emoji, real places or real handles.
