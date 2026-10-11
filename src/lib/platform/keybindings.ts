import { parseKeybinding } from "tinykeys";

export type Shortcut = {
	readonly modifier: "meta" | "control";
	readonly key: string;
};

export const commandCenterKeybinding = "$mod+k";

export function parseShortcut(keybinding: string): Shortcut {
	const [press] = parseKeybinding(keybinding);
	const [modifiers = [], , key = ""] = press ?? [];
	return {
		modifier: modifiers.some((modifier) => modifier === "Meta")
			? "meta"
			: "control",
		key: String(key).toUpperCase(),
	};
}
