import { nearestScrollableAncestor } from "$lib/util/scroll";

type ObserveIntersectionOptions = {
	handle?: () => void;
	root?: "scroller";
	rootMargin?: string;
	once?: boolean;
};

export function observeIntersection(
	node: HTMLElement,
	{ handle, root, rootMargin, once = false }: ObserveIntersectionOptions,
): { destroy: () => void } {
	if (handle === undefined) return { destroy: () => {} };
	const observer = new IntersectionObserver(
		(entries) => {
			if (!entries[0]?.isIntersecting) return;
			handle();
			if (once) observer.disconnect();
		},
		{
			root: root === "scroller" ? nearestScrollableAncestor(node) : null,
			rootMargin,
		},
	);
	observer.observe(node);
	return {
		destroy: () => {
			observer.disconnect();
		},
	};
}
