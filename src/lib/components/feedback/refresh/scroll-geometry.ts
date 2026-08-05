import type { PullPosition } from "./scroll-chain";

export function scrollGeometry({
	container,
	position,
}: {
	container: () => HTMLElement | null | undefined;
	position: () => PullPosition;
}) {
	const scrollTop = () => container()?.scrollTop ?? 0;
	const maxScrollY = () => {
		const el = container();
		return el ? el.scrollHeight - el.clientHeight : 0;
	};
	const restTop = () => (position() === "top" ? 0 : maxScrollY());

	return {
		scrollTop,
		maxScrollY,
		overscrollPx: () =>
			position() === "top" ? -scrollTop() : scrollTop() - maxScrollY(),
		boundaryDistance: () =>
			position() === "top" ? scrollTop() : maxScrollY() - scrollTop(),
		scrollToRest: (behavior: ScrollBehavior = "instant") => {
			const el = container();
			if (!el) return;
			const top = restTop();
			if (Math.abs(scrollTop() - top) >= 1) el.scroll({ top, behavior });
		},
	};
}
