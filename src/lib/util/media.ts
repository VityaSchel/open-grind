import { convertFileSrc, isTauri } from "@tauri-apps/api/core";

import { demoEnabled, demoMediaUrl } from "$lib/demo";
import { toBase64Url } from "$lib/util/base64";

const MEDIA_SCHEME = "ogmedia";

const CDN_VARIANTS = {
	thumb: "thumb/320x320",
	full: "profile/1024x1024",
} as const;

const FETCHER_TAG = { image: "i", video: "v" } as const;

type ProxyOptions = { as?: keyof typeof FETCHER_TAG };

export function proxyMediaUrl(url: string, options?: ProxyOptions): string;
export function proxyMediaUrl(
	url: string | null | undefined,
	options?: ProxyOptions,
): string | null;
export function proxyMediaUrl(
	url: string | null | undefined,
	{ as = "image" }: ProxyOptions = {},
): string | null {
	if (typeof url !== "string") return null;
	if (demoEnabled || !isTauri()) return url;
	if (!url.startsWith("https://")) return url;
	const payload = toBase64Url(new TextEncoder().encode(url));
	return convertFileSrc(`${FETCHER_TAG[as]}${payload}`, MEDIA_SCHEME);
}

export function profileMediaUrl({
	mediaHash,
	size,
}: {
	mediaHash: string;
	size: keyof typeof CDN_VARIANTS;
}): string {
	if (demoEnabled) return demoMediaUrl(mediaHash);
	return proxyMediaUrl(
		`https://cdns.grindr.com/images/${CDN_VARIANTS[size]}/${mediaHash}`,
	);
}
