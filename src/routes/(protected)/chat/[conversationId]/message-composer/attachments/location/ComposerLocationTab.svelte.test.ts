import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { latLng, Map, Marker } from "leaflet";
import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PIN_ZOOM } from "$lib/components/location-chooser/constants";
import { stubMapResizeObserver } from "$lib/components/location-chooser/map-test-helpers";
import { decodeGeohash, encodeGeohash } from "$lib/model/geohash";

vi.hoisted(() => {
	vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
		setTimeout(() => callback(performance.now()), 16),
	);
	vi.stubGlobal(
		"cancelAnimationFrame",
		(handle: ReturnType<typeof setTimeout>) => clearTimeout(handle),
	);
});

const mocks = vi.hoisted(() => ({
	send: vi.fn(),
	run: vi.fn(),
	abortStale: vi.fn(),
	lastFix: { lat: 52.52, lon: 13.405, accuracyMeters: 10 },
	disabled: false,
	reducedMotion: { current: false },
}));
vi.mock("$lib/api/browse/location", () => ({ getPlaces: vi.fn() }));
vi.mock("$lib/location/location-request.svelte", () => ({
	locationRequest: {
		abortStale: mocks.abortStale,
		generation: 1,
		lastFix: mocks.lastFix,
		run: mocks.run,
	},
}));
vi.mock("../../message-composer-context.svelte", () => ({
	getMessageComposerContext: () => () => ({
		disabled: mocks.disabled,
		sendMessages: mocks.send,
	}),
}));
vi.mock("$lib/platform/os", () => ({ isMobilePlatform: () => true }));
vi.mock("svelte/motion", async (importOriginal) => ({
	...(await importOriginal<typeof import("svelte/motion")>()),
	prefersReducedMotion: mocks.reducedMotion,
}));

import ComposerLocationTab from "./ComposerLocationTab.svelte";

await import("$lib/components/location-chooser/GeoMap.svelte");

const geohash = encodeGeohash({ lat: 48.8566, lon: 2.3522 });

beforeEach(() => {
	vi.clearAllMocks();
	mocks.disabled = false;
	mocks.reducedMotion.current = false;
	mocks.send.mockReturnValue(undefined);
	mocks.run.mockResolvedValue({ status: "ok", coords: mocks.lastFix });
});
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

function open(
	props: { pinPos?: { lat: number; lon: number } } = {
		pinPos: decodeGeohash(geohash),
	},
) {
	const onClose = vi.fn();
	const onSelectionChange = vi.fn();
	const rendered = render(ComposerLocationTab, {
		onClose,
		onSelectionChange,
		...props,
	});
	return { ...rendered, onClose, onSelectionChange };
}

describe("location attachment", () => {
	it("sends the supplied coordinates on each mount", () => {
		const first = open();
		first.component.submitSelection();
		const { lat, lon } = decodeGeohash(geohash);
		expect(mocks.send).toHaveBeenNthCalledWith(1, [
			expect.objectContaining({
				outbound: { type: "Location", body: { lat, lon } },
			}),
		]);
		first.unmount();

		const movedGeohash = encodeGeohash({ lat: 40.4168, lon: -3.7038 });
		open({
			pinPos: decodeGeohash(movedGeohash),
		}).component.submitSelection();
		const moved = decodeGeohash(movedGeohash);
		expect(mocks.send).toHaveBeenNthCalledWith(2, [
			expect.objectContaining({
				outbound: {
					type: "Location",
					body: { lat: moved.lat, lon: moved.lon },
				},
			}),
		]);
	});

	it("sends the chosen coordinates with an optimistic location message", () => {
		const { component, onClose, onSelectionChange } = open();
		const { lat, lon } = decodeGeohash(geohash);
		const message = { type: "Location", body: { lat, lon } };
		expect(onSelectionChange).toHaveBeenLastCalledWith({
			count: 1,
			label: "Send location",
		});
		component.submitSelection();
		expect(onClose).toHaveBeenCalledOnce();
		expect(mocks.send).toHaveBeenCalledWith([
			{ outbound: message, optimistic: message },
		]);
	});

	it("does not send without a selected point or when messaging is disabled", () => {
		const first = open({ pinPos: undefined });
		first.component.submitSelection();
		expect(first.onSelectionChange).toHaveBeenLastCalledWith({
			count: 0,
			label: "Send location",
		});
		first.unmount();
		mocks.disabled = true;
		const second = open();
		second.component.submitSelection();
		expect(mocks.send).not.toHaveBeenCalled();
		expect(second.onClose).not.toHaveBeenCalled();
	});

	it.each([373, -347])(
		"sends wrapped longitude after panning to %s",
		async (longitude) => {
			const setView = vi.spyOn(Map.prototype, "setView");
			const { component } = open();
			await screen.findByRole("button", { name: "Locate me" });
			const map = setView.mock.instances[0];
			if (!(map instanceof Map)) throw new Error("Map was not mounted");
			const initial = decodeGeohash(geohash);
			expect(map.getCenter()).toEqual(latLng(initial.lat, initial.lon));
			expect(map.getZoom()).toBe(PIN_ZOOM);
			flushSync(() =>
				map
					.setView([52, longitude], 12, { animate: false })
					.fire("drag"),
			);
			const markers: Marker[] = [];
			map.eachLayer((layer) => {
				if (layer instanceof Marker) markers.push(layer);
			});
			expect(markers[0]?.getLatLng()).toEqual(latLng(52, longitude));
			component.submitSelection();
			expect(mocks.send).toHaveBeenCalledExactlyOnceWith([
				{
					outbound: { type: "Location", body: { lat: 52, lon: 13 } },
					optimistic: {
						type: "Location",
						body: { lat: 52, lon: 13 },
					},
				},
			]);
		},
	);

	it("wraps longitude when clicking the map and keeps the pin fixed against dragging", async () => {
		const setView = vi.spyOn(Map.prototype, "setView");
		const { component } = open();
		await screen.findByRole("button", { name: "Locate me" });
		const map = setView.mock.instances[0];
		if (!(map instanceof Map)) throw new Error("Map was not mounted");
		flushSync(() => map.fire("click", { latlng: latLng(52, 373) }));
		component.submitSelection();
		expect(mocks.send).toHaveBeenLastCalledWith([
			expect.objectContaining({
				outbound: { type: "Location", body: { lat: 52, lon: 13 } },
			}),
		]);
		map.eachLayer((layer) => {
			if (layer instanceof Marker)
				expect(layer.dragging?.enabled()).toBe(false);
		});
	});

	it("sends the pin selected through the map's locate button", async () => {
		const { component } = open();
		await fireEvent.click(
			await screen.findByRole("button", { name: "Locate me" }),
		);
		component.submitSelection();
		const message = {
			type: "Location",
			body: {
				lat: expect.closeTo(mocks.lastFix.lat),
				lon: expect.closeTo(mocks.lastFix.lon),
			},
		};
		expect(mocks.send).toHaveBeenCalledExactlyOnceWith([
			{ outbound: message, optimistic: message },
		]);
	});
	it("does not report a selection change for every pan frame", async () => {
		const setView = vi.spyOn(Map.prototype, "setView");
		const { onSelectionChange } = open();
		await screen.findByRole("button", { name: "Locate me" });
		const map = setView.mock.instances[0] as Map;
		onSelectionChange.mockClear();
		for (const lon of [13, 14, 15]) {
			flushSync(() =>
				map.setView([52, lon], 12, { animate: false }).fire("drag"),
			);
		}
		expect(onSelectionChange).not.toHaveBeenCalled();
	});

	it("does not turn a resize into a sendable location when none was selected", async () => {
		const resize = stubMapResizeObserver();
		const invalidateSize = vi
			.spyOn(Map.prototype, "invalidateSize")
			.mockImplementation(function (this: Map) {
				return this.fire("move");
			});
		const { component, onSelectionChange } = open({ pinPos: undefined });
		await screen.findByRole("button", { name: "Locate me" });
		flushSync(() => resize());
		expect(invalidateSize).toHaveBeenCalledWith();
		component.submitSelection();
		expect(onSelectionChange).toHaveBeenLastCalledWith({
			count: 0,
			label: "Send location",
		});
		expect(mocks.send).not.toHaveBeenCalled();
	});

	it.each([
		["click", false],
		["locate", false],
		["click", true],
		["locate", true],
	] as const)(
		"keeps the %s selection during resize (reduced motion: %s)",
		async (action, reducedMotion) => {
			mocks.reducedMotion.current = reducedMotion;
			const resize = stubMapResizeObserver();
			const setView = vi.spyOn(Map.prototype, "setView");
			const { component } = open();
			const locate = await screen.findByRole("button", {
				name: "Locate me",
			});
			const map = setView.mock.instances[0] as Map;
			let height = 400;
			Object.defineProperties(map.getContainer(), {
				clientWidth: { get: () => 400 },
				clientHeight: { get: () => height },
			});
			flushSync(() => {
				resize();
				map.setView([52.519, 13.404], 16, { animate: false });
			});
			vi.useFakeTimers({
				toFake: ["setTimeout", "clearTimeout", "Date", "performance"],
			});
			const before = map.getCenter();
			if (action === "click") {
				flushSync(() =>
					map.fire("click", {
						latlng: latLng(mocks.lastFix.lat, mocks.lastFix.lon),
					}),
				);
			} else {
				await fireEvent.click(locate);
			}
			expect(setView).toHaveBeenLastCalledWith(
				[mocks.lastFix.lat, mocks.lastFix.lon],
				16,
				expect.objectContaining({ animate: !reducedMotion }),
			);
			await vi.advanceTimersByTimeAsync(100);
			if (!reducedMotion) expect(map.getCenter()).not.toEqual(before);
			height = 200;
			flushSync(() => resize());
			await vi.advanceTimersByTimeAsync(300);
			component.submitSelection();
			expect(mocks.send).toHaveBeenCalledExactlyOnceWith([
				expect.objectContaining({
					outbound: {
						type: "Location",
						body: {
							lat: expect.closeTo(mocks.lastFix.lat, 4),
							lon: expect.closeTo(mocks.lastFix.lon, 4),
						},
					},
				}),
			]);

			flushSync(() => map.panBy([20, 0], { animate: false }));
			const center = map.getCenter().wrap();
			component.submitSelection();
			expect(mocks.send).toHaveBeenLastCalledWith([
				expect.objectContaining({
					outbound: {
						type: "Location",
						body: { lat: center.lat, lon: center.lng },
					},
				}),
			]);
		},
	);
});
