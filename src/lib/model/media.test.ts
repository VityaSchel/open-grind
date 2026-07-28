import { describe, expect, it } from "vitest";

import { mediaUrlSchema } from "$lib/model/media";

describe("mediaUrlSchema", () => {
	it.each([
		"javascript:alert(1)",
		"JavaScript:alert(1)",
		" javascript:alert(1)",
		"data:text/html,<script>alert(1)</script>",
		"file:///etc/passwd",
		"http://cdns.grindr.com/images/thumb/abc",
	])("rejects %s", (url) => {
		expect(mediaUrlSchema.safeParse(url).success).toBe(false);
	});

	it.each([
		"https://cdns.grindr.com/images/thumb/abc",
		"https://media4.giphy.com/media/x.gif",
		"blob:http://localhost:5173/9f0b2c1e-1111-2222-3333-444455556666",
	])("accepts %s", (url) => {
		expect(mediaUrlSchema.safeParse(url).success).toBe(true);
	});
});
