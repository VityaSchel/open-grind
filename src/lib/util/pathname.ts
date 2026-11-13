export function isWithin({
	pathname,
	root,
}: {
	pathname: string;
	root: string;
}): boolean {
	const subtree = root.endsWith("/") ? root : `${root}/`;
	return pathname === root || pathname.startsWith(subtree);
}

export function entryPathname(url: string): string {
	return new URL(url).pathname || "/";
}
