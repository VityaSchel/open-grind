export function pointerEvent(
	type: string,
	{
		pointerType = "touch",
		x = 10,
		y = 10,
	}: { pointerType?: string; x?: number; y?: number } = {},
): MouseEvent {
	const event = new MouseEvent(type, {
		bubbles: true,
		cancelable: true,
		clientX: x,
		clientY: y,
	});
	Object.defineProperties(event, {
		pointerId: { value: 1 },
		pointerType: { value: pointerType },
	});
	return event;
}
