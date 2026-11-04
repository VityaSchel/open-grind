export type PagePoint = { x: number; y: number };

export function uncoveredCenter(element: HTMLElement): PagePoint | null {
	const box = element.getBoundingClientRect();
	const center = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
	const hit = document.elementFromPoint(center.x, center.y);
	return hit !== null && element.contains(hit) ? center : null;
}
