import { type MessageKey, t } from "#lib/i18n/index.ts";
import type { GifAlt } from "#lib/api/messaging/gifs.ts";

const fallbackAltKeys = {
	untitled: "chat.messagePreview.gif",
	linked: "chat.composer.stickers.gifs.linkedGif",
} as const satisfies Record<Exclude<GifAlt["kind"], "title">, MessageKey>;

export function gifAltText(alt: GifAlt): string {
	return alt.kind === "title" ? alt.title : t(fallbackAltKeys[alt.kind]);
}
