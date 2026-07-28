import { describe, expect, it } from "vitest";

import { csr, ssr } from "./+layout";

describe("SPA mode", () => {
	it("keeps SSR off", () => {
		expect(ssr, "SSR must stay off").toBe(false);
	});

	it("keeps CSR on", () => {
		expect(
			csr,
			"the app is client-rendered, disabling CSR ships a blank page",
		).toBe(true);
	});
});
