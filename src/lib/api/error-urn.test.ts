import { describe, expect, it } from "vitest";

import { ApiError } from "$lib/api/api-error";
import {
	errorUrn,
	errorUrnFromBody,
	tieredFeature,
	tieredFeatureFromBody,
} from "$lib/api/error-urn";

const request = { method: "POST", path: "/v4/chat/message/send" };

describe("errorUrnFromBody", () => {
	it("reads the error type out of a Grindr error body", () => {
		expect(
			errorUrnFromBody(
				JSON.stringify({
					type: "urn:gr:err:unauthorized_action",
					title: "Action not permitted",
					status: 403,
				}),
			),
		).toBe("urn:gr:err:unauthorized_action");
	});

	it("ignores a type that is not an error urn", () => {
		expect(errorUrnFromBody(JSON.stringify({ type: "Text" }))).toBeNull();
	});

	it("ignores bodies that are not Grindr errors", () => {
		expect(errorUrnFromBody("<html>Attention Required!</html>")).toBeNull();
		expect(errorUrnFromBody(JSON.stringify({ status: 403 }))).toBeNull();
		expect(errorUrnFromBody("")).toBeNull();
	});
});

describe("errorUrn", () => {
	it("reads the urn from an API error response", () => {
		const error = new ApiError({
			message: "API request failed with status 403",
			request,
			response: {
				status: 403,
				body: JSON.stringify({ type: "urn:gr:err:hit_banned_terms" }),
			},
		});

		expect(errorUrn(error)).toBe("urn:gr:err:hit_banned_terms");
	});

	it("has no urn for errors without a response", () => {
		expect(errorUrn(new Error("offline"))).toBeNull();
		expect(
			errorUrn(new ApiError({ message: "no response", request })),
		).toBeNull();
	});
});

describe("tieredFeatureFromBody", () => {
	it("reads the gated feature out of a paywall body", () => {
		expect(
			tieredFeatureFromBody(
				JSON.stringify({
					type: "urn:gr:err:tiered_feature",
					title: "Feature not available with current subscription",
					status: 402,
					featureValue: "UnsentMessage",
				}),
			),
		).toBe("UnsentMessage");
	});

	it("ignores errors that are not feature gates", () => {
		expect(
			tieredFeatureFromBody(
				JSON.stringify({ type: "urn:gr:err:unauthorized_action" }),
			),
		).toBeNull();
		expect(
			tieredFeatureFromBody(
				JSON.stringify({ type: "urn:gr:err:tiered_feature" }),
			),
		).toBeNull();
		expect(
			tieredFeatureFromBody("<html>Attention Required!</html>"),
		).toBeNull();
	});
});

describe("tieredFeature", () => {
	it("reads the gated feature from an API error response", () => {
		const error = new ApiError({
			message: "API request failed with status 402",
			request,
			response: {
				status: 402,
				body: JSON.stringify({
					type: "urn:gr:err:tiered_feature",
					featureValue: "UnsentMessage",
				}),
			},
		});

		expect(tieredFeature(error)).toBe("UnsentMessage");
	});

	it("has no gated feature for errors without a response", () => {
		expect(tieredFeature(new Error("offline"))).toBeNull();
		expect(
			tieredFeature(new ApiError({ message: "no response", request })),
		).toBeNull();
	});
});
