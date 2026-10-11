import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "$lib/api/api-error";
import {
	asAppError,
	asBanned,
	banInfoSchema,
	callMethod,
	diagnosticMessage,
	markRequestBlocked,
	methods,
	restrictionSchema,
	uploadRefusalMessage,
} from "$lib/api/methods";
import { requestBlockedAlertState } from "$lib/api/request-blocked-state.svelte";
import { demoCallMethod } from "$lib/demo";
import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";

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
			"Couldn’t connect to Grindr. Check your internet connection and try again.",
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
		expect(asAppError({ kind: "NotSignedIn" })?.kind).toBe("NotSignedIn");
	});

	it.each([
		["RequestBlocked", "Grindr is blocking your requests"],
		["NetworkBlocked", "Something is blocking your requests to Grindr"],
		["RateLimited", "Too many requests. Wait a moment and try again."],
		["NotSignedIn", "You’re signed out"],
		["SessionStale", "Couldn’t refresh your session"],
	])("says what %s means without a message to quote", (kind, expected) => {
		expect(asAppError({ kind })?.prettyMessage).toBe(expected);
	});

	it("falls back to the unknown-error wording for a bare tag it has no copy for", () => {
		expect(asAppError({ kind: "NotInitialized" })?.prettyMessage).toBe(
			"Something went wrong",
		);
	});

	it.each([
		{ reason: "unsupportedPlatform" },
		{ reason: "mintFailed", detail: "NETWORK_ERROR" },
		{ reason: "mintFailed", detail: null },
	])("classifies a reCAPTCHA failure with its reason %o", (message) => {
		const appError = asAppError({ kind: "Recaptcha", message });

		expect(appError?.kind).toBe("Recaptcha");
		expect(appError?.message).toEqual(message);
		expect(appError?.prettyMessage).toBe("Something went wrong");
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
				"“Attention Required! | Cloudflare”",
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
				"“Attention Required! | Cloudflare”",
		);
	});

	it("names a web page a gateway put behind its own prose", () => {
		expect(
			asAppError({
				kind: "Http",
				message: `upstream proxy error: ${cloudflareBlockPage}`,
			})?.prettyMessage,
		).toBe(
			"The server returned a web page: “Attention Required! | Cloudflare”",
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

describe("diagnosticMessage", () => {
	afterEach(() => setLocale({ locale: SOURCE_LOCALE }));

	it("keeps a bare tag's wording English while the interface is not", async () => {
		await setLocale({ locale: "en-XA" });

		expect(asAppError({ kind: "RateLimited" })?.prettyMessage).not.toBe(
			"Too many requests. Wait a moment and try again.",
		);
		expect(diagnosticMessage({ kind: "RateLimited" })).toBe(
			"Too many requests. Wait a moment and try again.",
		);
	});

	it("frames server text in English while the interface is not", async () => {
		await setLocale({ locale: "en-XA" });

		expect(
			diagnosticMessage({
				kind: "Api",
				message: { code: 403, message: cloudflareBlockPage },
			}),
		).toBe(
			"Error 403: The server returned a web page: " +
				"“Attention Required! | Cloudflare”",
		);
	});

	it("passes through what is not an app error", () => {
		expect(diagnosticMessage(new Error("socket hang up"))).toBe(
			"socket hang up",
		);
		expect(diagnosticMessage("offline")).toBe("offline");
	});
});

describe("uploadRefusalMessage", () => {
	const limitLabel = "120.00 MB";
	const photoTooLarge = { reason: "photoTooLarge", maxBytes: 64 * 2 ** 20 };
	const missingFile = {
		reason: "io",
		detail: "No such file or directory (os error 2)",
	};

	function mediaError(message: Record<string, unknown>) {
		return { kind: "Media", message };
	}

	function uploadError(cause: unknown): ApiError {
		return new ApiError({
			message: diagnosticMessage(cause),
			request: { method: "POST", path: "/v5/chat/media/upload" },
			kind: "Media",
			cause,
		});
	}

	afterEach(() => setLocale({ locale: SOURCE_LOCALE }));

	it.each([
		[{ reason: "notMedia" }, "That file isn’t a photo or video"],
		[{ reason: "videoUnreadable" }, "That video’s format can’t be read"],
		[photoTooLarge, "Photos over 64 MB can’t be uploaded"],
		[{ reason: "notAPhoto" }, "Only photos can be sent here"],
		[{ reason: "photoSizeUnreadable" }, "That photo’s size can’t be read"],
		[{ reason: "photoDamaged" }, "Unreadable or damaged photo"],
		[
			{ reason: "heicUnsupported" },
			"HEIC photos aren’t supported on this platform yet",
		],
		[
			{
				reason: "photoUndecodable",
				detail: "BitmapFactory returned null",
			},
			"Undecodable photo",
		],
		[
			{ reason: "outsideReadableFolders" },
			"That file is outside the folders this app may read",
		],
	])("says why the backend refused %o", (refusal, expected) => {
		expect(
			uploadRefusalMessage({ error: mediaError(refusal), limitLabel }),
		).toBe(expected);
		expect(
			uploadRefusalMessage({
				error: uploadError(mediaError(refusal)),
				limitLabel,
			}),
		).toBe(expected);
	});

	it.each([
		missingFile,
		{ reason: "pickerFailed", detail: "Activity not found" },
		{ reason: "photoTooLarge" },
		{ reason: "unknownReason" },
	])("leaves %o to the caller's fallback", (failure) => {
		expect(
			uploadRefusalMessage({ error: mediaError(failure), limitLabel }),
		).toBeNull();
		expect(
			uploadRefusalMessage({
				error: uploadError(mediaError(failure)),
				limitLabel,
			}),
		).toBeNull();
	});

	it("leaves an error that is not a media refusal to the caller's fallback", () => {
		expect(
			uploadRefusalMessage({
				error: { kind: "Http", message: "photoDamaged" },
				limitLabel,
			}),
		).toBeNull();
		expect(
			uploadRefusalMessage({ error: new Error("offline"), limitLabel }),
		).toBeNull();
	});

	it("names the limit the caller formatted when the body is too large", () => {
		expect(
			uploadRefusalMessage({
				error: { kind: "ContentTooLarge" },
				limitLabel,
			}),
		).toBe("Larger than the 120.00 MB limit");
	});

	it("shows a refusal in the app language but keeps its diagnostic English", async () => {
		await setLocale({ locale: "en-XA" });

		expect(
			uploadRefusalMessage({
				error: mediaError(photoTooLarge),
				limitLabel,
			}),
		).toMatch(PSEUDO_MESSAGE);
		expect(diagnosticMessage(mediaError(photoTooLarge))).toBe(
			"Photos over 64 MB can’t be uploaded",
		);
	});

	it("keeps the detail of a failure without a reason worth showing for diagnostics", () => {
		expect(diagnosticMessage(mediaError(missingFile))).toBe(
			missingFile.detail,
		);
		expect(asAppError(mediaError(missingFile))?.message).toEqual(
			missingFile,
		);
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
			callMethod("sign_in_with_email", {
				email: "a@b.co",
				password: "hunter2",
			}),
		).resolves.toEqual({ profileId: 42, restriction: null });
	});

	it("asks the backend for a reCAPTCHA token for the named action", async () => {
		invokeMock.mockResolvedValueOnce("0cAFcWeA-token");

		await expect(
			callMethod("mint_recaptcha_token", { action: "report" }),
		).resolves.toBe("0cAFcWeA-token");
		expect(invokeMock).toHaveBeenCalledWith("mint_recaptcha_token", {
			action: "report",
		});
	});

	it("offers exactly the reCAPTCHA actions the backend deserializes", () => {
		const backendActions: unknown = JSON.parse(
			readFileSync("src-tauri/src/api/recaptcha/actions.json", "utf8"),
		);

		expect(
			methods.mint_recaptcha_token.request.shape.action.options,
		).toEqual(backendActions);
	});

	it("rejects an empty reCAPTCHA token", async () => {
		invokeMock.mockResolvedValueOnce("");

		await expect(
			callMethod("mint_recaptcha_token", { action: "report" }),
		).rejects.toThrow();
	});

	it("resolves the unit response of a command that returns nothing", async () => {
		invokeMock.mockResolvedValueOnce(null);

		await expect(callMethod("sign_out")).resolves.toBeNull();
	});

	it("rejects a response that does not match the declared schema", async () => {
		invokeMock.mockResolvedValueOnce({ profileId: "not a number" });

		await expect(
			callMethod("sign_in_with_email", {
				email: "a@b.co",
				password: "hunter2",
			}),
		).rejects.toThrow();
	});

	it("passes backend errors through untouched", async () => {
		invokeMock.mockRejectedValueOnce({ kind: "Auth", message: "nope" });

		await expect(callMethod("current_session")).rejects.toEqual({
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

		await expect(callMethod("current_session")).rejects.toBeDefined();

		expect(requestBlockedAlertState.open).toBe(true);
		expect(requestBlockedAlertState.kind).toBe("cloudflare");
	});

	it("raises the same alert when the local network refuses it", async () => {
		invokeMock.mockRejectedValueOnce({ kind: "NetworkBlocked" });

		await expect(callMethod("current_session")).rejects.toBeDefined();

		expect(requestBlockedAlertState.open).toBe(true);
		expect(requestBlockedAlertState.kind).toBe("network");
	});

	it("leaves the alert down for an error that is not a block", async () => {
		invokeMock.mockRejectedValueOnce({ kind: "Auth", message: "nope" });

		await expect(callMethod("current_session")).rejects.toBeDefined();

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
