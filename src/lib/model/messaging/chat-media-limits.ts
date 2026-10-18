import { formatNumber } from "$lib/i18n/format";

const CHAT_MEDIA_MAX_MEGABYTES = 120;
export const CHAT_MEDIA_MAX_BYTES = CHAT_MEDIA_MAX_MEGABYTES * 1024 * 1024;

export function chatMediaMaxLabel(): string {
	return formatNumber({
		value: CHAT_MEDIA_MAX_MEGABYTES,
		preset: "sizeMegabytes",
	});
}
