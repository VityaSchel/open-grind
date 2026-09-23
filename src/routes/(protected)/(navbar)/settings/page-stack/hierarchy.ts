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
