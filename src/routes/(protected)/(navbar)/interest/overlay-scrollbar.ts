export function hidesOverlayScrollbar({
	paging,
	container,
}: {
	paging: boolean;
	container: HTMLElement | null;
}): boolean {
	if (!paging || !container) return false;
	return container.offsetWidth === container.clientWidth;
}
