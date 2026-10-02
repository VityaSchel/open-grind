import type {
	CreditEcosystem,
	CreditPlatform,
} from "../../src/lib/credits/types";

export type CreditEntry = {
	id: string;
	name: string;
	version?: string;
	ecosystem: CreditEcosystem;
	platform?: CreditPlatform;
	spdx: string;
	shipped?: string;
	url?: string;
	textHashes: string[];
};

export type CreditsChunk = {
	entries: CreditEntry[];
	texts: Record<string, string>;
};
