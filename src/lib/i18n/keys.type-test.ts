import { expectTypeOf } from "vitest";
import type { Snippet } from "svelte";

import {
	type KeyArgs,
	type MessageKey,
	type RichKey,
	richParts,
	type RichProps,
	type RichPropsOf,
	sourceText,
	t,
	type Translate,
} from "$lib/i18n";

type TextSnippet = Snippet<[text: string]>;
type Untyped = ReturnType<typeof eval>;

expectTypeOf<Untyped>().toBeAny();

expectTypeOf<KeyArgs<undefined>>().toEqualTypeOf<[]>();
expectTypeOf<KeyArgs<{ count: number; name: string }>>().toEqualTypeOf<
	[params: { count: number; name: string }]
>();
expectTypeOf<KeyArgs<undefined | { name: string }>>().toEqualTypeOf<
	[params: { name: string }]
>();
expectTypeOf<KeyArgs<{ name: string } | { reason: string }>>().toEqualTypeOf<
	[params: { name: string } & { reason: string }]
>();
expectTypeOf<KeyArgs<Untyped>>().toEqualTypeOf<[params: never]>();
expectTypeOf<KeyArgs<{ flag: boolean }>>().toEqualTypeOf<[params: never]>();

type Terms = RichPropsOf<{ app: string }, "link" | "b">;

expectTypeOf<keyof Terms>().toEqualTypeOf<"params" | "link" | "b">();
expectTypeOf<{
	params: { app: string };
	link: TextSnippet;
	b: TextSnippet;
}>().toExtend<Terms>();
expectTypeOf<{
	params: { app: string };
	link: TextSnippet;
}>().not.toExtend<Terms>();
expectTypeOf<{ link: TextSnippet; b: TextSnippet }>().not.toExtend<Terms>();
expectTypeOf<{
	params: { app: string };
	link: TextSnippet;
	b: Snippet<[value: number]>;
}>().not.toExtend<Terms>();

type Matches = RichPropsOf<{ count: number }, "link">;

expectTypeOf<{
	params: { count: number };
	link: TextSnippet;
}>().toExtend<Matches>();
expectTypeOf<{
	params: { count: string };
	link: TextSnippet;
}>().not.toExtend<Matches>();

type KnownIssue = RichPropsOf<undefined, "link">;

expectTypeOf<{ link: TextSnippet }>().toExtend<KnownIssue>();
expectTypeOf<{
	params: { app: string };
	link: TextSnippet;
}>().not.toExtend<KnownIssue>();

expectTypeOf(t<"common.actions.close">).parameters.toEqualTypeOf<
	[key: "common.actions.close"]
>();
expectTypeOf(t<"common.time.minutes">).parameters.toEqualTypeOf<
	[key: "common.time.minutes", params: { count: number }]
>();
expectTypeOf(sourceText).toEqualTypeOf<Translate>();
expectTypeOf(
	richParts<"feedback.requestBlocked.cloudflare.knownIssue">,
).parameters.toEqualTypeOf<
	[key: "feedback.requestBlocked.cloudflare.knownIssue"]
>();
expectTypeOf<
	RichProps<"feedback.requestBlocked.cloudflare.knownIssue">
>().toExtend<{
	key: "feedback.requestBlocked.cloudflare.knownIssue";
	link: TextSnippet;
}>();
expectTypeOf<RichKey>().not.toExtend<MessageKey>();
expectTypeOf(richParts<Untyped>).parameters.toEqualTypeOf<
	[key: Untyped, params: never]
>();
expectTypeOf<{ key: Untyped }>().not.toExtend<RichProps<Untyped>>();
