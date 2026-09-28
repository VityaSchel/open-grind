export type SignedUrl = { unsigned: string; expiresAt: number };

export function parseSignedUrl(url: string): SignedUrl | null {
	const queryStart = url.indexOf("?");
	if (queryStart === -1) return null;
	const query = new URLSearchParams(url.slice(queryStart + 1));
	if (!query.has("Signature")) return null;
	const expires = query.get("Expires");
	return {
		unsigned: url.slice(0, queryStart),
		expiresAt:
			expires === null
				? Number.POSITIVE_INFINITY
				: Number(expires) * 1000,
	};
}

export function unsignedUrl(url: string): string {
	return parseSignedUrl(url)?.unsigned ?? url;
}

export function stableSignedUrl<Latest extends string | null>({
	latest,
	loaded,
}: {
	latest: Latest;
	loaded: string | null;
}): Latest | string {
	if (latest === null || loaded === null) return latest;
	return unsignedUrl(loaded) === unsignedUrl(latest) ? loaded : latest;
}
