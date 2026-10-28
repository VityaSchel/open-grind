import { vi } from "vitest";

export function stubMapResizeObserver() {
	let resize: (() => void) | undefined;
	vi.stubGlobal(
		"ResizeObserver",
		class {
			constructor(private callback: () => void) {}
			observe(target: Element) {
				if (target.classList.contains("leaflet-container"))
					resize = this.callback;
			}
			unobserve() {}
			disconnect() {}
		},
	);
	return () => {
		if (!resize) throw new Error("Map resize observer was not mounted");
		resize();
	};
}
