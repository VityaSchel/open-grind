export function inertWhileClosing(menu: HTMLElement): () => void {
	const sync = () => {
		menu.toggleAttribute("inert", menu.dataset.state === "closed");
	};
	sync();
	const observer = new MutationObserver(sync);
	observer.observe(menu, {
		attributes: true,
		attributeFilter: ["data-state"],
	});
	return () => {
		observer.disconnect();
	};
}
