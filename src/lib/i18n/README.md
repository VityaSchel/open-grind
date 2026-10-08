# i18n

Interface text lives in `locales/<bcp47>/<namespace>.json` as i18next JSON v4. Edit `en` only. Weblate writes the other languages, and a missing translation falls back to English.

## Adding a string

1. Add it to `locales/en/<namespace>.json` in American English, under a camelCase key named after where it shows, such as `feedback.requestBlocked.rotate`.
2. Run `bun run gen:i18n` so `t()` and `Rich.svelte` accept the new key.
3. Render it with `t("namespace.key", params)` from `$lib/i18n`, or with `Rich.svelte` when it has tags or a component in a placeholder.
4. When a file has no raw text left, add it to `translatedSvelteFiles` or `translatedScriptFiles` in `eslint.config.js`.
5. Commit. The pre-commit hook checks the locale files, regenerates `generated.ts` and stops the commit until you stage it.

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

## Changing a string

A new meaning, tag or placeholder needs a new key. To rename a key, lock the Weblate components and merge their pending changes, then run `bun scripts/i18n/rename-key.ts <old> <new>`. It moves the key in every language and rewrites its quoted uses in `src/`.

## Finding raw English

In dev builds, `?locale=en-XA` shows every translated string accented and padded, and `?locale=ar-XB` shows it right to left, so raw English stands out. `e2e/i18n-pseudo.spec.ts` fails when raw English shows on the pages it visits.
