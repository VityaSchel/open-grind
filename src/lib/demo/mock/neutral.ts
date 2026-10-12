import { screenshotsEnabled } from "../config";

const EMOJI = /\p{Extended_Pictographic}|\p{Emoji_Modifier}|\u200D|\uFE0F/gu;
const NEUTRAL_FILLER = "Lorem";

export function neutralText(text: string): string {
	if (!screenshotsEnabled) return text;
	const neutral = text.replace(EMOJI, "").replace(/ {2,}/g, " ").trim();
	return neutral === "" && text !== "" ? NEUTRAL_FILLER : neutral;
}
