import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ getUpdateCapability: vi.fn() }));

vi.mock("./index", () => api);

describe("the update capability probe", () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
	});

	it("never rejects, so a failed probe cannot take the app down", async () => {
		api.getUpdateCapability.mockRejectedValue(new Error("schema drift"));
		const { hydrateUpdateCapability, updatesSelfManaged } =
			await import("./capability.svelte");

		await expect(hydrateUpdateCapability()).resolves.toBeUndefined();
		expect(updatesSelfManaged()).toBe(false);
	});

	it("reports a supported install as self-managed", async () => {
		api.getUpdateCapability.mockResolvedValue({
			state: "supported",
			detail: { payloadSuffix: "-android.apk", canInstallNow: true },
		});
		const { hydrateUpdateCapability, updatesSelfManaged } =
			await import("./capability.svelte");

		await hydrateUpdateCapability();

		expect(updatesSelfManaged()).toBe(true);
	});

	it("probes once even when called concurrently", async () => {
		api.getUpdateCapability.mockResolvedValue({
			state: "unsupported",
			detail: { reason: "foreignSigner" },
		});
		const { hydrateUpdateCapability } = await import("./capability.svelte");

		await Promise.all([
			hydrateUpdateCapability(),
			hydrateUpdateCapability(),
		]);

		expect(api.getUpdateCapability).toHaveBeenCalledTimes(1);
	});
});
