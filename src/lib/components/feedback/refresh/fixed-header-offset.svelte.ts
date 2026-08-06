import { tick } from "svelte";

export function fixedHeaderOffset({
	container,
	enabled,
}: {
	container: () => HTMLElement | null | undefined;
	enabled: () => boolean;
}): { readonly px: number } {
	let px = $state(0);

	$effect(() => {
		const el = container();
		if (!enabled() || !el) return;
		const measure = () => {
			const header = document.querySelector("[data-fixed-header]");
			if (!header) {
				px = 0;
				return;
			}
			px = Math.max(
				0,
				header.getBoundingClientRect().bottom -
					el.getBoundingClientRect().top,
			);
		};
		void tick().then(measure);
		window.addEventListener("resize", measure);
		return () => window.removeEventListener("resize", measure);
	});

	return {
		get px() {
			return px;
		},
	};
}
