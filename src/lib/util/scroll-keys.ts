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
	return (
		target instanceof HTMLInputElement ||
		target instanceof HTMLTextAreaElement ||
		target instanceof HTMLSelectElement ||
		(target instanceof HTMLElement && target.isContentEditable)
	);
}
