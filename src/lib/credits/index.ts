import { highlights } from "./highlights";
import {
	type CreditEcosystem,
	type CreditPlatform,
	creditPlatforms,
	type Highlight,
} from "./types";

export type LoadedEntry = {
	id: string;
	name: string;
	ecosystem: CreditEcosystem;
	platform?: CreditPlatform;
	versions: string[];
	spdx: string;
	shipped?: string;
	url?: string;
	texts: string[];
};

export type HighlightCard = Highlight & { entry?: LoadedEntry };

export type SharedCreditSection = "webPackages" | "rustCrates";

export type CreditSection =
	| { kind: "shared"; id: SharedCreditSection; ecosystems: CreditEcosystem[] }
	| { kind: "platform"; id: CreditPlatform };

export type CreditGroup = CreditSection & { entries: LoadedEntry[] };

export type Credits = { cards: HighlightCard[]; groups: CreditGroup[] };

const SECTIONS: CreditSection[] = [
	{ kind: "shared", id: "webPackages", ecosystems: ["npm", "asset"] },
	{ kind: "shared", id: "rustCrates", ecosystems: ["rust"] },
	...creditPlatforms.map((id): CreditSection => ({ kind: "platform", id })),
];

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const compareEntries = (a: LoadedEntry, b: LoadedEntry) =>
	compare(a.name.toLowerCase(), b.name.toLowerCase()) ||
	compare(a.spdx, b.spdx);

export const loadCredits = async (): Promise<Credits> => {
	const { entries, texts } = await import("./generated.json");
	const textsByHash = new Map(texts.map(({ hash, text }) => [hash, text]));

	const loaded: LoadedEntry[] = entries.map(({ textHashes, ...entry }) => ({
		...entry,
		ecosystem: entry.ecosystem as CreditEcosystem,
		platform: entry.platform as CreditPlatform | undefined,
		texts: textHashes.flatMap((hash) => textsByHash.get(hash) ?? []),
	}));

	const byRef = new Map(
		loaded.map((entry) => [`${entry.ecosystem}:${entry.id}`, entry]),
	);
	const cards = highlights.map((highlight) => ({
		...highlight,
		entry: byRef.get(`${highlight.ref.ecosystem}:${highlight.ref.id}`),
	}));
	const featured = new Set(cards.map((card) => card.entry));

	const rest = loaded.filter((entry) => !featured.has(entry));
	const groups = SECTIONS.map((section) => ({
		...section,
		entries: rest
			.filter((entry) =>
				section.kind === "platform"
					? entry.platform === section.id
					: entry.platform === undefined &&
						section.ecosystems.includes(entry.ecosystem),
			)
			.sort(compareEntries),
	})).filter((group) => group.entries.length > 0);

	return { cards, groups };
};
