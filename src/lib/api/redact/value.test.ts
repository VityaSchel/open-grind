import { describe, expect, it } from "vitest";

import {
	readResponseBody,
	redactResponseBody,
	redactValue,
	summariseNonJson,
} from "$lib/api/redact/value";

describe("redactValue", () => {
	it("strips the outgoing chat message but keeps both type tags", () => {
		expect(
			redactValue({
				type: "Text",
				target: { type: "Direct", targetId: 123456789 },
				body: { text: "hi, i'm at 221b baker st" },
			}),
		).toEqual({
			type: "Text",
			target: { type: "Direct", targetId: "<number>" },
			body: { text: "<string:24>" },
		});
	});

	it("keeps a message type it has never seen", () => {
		expect(
			redactValue({ type: "SomeFutureThing", body: { text: "hi" } }),
		).toEqual({ type: "SomeFutureThing", body: { text: "<string:2>" } });
	});

	it("keeps the shape of a cascade the grid could not parse", () => {
		expect(
			redactValue({
				items: [
					{
						type: "full_profile_v1",
						data: { profileId: 12, displayName: "Alex" },
					},
					{ type: "sponsored_profile_v1", data: { profileId: 13 } },
				],
			}),
		).toEqual({
			items: [
				{
					type: "full_profile_v1",
					data: { profileId: "<number>", displayName: "<string:4>" },
				},
				{
					type: "sponsored_profile_v1",
					data: { profileId: "<number>" },
				},
			],
		});
	});

	it("keeps an error envelope readable", () => {
		expect(
			redactValue({
				code: 27,
				message: "Profile is banned",
				banSubReason: "DRUG_SALES",
				isBanAutomated: true,
			}),
		).toEqual({
			code: 27,
			message: "Profile is banned",
			banSubReason: "DRUG_SALES",
			isBanAutomated: true,
		});
	});

	it("scrubs identifiers out of kept prose", () => {
		expect(redactValue({ message: "No account for a@b.com" })).toEqual({
			message: "No account for <email>",
		});
	});

	it("strips health status and identity fields from a profile save", () => {
		expect(
			redactValue({
				displayName: "Alex",
				aboutMe: "hmu",
				age: 29,
				hivStatus: 4,
				lastTestedDate: 1699999999999,
				grindrTribes: [9, 11],
				socialNetworks: { instagram: { userId: "alexxx" } },
				showDistance: true,
			}),
		).toEqual({
			displayName: "<string:4>",
			aboutMe: "<string:3>",
			age: "<number>",
			hivStatus: "<number>",
			lastTestedDate: "<number>",
			grindrTribes: ["<number>", "<number>"],
			socialNetworks: { instagram: { userId: "<string:6>" } },
			showDistance: "<boolean>",
		});
	});

	it("strips coordinates from a location message", () => {
		expect(redactValue({ lat: 51.5237, lon: -0.1585 })).toEqual({
			lat: "<number>",
			lon: "<number>",
		});
	});

	it("truncates long arrays of third-party profile ids", () => {
		expect(
			redactValue({
				targetProfileIds: Array.from({ length: 12 }, (_, i) => i),
			}),
		).toEqual({
			targetProfileIds: [
				...Array.from({ length: 10 }, () => "<number>"),
				"<+2 more>",
			],
		});
	});

	it("preserves null and undefined", () => {
		expect(redactValue(null)).toBeNull();
		expect(redactValue(undefined)).toBeUndefined();
		expect(redactValue({ reason: null })).toEqual({ reason: null });
	});

	it("handles circular and deeply nested bodies without throwing", () => {
		const circular: Record<string, unknown> = { name: "x" };
		circular.self = circular;
		expect(redactValue(circular)).toEqual({
			name: "<string:1>",
			self: "<circular>",
		});

		let deep: unknown = "leaf";
		for (let i = 0; i < 8; i++) deep = { next: deep };
		expect(JSON.stringify(redactValue(deep))).toContain("<nested>");
	});

	it("does not treat a repeated reference as circular", () => {
		const shared = { text: "hi" };
		expect(redactValue({ a: shared, b: shared })).toEqual({
			a: { text: "<string:2>" },
			b: { text: "<string:2>" },
		});
	});

	it("labels non-plain objects instead of walking them", () => {
		expect(redactValue({ blob: new Uint8Array([1, 2, 3]) })).toEqual({
			blob: "<Uint8Array>",
		});
	});

	it("caps a kept field that arrives unreasonably long", () => {
		const redacted = redactValue({ type: "x".repeat(400) }) as {
			type: string;
		};
		expect(redacted.type).toBe(`${"x".repeat(300)}…<+100 chars>`);
	});
});

describe("redactResponseBody", () => {
	it("structures a JSON body instead of nesting it as a string", () => {
		expect(
			redactResponseBody(
				'{"items":[{"profileId":123,"distanceMeters":41}]}',
			),
		).toEqual({
			items: [{ profileId: "<number>", distanceMeters: "<number>" }],
		});
	});

	it("summarises a block page rather than echoing the address in it", () => {
		const blockPage =
			"<!DOCTYPE html><html><head><title>Attention Required! | Cloudflare</title></head>" +
			"<body>Sorry, you have been blocked. Your IP: 203.0.113.7 Ray ID: 8f2c</body></html>";

		const summary = redactResponseBody(blockPage);

		expect(JSON.stringify(summary)).not.toContain("203.0.113.7");
		expect(summary).toEqual({
			nonJson: "html",
			length: blockPage.length,
			title: "Attention Required! | Cloudflare",
		});
	});

	it("summarises plain text the same way", () => {
		expect(redactResponseBody("upstream connect error")).toEqual({
			nonJson: "text",
			length: 22,
		});
	});

	it("keeps a hostile key inert", () => {
		const redacted = redactResponseBody(
			'{"__proto__":{"polluted":true},"type":"Text"}',
		);

		expect({}).not.toHaveProperty("polluted");
		expect(redacted).toEqual({ type: "Text" });
	});
});

describe("summariseNonJson", () => {
	it("bounds a title so a caller can put it in a sentence", () => {
		const title = "Blocked ".repeat(30);

		expect(
			summariseNonJson(
				`<html><head><title>${title}</title></head></html>`,
			),
		).toMatchObject({
			nonJson: "html",
			title: `${title.slice(0, 100)}…<+139 chars>`,
		});
	});

	it("reports no title when the page carries none", () => {
		expect(summariseNonJson("<html><body>blocked</body></html>")).toEqual({
			nonJson: "html",
			length: 33,
		});
	});

	it.each([
		"upstream proxy error: <!DOCTYPE html><html>…</html>",
		"error reading the response\n<html><body>blocked</body></html>",
	])("calls markup behind a prefix a page anyway: %s", (body) => {
		expect(summariseNonJson(body).nonJson).toBe("html");
	});

	it("still calls prose that only mentions a tag plain text", () => {
		expect(summariseNonJson("expected <title> in the body").nonJson).toBe(
			"text",
		);
	});

	it("never titles a plain-text body", () => {
		const body = "prose quoting <title>Blocked</title> is not a page";

		expect(summariseNonJson(body)).toEqual({
			nonJson: "text",
			length: body.length,
		});
	});
});

describe("readResponseBody", () => {
	it("parses JSON so an unredacted report is one document", () => {
		expect(readResponseBody('{"code":4}')).toEqual({ code: 4 });
	});

	it("falls back to the raw text", () => {
		expect(readResponseBody("<html></html>")).toBe("<html></html>");
	});
});
