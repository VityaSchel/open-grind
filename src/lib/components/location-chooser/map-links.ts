import { openExternalLink } from "#lib/platform/link-opener.ts";

export function openMapLinksExternally(container: HTMLElement): () => void {
	const openExternally = (event: MouseEvent) => {
		if (!(event.target instanceof HTMLElement)) return;
		const href = event.target.closest("a[href]")?.getAttribute("href");
		if (!href) return;
		event.preventDefault();
		openExternalLink(href);
	};
	container.addEventListener("click", openExternally);
	return () => container.removeEventListener("click", openExternally);
}
