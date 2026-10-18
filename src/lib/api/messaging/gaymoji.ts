import { cachedFetch } from "$lib/api/cache";
import { fetchExternal } from "$lib/api/transport";
import { demoEnabled, demoGaymojiImageUrl } from "$lib/demo";
import {
	type Gaymoji,
	type GaymojiManifest,
	gaymojiManifestSchema,
} from "$lib/model/messaging/gaymoji";
import { proxyMediaUrl } from "$lib/util/media";

const GAYMOJI_MANIFEST_URL = "https://cdns.grindr.com/grindr/chat/gaymoji";

const IMAGE_HASH_PREFIX = "gaymoji/";

export type GaymojiItem = {
	id: string;
	label: string;
	imageUrl: string;
	imageHash: string;
};

export type GaymojiCategory = { name: string; items: GaymojiItem[] };

const sortPrefix = /^(?:(?:\d+|[a-z]|man_[a-z])_)+/;

function gaymojiLabel(name: string): string {
	const spaced = (text: string) =>
		text.replaceAll("_", " ").replace(/\s+/g, " ").trim();
	const label = spaced(name.replace(sortPrefix, "")).replace(/[\s,.]+$/, "");
	return label === "" ? spaced(name) : label;
}

function gaymojiImageUrl(id: string): string {
	if (demoEnabled) return demoGaymojiImageUrl(id);
	return proxyMediaUrl(`${GAYMOJI_MANIFEST_URL}/${encodeURIComponent(id)}`);
}

function gaymojiItem({ id, name }: Gaymoji): GaymojiItem {
	return {
		id,
		label: gaymojiLabel(name),
		imageUrl: gaymojiImageUrl(id),
		imageHash: `${IMAGE_HASH_PREFIX}${id}`,
	};
}

export function gaymojiFromImageHash(imageHash: string): {
	imageUrl: string;
	label: string;
} {
	const id = imageHash.startsWith(IMAGE_HASH_PREFIX)
		? imageHash.slice(IMAGE_HASH_PREFIX.length)
		: imageHash;
	return {
		imageUrl: gaymojiImageUrl(id),
		label: gaymojiLabel(id.replace(/\.png$/, "")),
	};
}

function groupByCategory({
	category,
	gaymoji,
}: GaymojiManifest): GaymojiCategory[] {
	const groups = new Map<string, GaymojiItem[]>(
		category.map(({ name }) => [name, []]),
	);
	for (const entry of gaymoji) {
		const items = groups.get(entry.category);
		if (items) items.push(gaymojiItem(entry));
		else groups.set(entry.category, [gaymojiItem(entry)]);
	}
	return [...groups]
		.filter(([, items]) => items.length > 0)
		.map(([name, items]) => ({ name, items }));
}

export const getGaymoji = cachedFetch(async (): Promise<GaymojiCategory[]> => {
	const response = await fetchExternal({
		url: new URL(GAYMOJI_MANIFEST_URL),
	});
	return groupByCategory(response.jsonParsed(gaymojiManifestSchema));
});
