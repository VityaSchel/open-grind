import { platformNames } from "$lib/platform/os";
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

type CreditGroup = { title: string; entries: LoadedEntry[] };

export type Credits = { cards: HighlightCard[]; groups: CreditGroup[] };

const GROUPS: ({ title: string } & (
	| { ecosystems: CreditEcosystem[] }
	| { platform: CreditPlatform }
))[] = [
	{ title: "Web packages", ecosystems: ["npm", "asset"] },
	{ title: "Rust crates", ecosystems: ["rust"] },
	...creditPlatforms.map((platform) => ({
		title: `${platformNames[platform]} libraries`,
		platform,
	})),
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
	const groups = GROUPS.map(({ title, ...scope }) => ({
		title,
		entries: rest
			.filter((entry) =>
				"platform" in scope
					? entry.platform === scope.platform
					: entry.platform === undefined &&
						scope.ecosystems.includes(entry.ecosystem),
			)
			.sort(compareEntries),
	})).filter((group) => group.entries.length > 0);

	return { cards, groups };
};
