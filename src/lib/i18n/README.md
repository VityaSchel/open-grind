# i18n

Strings live in `locales/<bcp47>/<namespace>.json` as i18next JSON v4. `en` is the source. Weblate writes every other language; never edit those by hand. A string missing from a language renders in English.

## Adding a string

1. Add it to `locales/en/<namespace>.json` in American English
2. Render it with `t("namespace.key", params)` from `$lib/i18n`, or with `Rich.svelte` when it has a tag or a placeholder filled with a component
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

| Element     | Example                            | Rule                                                                                                                                                                                        |
| ----------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key         | `feedback.requestBlocked.rotate`   | camelCase segments, `[a-z][A-Za-z0-9]*`, along the code path. A new meaning, placeholder or tag gets a new key                                                                              |
| Text        | `Couldn't copy to clipboard`       | Non-empty, real characters (`…`, U+00A0), no HTML entities                                                                                                                                  |
| Placeholder | `{{projectLink}}`                  | camelCase `{{name}}` for what the app supplies whole: a value, an icon, a project name, an issue number                                                                                     |
| Plural      | `key_one`, `key_other`             | Exactly these two, picked by `{{count}}`, a number that appears nowhere else. A `_one` with a placeholder also has `{{count}}`. Text for 0 gets its own key                                 |
| Tag         | `Browse <gridLink>Grid</gridLink>` | Flat camelCase `<name>…</name>` without attributes, around text translators write: a link, a button label, emphasis, `srOnly`. Named after what it wraps or targets, never a generic `link` |

With `<termsLink>` and `<privacyLink>` in place of two `<link>` tags, a translator sees which text each link belongs around.

No name may be `key` or `children`, and no tag may be `count`, the plural number. A tag and a placeholder never share a name within one message and its plural forms.

## Rich text

`RichMessages` in `generated.ts` lists every message with a tag, or with a placeholder other than `{{count}}`, and gives each name one of four kinds. `Rich.svelte` takes the `key` and one prop per name:

| Kind               | In English                       | Prop                                                               |
| ------------------ | -------------------------------- | ------------------------------------------------------------------ |
| `tag`              | `<gridLink>Grid</gridLink>`      | A snippet that renders the translated text it receives             |
| `placeholder`      | `{{menuIcon}}` outside every tag | A string, or a snippet without parameters that renders a component |
| `placeholderInTag` | `{{name}}` inside a tag          | A string                                                           |
| `count`            | `{{count}}`                      | A number, formatted for the locale                                 |

```svelte
{#snippet gridLink(text: string)}<a href="/">{text}</a>{/snippet}
{#snippet menuIcon()}<MapPinIcon weight="fill" />{/snippet}

<Rich key="interest.taps.empty.description" {gridLink} />
<Rich key="feedback.autoLocationToast.message" {menuIcon} />
```

Give a tag's snippet its `text` parameter. svelte-check accepts a snippet without one, and only the en-XA leak check in `e2e/i18n-pseudo.spec.ts` catches the English it hard-codes, on the pages it visits. A message without tags is also in `Messages`, so `t()` can fill its placeholders with strings.

In a plain `.ts` file, `richParts(key, params)` from `$lib/i18n` returns the parts `Rich.svelte` renders. A `text` part has the values formatted in. A `tag` or `placeholder` part has a `name` and a `text`: the translated text of the tag, or the literal `{{name}}` of a placeholder without a value. `undecodableNotice()` in `src/lib/util/photoswipe.ts` builds its notice this way.

## `check:i18n` fails on

- English outside this syntax
- Translations with a syntax error, a tag or placeholder English lacks, or an object where English has a string
- Translations that move into a tag a placeholder English keeps outside every tag
- A tag, in English or a translation, that wraps no letter and no `{{count}}`
- A translation file without an English source, or a locale directory that is not a canonical BCP 47 tag
- Translations that drop a tag or placeholder English has for the same counts, except `{{count}}` in a plural form that covers a single number
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

Weblate's `xml-tags` check compares the tags in order, and `xml-chars-around-tags` whether a letter sits next to each tag. Both flag a translation that reorders tags on purpose, such as a Japanese sentence that starts with the second link, and the translator dismisses them. `check:i18n` still fails on a tag a translation drops, adds or renames.
