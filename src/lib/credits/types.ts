export type CreditEcosystem = "rust" | "npm" | "android" | "asset";

export const creditPlatforms = [
	"android",
	"linux",
	"macos",
	"windows",
] as const;

export type CreditPlatform = (typeof creditPlatforms)[number];

export type Highlight = {
	ref: { ecosystem: CreditEcosystem; id: string };
	name: string;
	blurb: string;
	url: string;
};
