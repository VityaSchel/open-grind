import { typesText } from "#lib/util/text-entry.ts";

export const scrollKeysToward: Record<"top" | "bottom", ReadonlySet<string>> = {
	top: new Set(["ArrowUp", "PageUp", "Home"]),
	bottom: new Set(["ArrowDown", "PageDown", "End"]),
};

export const scrollKeys: ReadonlySet<string> = new Set([
	...scrollKeysToward.top,
	...scrollKeysToward.bottom,
	" ",
]);

export function keyScrollsToward({
	event,
	edge,
}: {
	event: KeyboardEvent;
	edge: "top" | "bottom";
}): boolean {
	if (event.key === " ") return event.shiftKey === (edge === "top");
	return scrollKeysToward[edge].has(event.key);
}

export function consumesScrollKeys(target: EventTarget | null): boolean {
	return typesText(target) || target instanceof HTMLSelectElement;
}
