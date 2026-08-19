import { beforeEach, describe, expect, it, vi } from "vitest";

import { decodeGeohash, encodeGeohash } from "$lib/model/geohash";

const { fetchRestMock } = vi.hoisted(() => ({ fetchRestMock: vi.fn() }));

vi.mock("$lib/api/transport", () => ({ fetchRest: fetchRestMock }));

const { getCascadeV4 } = await import("./grid");

function requestedParams() {
	const url = fetchRestMock.mock.calls[0]?.[0] as string;
	return new URLSearchParams(url.slice(url.indexOf("?") + 1));
}

describe("getCascadeV4", () => {
	beforeEach(() => {
		fetchRestMock.mockReset();
		fetchRestMock.mockResolvedValue({
			jsonParsed: () => ({ items: [], nextPage: 0 }),
		});
	});

	it("blunts the geohash to the ~110m grid before it reaches the wire", async () => {
		const exact = encodeGeohash({ lat: 52.5200123, lon: 13.4050456 });
		await getCascadeV4({ nearbyGeoHash: exact, pageNumber: 1 });

		const sent = requestedParams().get("nearbyGeoHash")!;
		expect(sent).not.toBe(exact);
		expect(sent).toHaveLength(12);

		const decoded = decodeGeohash(sent);
		expect(decoded.lat).toBeCloseTo(52.52, 6);
		expect(decoded.lon).toBeCloseTo(13.405, 6);
	});

	it("blunts exploreGeoHash too, and omits it when unset", async () => {
		await getCascadeV4({
			nearbyGeoHash: encodeGeohash({ lat: 52.52, lon: 13.405 }),
			exploreGeoHash: encodeGeohash({ lat: 48.8566123, lon: 2.3522456 }),
			pageNumber: 1,
		});
		const explore = requestedParams().get("exploreGeoHash")!;
		const decoded = decodeGeohash(explore);
		expect(decoded.lat).toBeCloseTo(48.857, 6);
		expect(decoded.lon).toBeCloseTo(2.352, 6);

		fetchRestMock.mockClear();
		await getCascadeV4({
			nearbyGeoHash: encodeGeohash({ lat: 52.52, lon: 13.405 }),
			pageNumber: 1,
		});
		expect(requestedParams().has("exploreGeoHash")).toBe(false);
	});

	it("leaves the other query fields untouched", async () => {
		await getCascadeV4({
			nearbyGeoHash: encodeGeohash({ lat: 52.52, lon: 13.405 }),
			pageNumber: 3,
			onlineOnly: true,
			ageMin: 25,
		});
		const params = requestedParams();
		expect(params.get("pageNumber")).toBe("3");
		expect(params.get("onlineOnly")).toBe("true");
		expect(params.get("ageMin")).toBe("25");
	});

	it("sends the same coarse value for two fixes a few metres apart", async () => {
		await getCascadeV4({
			nearbyGeoHash: encodeGeohash({ lat: 52.52001, lon: 13.40501 }),
			pageNumber: 1,
		});
		const first = requestedParams().get("nearbyGeoHash");

		fetchRestMock.mockClear();
		await getCascadeV4({
			nearbyGeoHash: encodeGeohash({ lat: 52.52039, lon: 13.40539 }),
			pageNumber: 1,
		});
		expect(requestedParams().get("nearbyGeoHash")).toBe(first);
	});
});
