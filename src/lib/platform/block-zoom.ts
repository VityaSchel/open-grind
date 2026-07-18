const ZOOM_KEYS = new Set(["+", "-", "=", "_", "0"]);

export function blockZoom(): () => void {
	const onWheel = (event: WheelEvent) => {
		if (event.ctrlKey || event.metaKey) event.preventDefault();
	};
	const onKeyDown = (event: KeyboardEvent) => {
		if (!(event.ctrlKey || event.metaKey)) return;
		if (ZOOM_KEYS.has(event.key)) event.preventDefault();
	};
	// Passive wheel listener can't cancel the zoom
	window.addEventListener("wheel", onWheel, { passive: false });
	window.addEventListener("keydown", onKeyDown);
	return () => {
		window.removeEventListener("wheel", onWheel);
		window.removeEventListener("keydown", onKeyDown);
	};
}
