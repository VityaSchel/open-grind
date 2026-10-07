import type { PullPosition } from "./scroll-chain";

const roundingSlopPx = () => 1 + 1 / devicePixelRatio;

export const edgeGap = (rawGap: number) =>
	Math.abs(rawGap) <= roundingSlopPx() ? 0 : rawGap;

const floorGap = (el: Element) =>
	edgeGap(el.scrollHeight - el.clientHeight - el.scrollTop);

export function scrollGeometry({
	container,
	position,
}: {
	container: () => HTMLElement | null | undefined;
	position: () => PullPosition;
}) {
	const boundaryDistance = () => {
		const el = container();
		if (!el) return 0;
		return position() === "top" ? el.scrollTop : floorGap(el);
	};

	return {
		boundaryDistance,
		overscrollPx: () => -boundaryDistance(),
		scrollToRest: (behavior: ScrollBehavior = "instant") => {
			const el = container();
			if (!el) return;
			el.scroll({
				top: position() === "top" ? 0 : el.scrollHeight,
				behavior,
			});
		},
	};
}
