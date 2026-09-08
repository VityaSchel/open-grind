const slot = Symbol.for("og-credits: package roots in the client bundle");

export const collectedRoots = () => {
	const shared = globalThis as Record<symbol, Set<string> | undefined>;
	return (shared[slot] ??= new Set<string>());
};
