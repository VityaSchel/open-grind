export type CreditEcosystem = "rust" | "npm" | "android" | "asset";

export type Highlight = {
	ref: { ecosystem: CreditEcosystem; id: string };
	name: string;
	blurb: string;
	url: string;
};
