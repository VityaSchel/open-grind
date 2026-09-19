import { tick } from "svelte";

export type ScrollableListState = {
	loading: boolean;
	error: Error | null;
	scrollY: number;
};

export function restoreScrollOnce({
	container,
	state,
	resolveTop,
}: {
	container: () => HTMLElement | null;
	state: ScrollableListState;
	resolveTop?: (restore: {
		scroller: HTMLElement;
		savedTop: number;
	}) => number;
}): void {
	let restored = false;
	$effect(() => {
		const el = container();
		if (restored || !el || state.loading || state.error !== null) return;
		restored = true;
		const savedTop = state.scrollY;
		let pending = true;
		void tick().then(() => {
			if (!pending) return;
			pending = false;
			const top = resolveTop?.({ scroller: el, savedTop }) ?? savedTop;
			if (top > 0) el.scrollTop = top;
		});
		return () => {
			if (pending) restored = false;
			pending = false;
		};
	});
}
