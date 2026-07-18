const ZOOM_KEYS = new Set(["+", "-", "=", "_", "0"]);

export function blockZoom(): () => void {
	const onKeyDown = (event: KeyboardEvent) => {
		if (!(event.ctrlKey || event.metaKey)) return;
		if (ZOOM_KEYS.has(event.key)) event.preventDefault();
	};
	window.addEventListener("keydown", onKeyDown);
	return () => {
		window.removeEventListener("keydown", onKeyDown);
	};
}
