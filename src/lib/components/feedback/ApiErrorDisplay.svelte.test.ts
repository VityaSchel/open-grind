// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
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
});
