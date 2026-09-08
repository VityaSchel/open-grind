import type { CreditEcosystem } from "../../src/lib/credits/types";

export type CreditEntry = {
	id: string;
	name: string;
	version?: string;
	ecosystem: CreditEcosystem;
	spdx: string;
	shipped?: string;
	url?: string;
	textHashes: string[];
};

export type CreditsChunk = {
	entries: CreditEntry[];
	texts: Record<string, string>;
};
