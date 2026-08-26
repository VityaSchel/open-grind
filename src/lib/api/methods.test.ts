import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	asAppError,
	asBanned,
	banInfoSchema,
	callMethod,
	markRequestBlocked,
	methods,
	restrictionSchema,
} from "$lib/api/methods";
import { requestBlockedAlertState } from "$lib/api/request-blocked-state.svelte";
import { demoCallMethod } from "$lib/demo";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

const cloudflareBlockPage =
	"<!DOCTYPE html><html><head><title>Attention Required! | Cloudflare</title>" +
	"</head><body>Sorry, you have been blocked. Your IP: 203.0.113.7</body></html>";

const backendMessageCap = 500;

function asBackendMessage(body: string): string {
	if (body.length <= backendMessageCap) return body;
	const kept = body.slice(0, backendMessageCap);
	return `${kept}…<+${body.length - backendMessageCap} chars>`;
}

describe("asAppError", () => {
	it("replaces transport detail of a connection failure with plain copy", () => {
		const appError = asAppError({
			kind: "Connect",
			message:
				"error sending request for url (https://grindr.mobi/v4/cascade): client error (Connect)",
		});
		expect(appError?.prettyMessage).toBe(
			"Couldn't connect to Grindr. Check your internet connection and try again.",
		);
		expect(appError?.message).toContain("client error (Connect)");
	});

	it("formats string messages from structured app errors", () => {
		expect(
			asAppError({ kind: "Auth", message: "Sign-in canceled" }),
		).toEqual({
			kind: "Auth",
			message: "Sign-in canceled",
			prettyMessage: "Sign-in canceled",
		});
	});

	it("formats API error code objects from structured app errors", () => {
		expect(
			asAppError({
				kind: "Api",
				message: { code: 429, message: "Rate limited" },
			}),
		).toEqual({
			kind: "Api",
			message: { code: 429, message: "Rate limited" },
			prettyMessage: "Error 429: Rate limited",
		});
	});

	it("recognizes the message-less kinds the backend serializes as a bare tag", () => {
		expect(asAppError({ kind: "NotLoggedIn" })?.kind).toBe("NotLoggedIn");
	});

	it.each([
		["RequestBlocked", "Grindr is blocking your requests"],
		[
			"NetworkBlocked",
			"Something blocked the request before it reached Grindr",
		],
		["RateLimited", "Grindr is rate limiting us"],
		["NotLoggedIn", "You're signed out"],
	])("says what %s means without a message to quote", (kind, expected) => {
		expect(asAppError({ kind })?.prettyMessage).toBe(expected);
	});

	it("falls back to the unknown-error wording for a bare tag it has no copy for", () => {
		expect(asAppError({ kind: "NotInitialized" })?.prettyMessage).toBe(
			"An unknown error occurred",
		);
	});

	it("ignores unknown errors", () => {
		expect(asAppError(new Error("network failed"))).toBeUndefined();
	});

	it("names a block page instead of spilling it into the message", () => {
		const appError = asAppError({
			kind: "Api",
			message: {
				code: 403,
				message: asBackendMessage(cloudflareBlockPage),
			},
		});

		expect(appError?.prettyMessage).toBe(
			"Error 403: The server returned a web page: " +
				'"Attention Required! | Cloudflare"',
		);
		expect(appError?.prettyMessage).not.toContain("203.0.113.7");
	});

	it("names a block page the backend had to cut short", () => {
		const padded = cloudflareBlockPage.replace(
			"</body>",
			`${"blocked ".repeat(200)}</body>`,
		);
		const message = asBackendMessage(padded);

		expect(message).toContain("203.0.113.7");
		expect(
			asAppError({ kind: "Api", message: { code: 403, message } })
				?.prettyMessage,
		).toBe(
			"Error 403: The server returned a web page: " +
				'"Attention Required! | Cloudflare"',
		);
	});

	it("names a web page a gateway put behind its own prose", () => {
		expect(
			asAppError({
				kind: "Http",
				message: `upstream proxy error: ${cloudflareBlockPage}`,
			})?.prettyMessage,
		).toBe(
			'The server returned a web page: "Attention Required! | Cloudflare"',
		);
	});

	it("describes an untitled web page without quoting one", () => {
		expect(
			asAppError({
				kind: "Api",
				message: {
					code: 503,
					message: "<html><body>nope</body></html>",
				},
			})?.prettyMessage,
		).toBe("Error 503: The server returned a web page instead of data");
	});

	it("caps a plain message that arrives unreasonably long", () => {
		expect(
			asAppError({ kind: "Api", message: "x".repeat(5000) })
				?.prettyMessage,
		).toBe(`${"x".repeat(200)}…<+4800 chars>`);
	});

	it("leaves the raw message untouched for sentinel comparisons", () => {
		expect(
			asAppError({ kind: "Auth", message: "companion-unavailable" })
				?.message,
		).toBe("companion-unavailable");
		expect(
			asAppError({
				kind: "Api",
				message: { code: 403, message: cloudflareBlockPage },
			})?.message,
		).toEqual({ code: 403, message: cloudflareBlockPage });
	});
});

describe("simulated account-status responses", () => {
	const bannedError = {
		kind: "Banned",
		message: {
			kind: "profile",
			code: 27,
			message: "Profile is banned",
			reason: null,
			subReason: "DRUG_SALES",
			automated: true,
		},
	};

	it("extracts ban details from a Banned app error", () => {
		const ban = asBanned(bannedError);
		expect(ban?.kind).toBe("profile");
		expect(ban?.code).toBe(27);
		expect(ban?.subReason).toBe("DRUG_SALES");
		expect(ban?.automated).toBe(true);
	});

	it("classifies Banned and RateLimited kinds", () => {
		expect(asAppError(bannedError)?.kind).toBe("Banned");
		expect(asAppError({ kind: "RateLimited" })?.kind).toBe("RateLimited");
	});

	it("does not treat a non-ban error as banned", () => {
		expect(
			asBanned({
				kind: "Unauthorized",
				message: { code: 401, message: "x" },
			}),
		).toBeNull();
	});

	it("parses an age-verification restriction", () => {
		const restriction = restrictionSchema.parse({
			kind: "ageVerification",
			region: "uk",
			reason: "UK_VERIFICATION_REQUIRED",
		});
		expect(restriction.kind).toBe("ageVerification");
		expect(restriction.region).toBe("uk");
	});

	it("parses an auth:banned event payload", () => {
		const info = banInfoSchema.parse({
			kind: "device",
			code: 28,
			message: "ACCOUNT_BANNED",
			reason: null,
			subReason: null,
			automated: null,
		});
		expect(info.kind).toBe("device");
		expect(info.code).toBe(28);
	});
});

describe("markRequestBlocked", () => {
	beforeEach(() => {
		requestBlockedAlertState.open = false;
		requestBlockedAlertState.disable = false;
		requestBlockedAlertState.kind = "cloudflare";
	});

	it("reports that it raised the alert", () => {
		expect(markRequestBlocked({ kind: "network" })).toBe(true);
		expect(requestBlockedAlertState.open).toBe(true);
		expect(requestBlockedAlertState.kind).toBe("network");
	});

	it("reports that it stayed silent once the user opted out", () => {
		requestBlockedAlertState.disable = true;

		expect(markRequestBlocked({ kind: "cloudflare" })).toBe(false);
		expect(requestBlockedAlertState.open).toBe(false);
	});
});

describe("callMethod", () => {
	beforeEach(() => {
		requestBlockedAlertState.open = false;
		requestBlockedAlertState.disable = false;
		requestBlockedAlertState.kind = "cloudflare";
	});

	it("returns the response parsed by the declared schema", async () => {
		invokeMock.mockResolvedValueOnce({
			profileId: "42",
			restriction: null,
		});

		await expect(
			callMethod("login", { email: "a@b.co", password: "hunter2" }),
		).resolves.toEqual({ profileId: 42, restriction: null });
	});

	it("resolves the unit response of a command that returns nothing", async () => {
		invokeMock.mockResolvedValueOnce(null);

		await expect(callMethod("logout")).resolves.toBeNull();
	});

	it("rejects a response that does not match the declared schema", async () => {
		invokeMock.mockResolvedValueOnce({ profileId: "not a number" });

		await expect(
			callMethod("login", { email: "a@b.co", password: "hunter2" }),
		).rejects.toThrow();
	});

	it("passes backend errors through untouched", async () => {
		invokeMock.mockRejectedValueOnce({ kind: "Auth", message: "nope" });

		await expect(callMethod("auth_state")).rejects.toEqual({
			kind: "Auth",
			message: "nope",
		});
	});

	it("raises the blocked alert when Grindr's edge refuses the call", async () => {
		invokeMock.mockRejectedValueOnce({
			kind: "RequestBlocked",
			message: {
				code: 403,
				message: asBackendMessage(cloudflareBlockPage),
			},
		});

		await expect(callMethod("auth_state")).rejects.toBeDefined();

		expect(requestBlockedAlertState.open).toBe(true);
		expect(requestBlockedAlertState.kind).toBe("cloudflare");
	});

	it("raises the same alert when the local network refuses it", async () => {
		invokeMock.mockRejectedValueOnce({ kind: "NetworkBlocked" });

		await expect(callMethod("auth_state")).rejects.toBeDefined();

		expect(requestBlockedAlertState.open).toBe(true);
		expect(requestBlockedAlertState.kind).toBe("network");
	});

	it("leaves the alert down for an error that is not a block", async () => {
		invokeMock.mockRejectedValueOnce({ kind: "Auth", message: "nope" });

		await expect(callMethod("auth_state")).rejects.toBeDefined();

		expect(requestBlockedAlertState.open).toBe(false);
	});
});

describe("demo command responses", () => {
	it.each(Object.keys(methods))(
		"%s matches its declared schema",
		(method) => {
			const { response } = methods[method as keyof typeof methods];
			expect(
				response.safeParse(demoCallMethod(method)).error,
			).toBeUndefined();
		},
	);
});
