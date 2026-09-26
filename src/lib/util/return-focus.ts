import { tick } from "svelte";

export function returnFocus(opener: HTMLElement): void {
	void tick().then(() => {
		if (!opener.isConnected) return;
		const focused = document.activeElement;
		if (focused !== null && focused !== document.body) return;
		opener.focus({ preventScroll: true });
	});
}
