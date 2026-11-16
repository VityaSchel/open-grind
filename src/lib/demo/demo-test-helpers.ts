const SETTLE_WINDOW_MS = 50;

export async function settlesSoon(pending: Promise<unknown>): Promise<boolean> {
	const later = new Promise((resolve) =>
		setTimeout(resolve, SETTLE_WINDOW_MS, false),
	);
	const settled = pending.then(
		() => true,
		() => true,
	);
	return (await Promise.race([settled, later])) as boolean;
}
