export function deepEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (typeof a === "number" && typeof b === "number") {
		return Number.isNaN(a) && Number.isNaN(b);
	}
	if (
		typeof a !== "object" ||
		typeof b !== "object" ||
		a === null ||
		b === null
	) {
		return false;
	}
	if (a instanceof Date || b instanceof Date) {
		return (
			a instanceof Date &&
			b instanceof Date &&
			deepEqual(a.getTime(), b.getTime())
		);
	}
	if (Array.isArray(a) || Array.isArray(b)) {
		return (
			Array.isArray(a) &&
			Array.isArray(b) &&
			a.length === b.length &&
			a.every((item, index) => deepEqual(item, b[index]))
		);
	}
	if (
		Object.getPrototypeOf(a) !== Object.prototype ||
		Object.getPrototypeOf(b) !== Object.prototype
	) {
		return false;
	}
	const entries = Object.entries(a);
	return (
		entries.length === Object.keys(b).length &&
		entries.every(
			([key, value]) =>
				Object.hasOwn(b, key) &&
				deepEqual(value, (b as Record<string, unknown>)[key]),
		)
	);
}
