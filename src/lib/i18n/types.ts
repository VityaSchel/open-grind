import type { Snippet } from "svelte";

import type { Messages, RichMessages, RichTags } from "./generated";

export type MessageKey = keyof Messages;
export type RichKey = keyof RichMessages;
export type PlainMessageKey = {
	[K in MessageKey]: [Messages[K]] extends [undefined] ? K : never;
}[MessageKey];

type UnionToIntersection<U> = (
	U extends unknown ? (union: U) => void : never
) extends (intersection: infer I) => void
	? I
	: never;

export type Params = Readonly<Record<string, string | number>>;

type ParamsOf<P> =
	UnionToIntersection<Exclude<P, undefined>> extends infer I extends Params
		? I
		: never;
export type KeyArgs<P> = unknown extends P
	? [params: never]
	: [P] extends [undefined]
		? []
		: [params: ParamsOf<P>];

export type RichPropsOf<P, Tags extends string> = (unknown extends P
	? { params: never }
	: [P] extends [undefined]
		? { params?: undefined }
		: { params: ParamsOf<P> }) & { [Tag in Tags]: Snippet<[text: string]> };

export type RichProps<K extends RichKey> = { key: K } & RichPropsOf<
	RichMessages[K],
	RichTags[K]
>;

export type RichPart = { readonly tag?: string; readonly text: string };
