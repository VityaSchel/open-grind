import { expectTypeOf } from "vitest";
import type { Snippet } from "svelte";

import {
	type KeyArgs,
	type MessageKey,
	type RichArgs,
	type RichKey,
	type RichKeyWith,
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

type Terms = RichPropsOf<{
	app: "placeholder";
	link: "tag";
	who: "text";
	count: "count";
}>;

expectTypeOf<Terms>().toEqualTypeOf<{
	app: string;
	link: TextSnippet;
	who: string;
	count: number;
}>();

type KnownIssue = RichProps<"feedback.requestBlocked.cloudflare.knownIssue">;

expectTypeOf<{
	key: "feedback.requestBlocked.cloudflare.knownIssue";
	link: TextSnippet;
}>().toExtend<KnownIssue>();
expectTypeOf<{
	key: "feedback.requestBlocked.cloudflare.knownIssue";
}>().not.toExtend<KnownIssue>();
expectTypeOf<{
	key: "feedback.requestBlocked.cloudflare.knownIssue";
	link: string;
}>().not.toExtend<KnownIssue>();
expectTypeOf<{
	key: "feedback.requestBlocked.cloudflare.knownIssue";
	link: Snippet<[value: number]>;
}>().not.toExtend<KnownIssue>();

type Tracked = RichProps<"auth.passwordReset.unimplemented">;

expectTypeOf<{
	key: "auth.passwordReset.unimplemented";
	issue: string;
	link: TextSnippet;
}>().toExtend<Tracked>();
expectTypeOf<{
	key: "auth.passwordReset.unimplemented";
	issue: number;
	link: TextSnippet;
}>().not.toExtend<Tracked>();
expectTypeOf<{
	key: "auth.passwordReset.unimplemented";
	link: TextSnippet;
}>().not.toExtend<Tracked>();

type InProgress = RichProps<"auth.signIn.errors.inProgress">;

expectTypeOf<{
	key: "auth.signIn.errors.inProgress";
	provider: string;
}>().toExtend<InProgress>();
expectTypeOf<{
	key: "auth.signIn.errors.inProgress";
	provider: TextSnippet;
}>().not.toExtend<InProgress>();

type Views = RichProps<
	| "interest.views.preview.viewCount"
	| "interest.views.preview.cappedViewCount"
>;

expectTypeOf<{
	key: "interest.views.preview.viewCount";
	count: number;
	srOnly: TextSnippet;
}>().toExtend<Views>();
expectTypeOf<{
	key: "interest.views.preview.viewCount";
	count: string;
	srOnly: TextSnippet;
}>().not.toExtend<Views>();
expectTypeOf<{
	key: "interest.views.preview.viewCount";
	srOnly: TextSnippet;
}>().not.toExtend<Views>();

expectTypeOf<RichKeyWith<{ issue: "text"; link: "tag" }>>().toEqualTypeOf<
	| "auth.passwordReset.unimplemented"
	| "auth.signUp.unimplemented"
	| "browse.rightNow.unimplemented"
	| "chat.composer.attachments.location.unimplemented"
	| "chat.composer.voiceMessage.unimplemented"
	| "settings.account.unimplemented"
	| "settings.app.discreetAppIcon.unimplemented"
	| "settings.app.pin.unimplemented"
>();
expectTypeOf<"auth.passwordReset.unimplemented">().not.toExtend<
	RichKeyWith<{ link: "tag" }>
>();

expectTypeOf<RichArgs<"media.lightbox.errors.decoderMissing">>().toEqualTypeOf<
	[]
>();
expectTypeOf<RichArgs<"interest.views.preview.viewCount">>().toEqualTypeOf<
	[params: { count: number }]
>();
expectTypeOf<RichArgs<"auth.passwordReset.unimplemented">>().toEqualTypeOf<
	[params: { issue: string }]
>();
expectTypeOf<RichArgs<"auth.signIn.errors.inProgress">>().toEqualTypeOf<
	[params: { provider: string }]
>();

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
expectTypeOf<"interest.taps.empty.description">().not.toExtend<MessageKey>();
expectTypeOf<"auth.signIn.errors.inProgress">().toExtend<MessageKey>();
expectTypeOf<"auth.signIn.errors.inProgress">().toExtend<RichKey>();
expectTypeOf<"common.actions.close">().not.toExtend<RichKey>();
expectTypeOf<"common.time.minutes">().not.toExtend<RichKey>();
expectTypeOf<RichKey>().not.toExtend<MessageKey>();
expectTypeOf(richParts<Untyped>).parameters.toEqualTypeOf<
	[key: Untyped, params: never]
>();
expectTypeOf<{ key: Untyped }>().not.toExtend<RichProps<Untyped>>();
