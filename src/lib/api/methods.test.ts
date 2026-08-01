import { describe, expect, it, vi } from "vitest";

import {
	asAppError,
	asBanned,
	banInfoSchema,
	callMethod,
	methods,
	restrictionSchema,
} from "$lib/api/methods";
import { demoCallMethod } from "$lib/demo";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

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

	it("recognizes the message-less kinds the backend serializes as a bare tag", () => {
		expect(asAppError({ kind: "NotLoggedIn" })?.kind).toBe("NotLoggedIn");
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

describe("callMethod", () => {
	it("returns the response parsed by the declared schema", async () => {
		invokeMock.mockResolvedValueOnce({ profileId: "42", restriction: null });

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
});

describe("demo command responses", () => {
	it.each(Object.keys(methods))("%s matches its declared schema", (method) => {
		const { response } = methods[method as keyof typeof methods];
		expect(response.safeParse(demoCallMethod(method)).error).toBeUndefined();
	});
});
