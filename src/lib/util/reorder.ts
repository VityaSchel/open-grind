export function moveItem<T>({
	items,
	from,
	to,
}: {
	items: T[];
	from: number;
	to: number;
}): T[] {
	if (from === to || from < 0 || from >= items.length) return items;
	const clamped = Math.min(Math.max(to, 0), items.length - 1);
	const next = [...items];
	next.splice(clamped, 0, ...next.splice(from, 1));
	return next;
}

export function previewSlot({
	index,
	from,
	to,
}: {
	index: number;
	from: number;
	to: number;
}): number {
	if (index === from) return to;
	if (from < to) return index > from && index <= to ? index - 1 : index;
	return index >= to && index < from ? index + 1 : index;
}

export function nearestSlot({
	centers,
	x,
	y,
}: {
	centers: { x: number; y: number }[];
	x: number;
	y: number;
}): number {
	let best = 0;
	let bestDistance = Infinity;
	centers.forEach((center, index) => {
		const distance = (center.x - x) ** 2 + (center.y - y) ** 2;
		if (distance < bestDistance) {
			bestDistance = distance;
			best = index;
		}
	});
	return best;
}
