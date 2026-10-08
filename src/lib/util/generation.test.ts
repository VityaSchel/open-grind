import { expect, it } from "vitest";

import { Generation } from "$lib/util/generation";

it("keeps a captured generation fresh until the next one starts", () => {
	const generation = new Generation();
	const captured = generation.current;
	expect(generation.isStale(captured)).toBe(false);
	generation.next();
	expect(generation.isStale(captured)).toBe(true);
});

it("makes every earlier generation stale when a new one starts", () => {
	const generation = new Generation();
	const first = generation.next();
	const second = generation.next();
	expect(generation.isStale(first)).toBe(true);
	expect(generation.isStale(second)).toBe(false);
	expect(generation.current).toBe(second);
});
