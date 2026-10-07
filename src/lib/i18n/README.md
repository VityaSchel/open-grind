# i18n

Strings live in `locales/<bcp47>/<namespace>.json` as i18next JSON v4. `en` is the source. Weblate writes every other language; never edit those by hand. A string missing from a language renders in English.

## Adding a string

1. Add it to `locales/en/<namespace>.json` in American English
2. Render it with `t("namespace.key", params)` from `$lib/i18n`, or with `Rich.svelte` when it has tags
3. Once a file has no raw text left, list it in `translatedSvelteFiles` or `translatedScriptFiles` in `eslint.config.js`
4. Commit. The pre-commit hook writes `generated.ts` with `bun run gen:i18n` and fails until you stage it

Call `t()` in markup, `$derived` or a function. Lint rejects a result stored at module scope or at the top of a `<script>`, since it keeps the old language after a locale switch.

Text a library writes into the DOM once, such as Leaflet or PhotoSwipe controls, does not re-render. Reapply it from an `$effect` that calls `t()`, or outside a component from `followLocale()`, which runs a callback on the next effect flush and again after every switch until stopped.

A toast keeps the text it was shown with. Show an error toast that stays until dismissed with `showPersistentErrorToast()` from `$lib/api/persistent-error-toast`, which rewords it after a switch.

Label an enum with a table of semantic keys, `as const satisfies Record<Id, MessageKey>`. Where code indexes labels by id, wrap the table in `translatedLabels()` from `$lib/i18n/labels`: each read calls `t()`, so copy the entries, for example with `Object.entries` or a spread, only when the text is shown.

Diagnostics such as console output, copied error details and `ApiError.message` stay English. Where one reuses a catalog string, render it with `sourceText()`, which takes the same arguments as `t()`.

Dev builds add two pseudo-locales that `pseudo.ts` builds from English in memory. Open the app with `?locale=en-XA` to see every translated string accented, padded and wrapped in `⟦…⟧`, or with `?locale=ar-XB` to see it right to left, so raw English stands out.

## Renaming a key

Lock the Weblate components and merge their pending changes first, then run `bun scripts/i18n/rename-key.ts <old> <new>` with full keys. It moves the string in every language, rewrites its quoted uses under `src/`, and regenerates `generated.ts`. A new meaning needs a new key instead.

## Syntax

| Element   | Example                               | Rule                                                                                                                                                  |
| --------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key       | `feedback.requestBlocked.rotate`      | camelCase segments, `[a-z][A-Za-z0-9]*`, along the code path. A new meaning, param or tag gets a new key                                              |
| Text      | `Couldn't copy to clipboard`          | Non-empty, real characters (`…`, U+00A0), no HTML entities                                                                                            |
| Param     | `{{name}}`                            | Plain camelCase `{{name}}` only, a string formatted in code                                                                                           |
| Plural    | `key_one`, `key_other`                | Exactly these two, picked by `{{count}}`, a number that appears nowhere else. A `_one` with a param also has `{{count}}`. Text for 0 gets its own key |
| Rich text | `This is a <link>known issue</link>.` | Flat camelCase tags without attributes, each rendered by the `Rich.svelte` snippet of that name, not named `children`, `key` or `params`              |

## `check:i18n` fails on

- English outside this syntax
- Translations with a syntax error, a tag or param English lacks, or an object where English has a string
- A translation file without an English source, or a locale directory that is not a canonical BCP 47 tag
- Translations that drop a tag or param English has for the same counts, except `{{count}}` in a plural form that covers a single number
- A string where English has an object
- An outdated `generated.ts`

It warns, without failing, on partly filled plural groups, plural forms Weblate does not offer for the language, keys English no longer has, and empty values, and prints each language's translated message count.

## Weblate component `app-common`

| Setting                       | Value                                                                                          |
| ----------------------------- | ---------------------------------------------------------------------------------------------- |
| File format                   | i18next JSON file v4                                                                           |
| File mask                     | `src/lib/i18n/locales/*/common.json`                                                           |
| Base                          | `src/lib/i18n/locales/en/common.json`                                                          |
| Template for new translations | Empty                                                                                          |
| File format parameters        | `json_indent` 1, `json_indent_style` tabs, `json_sort_keys` none                               |
| Language code style           | BCP (`pt-BR`)                                                                                  |
| Language filter               | `^[^.@]+$`; `@` codes such as `ru@formal` break `Intl`                                         |
| Translation flags             | `i18next-interpolation`                                                                        |
| Add-ons                       | Cleanup translation files, Add missing languages, Component discovery                          |
| Discovery regex               | `src/lib/i18n/locales/(?P<language>[^/.]*)/(?P<component>[^/]*)\.json`                         |
| Discovered components         | Base `src/lib/i18n/locales/en/{{ component }}.json`, name `app-{{ component }}`, same settings |
