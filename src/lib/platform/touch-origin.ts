export type TouchOriginHints = {
	pointerType?: string;
	sourceCapabilities?: { firesTouchEvents?: boolean } | null;
};

export function firedByTouch(event: Event): boolean {
	const { pointerType, sourceCapabilities } = event as TouchOriginHints;
	if (pointerType === "touch" || pointerType === "pen") return true;
	return sourceCapabilities?.firesTouchEvents === true;
}
