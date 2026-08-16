import { parseKeybinding } from "tinykeys";

export function modifierKeyLabel(): string {
	const [press] = parseKeybinding("$mod+k");
	return press?.[0].includes("Meta") ? "⌘" : "Ctrl";
}
