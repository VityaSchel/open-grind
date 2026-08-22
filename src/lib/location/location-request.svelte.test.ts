// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	checkPermissionsMock,
	getCurrentPositionMock,
	isMobilePlatformMock,
	requestPermissionsMock,
} = vi.hoisted(() => ({
	checkPermissionsMock: vi.fn(),
	getCurrentPositionMock: vi.fn(),
	isMobilePlatformMock: vi.fn(),
	requestPermissionsMock: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-geolocation", () => ({
	checkPermissions: checkPermissionsMock,
	getCurrentPosition: getCurrentPositionMock,
	requestPermissions: requestPermissionsMock,
}));
vi.mock("$lib/platform/os", () => ({ isMobilePlatform: isMobilePlatformMock }));

const { locationRequest } = await import("./location-request.svelte");

const BERLIN = {
	timestamp: 0,
	coords: { latitude: 52.52, longitude: 13.405, accuracy: 12 },
};

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}

describe("locationRequest", () => {
	beforeEach(() => {
		isMobilePlatformMock.mockReturnValue(true);
		checkPermissionsMock.mockResolvedValue({ location: "granted" });
		getCurrentPositionMock.mockResolvedValue(BERLIN);
		requestPermissionsMock.mockResolvedValue({ location: "granted" });
	});

	afterEach(() => {
		locationRequest.abort();
		vi.resetAllMocks();
	});

	it("returns coordinates when the permission is already granted", async () => {
		await expect(locationRequest.run()).resolves.toEqual({
			status: "ok",
			coords: { lat: 52.52, lon: 13.405, accuracyMeters: 12 },
		});
		expect(requestPermissionsMock).not.toHaveBeenCalled();
	});

	it("prompts once when the permission has never been asked", async () => {
		checkPermissionsMock.mockResolvedValue({ location: "prompt" });
		await expect(locationRequest.run()).resolves.toMatchObject({
			status: "ok",
		});
		expect(requestPermissionsMock).toHaveBeenCalledExactlyOnceWith([
			"location",
		]);
	});

	it("reports denial when the prompt is rejected", async () => {
		checkPermissionsMock.mockResolvedValue({
			location: "prompt-with-rationale",
		});
		requestPermissionsMock.mockResolvedValue({ location: "denied" });
		await expect(locationRequest.run()).resolves.toEqual({
			status: "denied",
		});
	});

	it("reports denial without prompting when already denied for good", async () => {
		checkPermissionsMock.mockResolvedValue({ location: "denied" });
		await expect(locationRequest.run()).resolves.toEqual({
			status: "denied",
		});
		expect(requestPermissionsMock).not.toHaveBeenCalled();
		expect(getCurrentPositionMock).not.toHaveBeenCalled();
	});

	it("never prompts when asked not to", async () => {
		checkPermissionsMock.mockResolvedValue({ location: "prompt" });
		await expect(locationRequest.run({ prompt: false })).resolves.toEqual({
			status: "denied",
		});
		expect(requestPermissionsMock).not.toHaveBeenCalled();
	});

	it("is unsupported off mobile", async () => {
		isMobilePlatformMock.mockReturnValue(false);
		await expect(locationRequest.run()).resolves.toEqual({
			status: "unsupported",
		});
		expect(checkPermissionsMock).not.toHaveBeenCalled();
	});

	it("surfaces the plugin's string rejection as an error outcome", async () => {
		getCurrentPositionMock.mockRejectedValue("Location unavailable.");
		await expect(locationRequest.run()).resolves.toEqual({
			status: "error",
			error: "Location unavailable.",
		});
	});

	it("abort() discards a fix that is already in flight", async () => {
		const fix = deferred<typeof BERLIN>();
		getCurrentPositionMock.mockReturnValue(fix.promise);
		const outcome = locationRequest.run();
		await vi.waitFor(() => expect(locationRequest.pending).toBe(true));

		locationRequest.abort();
		expect(locationRequest.pending).toBe(false);
		fix.resolve(BERLIN);

		await expect(outcome).resolves.toEqual({ status: "aborted" });
	});

	it("abort() also discards an in-flight permission prompt", async () => {
		const prompt = deferred<{ location: string }>();
		checkPermissionsMock.mockResolvedValue({ location: "prompt" });
		requestPermissionsMock.mockReturnValue(prompt.promise);
		const outcome = locationRequest.run();
		await vi.waitFor(() =>
			expect(requestPermissionsMock).toHaveBeenCalled(),
		);

		locationRequest.abort();
		prompt.resolve({ location: "granted" });

		await expect(outcome).resolves.toEqual({ status: "aborted" });
		expect(getCurrentPositionMock).not.toHaveBeenCalled();
	});

	it("keeps only the newest of two overlapping runs", async () => {
		const first = deferred<typeof BERLIN>();
		getCurrentPositionMock.mockReturnValueOnce(first.promise);
		const stale = locationRequest.run();
		await vi.waitFor(() => expect(locationRequest.pending).toBe(true));

		const fresh = locationRequest.run();
		first.resolve(BERLIN);

		await expect(stale).resolves.toEqual({ status: "aborted" });
		await expect(fresh).resolves.toMatchObject({ status: "ok" });
	});

	it("an aborted run does not clear the pending flag of its successor", async () => {
		const first = deferred<typeof BERLIN>();
		const second = deferred<typeof BERLIN>();
		getCurrentPositionMock.mockReturnValueOnce(first.promise);
		getCurrentPositionMock.mockReturnValueOnce(second.promise);
		const stale = locationRequest.run();
		await vi.waitFor(() => expect(locationRequest.pending).toBe(true));
		const fresh = locationRequest.run();

		first.resolve(BERLIN);
		await stale;
		expect(locationRequest.pending).toBe(true);

		second.resolve(BERLIN);
		await fresh;
		expect(locationRequest.pending).toBe(false);
	});
});

describe("abortStale", () => {
	beforeEach(() => {
		isMobilePlatformMock.mockReturnValue(true);
		checkPermissionsMock.mockResolvedValue({ location: "granted" });
		getCurrentPositionMock.mockResolvedValue(BERLIN);
	});

	afterEach(() => {
		locationRequest.abort();
		vi.resetAllMocks();
	});

	it("cancels the run it was scoped to", async () => {
		const fix = deferred<typeof BERLIN>();
		getCurrentPositionMock.mockReturnValue(fix.promise);
		const outcome = locationRequest.run();
		const generation = locationRequest.generation;
		await vi.waitFor(() => expect(locationRequest.pending).toBe(true));

		locationRequest.abortStale(generation);
		expect(locationRequest.pending).toBe(false);
		fix.resolve(BERLIN);
		await expect(outcome).resolves.toEqual({ status: "aborted" });
	});

	it("spares a newer run", async () => {
		const first = deferred<typeof BERLIN>();
		const second = deferred<typeof BERLIN>();
		getCurrentPositionMock.mockReturnValueOnce(first.promise);
		getCurrentPositionMock.mockReturnValueOnce(second.promise);
		const stale = locationRequest.run();
		const staleGeneration = locationRequest.generation;
		await vi.waitFor(() => expect(locationRequest.pending).toBe(true));
		const fresh = locationRequest.run();

		locationRequest.abortStale(staleGeneration);
		expect(locationRequest.pending).toBe(true);

		first.resolve(BERLIN);
		second.resolve(BERLIN);
		await expect(stale).resolves.toEqual({ status: "aborted" });
		await expect(fresh).resolves.toMatchObject({ status: "ok" });
	});
});
