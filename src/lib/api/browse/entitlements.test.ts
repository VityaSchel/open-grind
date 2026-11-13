import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchRestMock } = vi.hoisted(() => ({ fetchRestMock: vi.fn() }));

vi.mock("#lib/api/transport.ts", () => ({ fetchRest: fetchRestMock }));

import { getRightNowPostEntitlements } from "#lib/api/browse/entitlements.ts";
import { requestsOf, restResponse } from "#lib/test/rest-response.ts";

beforeEach(() => {
	fetchRestMock.mockReset();
});

describe("getRightNowPostEntitlements", () => {
	it("reads the post allowance", async () => {
		fetchRestMock.mockResolvedValueOnce(
			restResponse({ body: { type: "GRANTED", count: 2 } }),
		);

		await expect(getRightNowPostEntitlements()).resolves.toEqual({
			type: "GRANTED",
			count: 2,
		});
		expect(requestsOf(fetchRestMock)).toEqual([
			{
				path: "/v1/rightnow/entitlements/posts",
				method: "GET",
				body: undefined,
			},
		]);
	});
});
