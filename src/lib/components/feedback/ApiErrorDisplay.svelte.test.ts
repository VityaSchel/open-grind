// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "$lib/api/api-error";
import ApiErrorDisplay from "./ApiErrorDisplay.svelte";

const request = { method: "GET", path: "/v4/cascade", body: undefined };

const schemaMismatch = () =>
	new ApiError({
		message: "API response did not match cascadeV4Response",
		request,
		response: { status: 200, body: "{}" },
	});

function retryButton(): HTMLElement | undefined {
	return [...document.querySelectorAll("button")].find(
		(button) => button.textContent?.trim() === "Retry",
	);
}

afterEach(cleanup);

describe("ApiErrorDisplay", () => {
	it("offers Retry for an error that cannot be classified as retryable", () => {
		const error = schemaMismatch();
		expect(error.retryable).toBe(false);

		render(ApiErrorDisplay, { props: { error, onRetry: vi.fn() } });

		expect(retryButton()).toBeDefined();
	});

	it("calls onRetry when it is pressed", () => {
		const onRetry = vi.fn();
		render(ApiErrorDisplay, {
			props: { error: schemaMismatch(), onRetry },
		});

		retryButton()?.click();

		expect(onRetry).toHaveBeenCalledOnce();
	});

	it("offers no Retry when the caller has no way to retry", () => {
		render(ApiErrorDisplay, { props: { error: schemaMismatch() } });

		expect(retryButton()).toBeUndefined();
	});

	it.each([
		["Connect", "Couldn't connect to Grindr"],
		["Http", "Couldn't reach the server"],
		["RequestBlocked", "Grindr is blocking your requests"],
		[
			"NetworkBlocked",
			"Something blocked the request before it reached Grindr",
		],
		["SessionStale", "Couldn't refresh your session"],
	] as const)("blames %s for the failure it actually was", (kind, shown) => {
		render(ApiErrorDisplay, {
			props: {
				error: new ApiError({
					message: `${kind} failure`,
					request,
					kind,
				}),
			},
		});

		expect(screen.getByText(shown)).toBeTruthy();
	});

	it("keeps the server wording for a retryable kind it has no copy for", () => {
		const error = new ApiError({
			message: "Error 500: Internal Server Error",
			request,
			response: { status: 500, body: "{}" },
			kind: "Api",
		});
		expect(error.retryable).toBe(true);

		render(ApiErrorDisplay, { props: { error } });

		expect(screen.getByText("The server ran into a problem")).toBeTruthy();
	});

	it("stays vague when nothing classified the failure", () => {
		render(ApiErrorDisplay, { props: { error: schemaMismatch() } });

		expect(screen.getByText("Something went wrong")).toBeTruthy();
	});
});
