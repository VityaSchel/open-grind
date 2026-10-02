export type StackRelation = "push" | "pop";

export function stackRelation({
	from,
	to,
}: {
	from: string;
	to: string;
}): StackRelation | null {
	if (from === to) return null;
	if (from.startsWith(`${to}/`)) return "pop";
	if (to.startsWith(`${from}/`)) return "push";
	return null;
}

export function ancestorsOf<Entry extends { path: string }>(
	entries: Entry[],
	pathname: string,
): Entry[] {
	return entries.filter((entry) => pathname.startsWith(`${entry.path}/`));
}

export function pushedFromChain({
	pathname,
	earlier,
}: {
	pathname: string;
	earlier: (string | null)[];
}): { path: string }[] {
	const chain: { path: string }[] = [];
	let child = pathname;
	for (const path of earlier) {
		if (
			path === null ||
			stackRelation({ from: path, to: child }) !== "push"
		)
			break;
		chain.unshift({ path });
		child = path;
	}
	return chain;
}
