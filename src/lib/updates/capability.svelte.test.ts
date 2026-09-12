import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
	getUpdateCapability: vi.fn(),
	updatesAvailableHere: vi.fn(),
}));

vi.mock("./index", () => api);

describe("the update capability probe", () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		api.updatesAvailableHere.mockReturnValue(true);
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

	it("explains an unsupported install instead of staying silent", async () => {
		api.getUpdateCapability.mockResolvedValue({
			state: "unsupported",
			detail: {
				reason: "locationNotWritable",
				detail: { path: "/opt/open-grind.AppImage" },
			},
		});
		const { hydrateUpdateCapability, updatesUnsupportedReason } =
			await import("./capability.svelte");

		await hydrateUpdateCapability();

		const { unsupportedText } = await import("./error-copy");
		expect(updatesUnsupportedReason()).toBe(
			unsupportedText({
				reason: "locationNotWritable",
				detail: { path: "/opt/open-grind.AppImage" },
			}),
		);
	});

	it("explains a probe that could not tell whether updates apply", async () => {
		api.getUpdateCapability.mockRejectedValue(new Error("schema drift"));
		const { hydrateUpdateCapability, updatesUnsupportedReason } =
			await import("./capability.svelte");

		await hydrateUpdateCapability();

		const { unsupportedText } = await import("./error-copy");
		expect(updatesUnsupportedReason()).toBe(
			unsupportedText({ reason: "undetermined" }),
		);
	});

	it("says nothing where updates could never apply, such as the web demo", async () => {
		api.updatesAvailableHere.mockReturnValue(false);
		api.getUpdateCapability.mockResolvedValue({
			state: "unsupported",
			detail: { reason: "noReleaseArtifacts", detail: { target: "web" } },
		});
		const { hydrateUpdateCapability, updatesUnsupportedReason } =
			await import("./capability.svelte");

		await hydrateUpdateCapability();

		expect(updatesUnsupportedReason()).toBeNull();
	});

	it("has nothing to explain when updates work", async () => {
		api.getUpdateCapability.mockResolvedValue({
			state: "supported",
			detail: {
				payloadSuffix: "-linux-x86_64.AppImage",
				canInstallNow: true,
			},
		});
		const { hydrateUpdateCapability, updatesUnsupportedReason } =
			await import("./capability.svelte");

		await hydrateUpdateCapability();

		expect(updatesUnsupportedReason()).toBeNull();
	});

	it.each([
		["externallyManaged", { installer: "org.fdroid.fdroid" }],
		["sandboxed", { runtime: "Flatpak" }],
		["noReleaseArtifacts", { target: "linux-x86_64" }],
		["foreignSigner", undefined],
	])(
		"offers no setting and no complaint when %s decides updates",
		async (reason, detail) => {
			api.getUpdateCapability.mockResolvedValue({
				state: "unsupported",
				detail: detail === undefined ? { reason } : { reason, detail },
			});
			const { hydrateUpdateCapability, updatesUnsupportedReason } =
				await import("./capability.svelte");

			await hydrateUpdateCapability();

			expect(updatesUnsupportedReason()).toBeNull();
		},
	);
});
