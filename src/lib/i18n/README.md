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

In dev builds, `?locale=en-XA` shows every translated string accented and padded, and `?locale=ar-XB` shows it right to left, so raw English stands out. `e2e/i18n-pseudo.spec.ts` and `e2e/i18n-pseudo-settings.spec.ts` fail when raw English shows on the pages they visit.
