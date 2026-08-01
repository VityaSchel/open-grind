import { describe, expect, it } from "vitest";

import {
	asAppError,
	asBanned,
	banInfoSchema,
	restrictionSchema,
} from "$lib/api/methods";

describe("asAppError", () => {
	it("formats string messages from structured app errors", () => {
		expect(asAppError({ kind: "Auth", message: "Sign-in canceled" })).toEqual({
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

	it("ignores unknown errors", () => {
		expect(asAppError(new Error("network failed"))).toBeUndefined();
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
			asBanned({ kind: "Unauthorized", message: { code: 401, message: "x" } }),
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
