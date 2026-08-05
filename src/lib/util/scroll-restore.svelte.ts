import { tick } from "svelte";

export type ScrollableListState = {
	loading: boolean;
	error: Error | null;
	scrollY: number;
};

export function restoreScrollOnce(
	container: () => HTMLElement | null,
	state: ScrollableListState,
): void {
	let restored = false;
	$effect(() => {
		const el = container();
		if (restored || !el || state.loading || state.error !== null) return;
		restored = true;
		const top = state.scrollY;
		if (top > 0) void tick().then(() => (el.scrollTop = top));
	});
}
