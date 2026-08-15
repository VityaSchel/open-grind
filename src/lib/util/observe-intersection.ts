import { nearestScrollableAncestor } from "$lib/util/scroll";

type ObserveIntersectionOptions = {
	handle?: () => unknown;
	rootMargin?: string;
	once?: boolean;
};

export function observeIntersection(
	node: HTMLElement,
	{ handle, rootMargin, once = false }: ObserveIntersectionOptions,
): { destroy: () => void } {
	if (handle === undefined) return { destroy: () => {} };
	const observer = new IntersectionObserver(
		(entries) => {
			if (!entries[0]?.isIntersecting) return;
			if (once) observer.disconnect();
			void Promise.resolve(handle()).catch((error: unknown) =>
				console.error(error),
			);
		},
		{ root: nearestScrollableAncestor(node), rootMargin },
	);
	observer.observe(node);
	return {
		destroy: () => {
			observer.disconnect();
		},
	};
}
