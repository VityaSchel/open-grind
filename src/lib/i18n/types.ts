import type { Snippet } from "svelte";

import type { Messages, RichMessages } from "./generated";

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

type NameProps = {
	tag: Snippet<[text: string]>;
	placeholder: string;
	text: string;
	count: number;
};

type NameKind = keyof NameProps;

export type RichPropsOf<Names extends Record<string, NameKind>> = {
	[Name in keyof Names]: NameProps[Names[Name]];
};

type ValuesOf<Names extends Record<string, NameKind>> = {
	[Name in keyof Names as Names[Name] extends "tag"
		? never
		: Name]: Names[Name] extends "count" ? number : string;
};

type OptionalValues<Values> = keyof Values extends never ? undefined : Values;

export type RichProps<K extends RichKey> = {
	key: K;
} & (unknown extends RichMessages[K]
	? { key: never }
	: UnionToIntersection<
			K extends RichKey ? RichPropsOf<RichMessages[K]> : never
		>);

export type RichArgs<K extends RichKey> = unknown extends RichMessages[K]
	? [params: never]
	: KeyArgs<
			K extends RichKey
				? OptionalValues<ValuesOf<RichMessages[K]>>
				: never
		>;

export type RichKeyWith<Names> = {
	[K in RichKey]: [RichMessages[K]] extends [Names]
		? [Names] extends [RichMessages[K]]
			? K
			: never
		: never;
}[RichKey];

export type RichPart = { readonly tag?: string; readonly text: string };
