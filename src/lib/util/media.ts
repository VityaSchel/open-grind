import { demoEnabled, demoMediaUrl } from "$lib/demo";

const CDN_VARIANTS = {
	thumb: "thumb/320x320",
	full: "profile/1024x1024",
} as const;

export function profileMediaUrl(
	mediaHash: string,
	size: keyof typeof CDN_VARIANTS,
): string {
	if (demoEnabled) return demoMediaUrl(mediaHash);
	return `https://cdns.grindr.com/images/${CDN_VARIANTS[size]}/${mediaHash}`;
}
