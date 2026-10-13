import { cachedFetch } from "$lib/api/cache";
import { fetchExternal } from "$lib/api/transport";
import { demoEnabled, demoGaymojiImageUrl } from "$lib/demo";
import {
	type Gaymoji,
	gaymojiManifestSchema,
} from "$lib/model/messaging/gaymoji";
import { proxyMediaUrl } from "$lib/util/media";

export const GAYMOJI_MANIFEST_URL =
	"https://cdns.grindr.com/grindr/chat/gaymoji";

export type GaymojiItem = {
	id: string;
	label: string;
	imageUrl: string;
	imageHash: string;
};

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
		imageHash: `gaymoji/${id}`,
	};
}

export const getGaymoji = cachedFetch(async (): Promise<GaymojiItem[]> => {
	const response = await fetchExternal({
		url: new URL(GAYMOJI_MANIFEST_URL),
	});
	return response.jsonParsed(gaymojiManifestSchema).gaymoji.map(gaymojiItem);
});
