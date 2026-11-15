import type { RichKeyWith } from "../i18n/types";

export type CreditEcosystem = "rust" | "npm" | "android" | "asset";

export const creditPlatforms = [
	"android",
	"linux",
	"macos",
	"windows",
] as const;

export type CreditPlatform = (typeof creditPlatforms)[number];

export type HighlightBlurbKey = RichKeyWith<{ projectLink: "placeholder" }>;

export type Highlight = {
	ref: { ecosystem: CreditEcosystem; id: string };
	name: string;
	blurb: HighlightBlurbKey;
	url: string;
};
