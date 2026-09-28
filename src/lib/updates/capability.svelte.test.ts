import { beforeEach, describe, expect, it, vi } from "vitest";

import { installedBy } from "./updates-test-helpers";

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

	it.each([
		["org.fdroid.fdroid", true],
		["com.looker.droidify", true],
		["com.android.vending", false],
		["dev.imranr.obtainium", false],
	])(
		"tells an install by %s as from F-Droid: %s",
		async (installer, fromFdroid) => {
			api.getUpdateCapability.mockResolvedValue(installedBy(installer));
			const { hydrateUpdateCapability, installedFromFdroid } =
				await import("./capability.svelte");

			await hydrateUpdateCapability();

			expect(installedFromFdroid()).toBe(fromFdroid);
		},
	);

	it("never takes a self-managed install for an F-Droid one", async () => {
		api.getUpdateCapability.mockResolvedValue({
			state: "supported",
			detail: { payloadSuffix: "-android.apk", canInstallNow: true },
		});
		const { hydrateUpdateCapability, installedFromFdroid } =
			await import("./capability.svelte");

		await hydrateUpdateCapability();

		expect(installedFromFdroid()).toBe(false);
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

	it("vouches for the build's signer only once the probe has answered", async () => {
		let answer: (capability: unknown) => void = () => {};
		api.getUpdateCapability.mockReturnValue(
			new Promise((resolve) => {
				answer = resolve;
			}),
		);
		const { hydrateUpdateCapability, buildSignedByOpenGrind } =
			await import("./capability.svelte");

		const hydrating = hydrateUpdateCapability();
		expect(buildSignedByOpenGrind()).toBe(false);

		answer({
			state: "supported",
			detail: { payloadSuffix: "-android.apk", canInstallNow: true },
		});
		await hydrating;
		expect(buildSignedByOpenGrind()).toBe(true);
	});

	it.each([
		["externallyManaged", { installer: "org.fdroid.fdroid" }, true],
		["undetermined", undefined, true],
		["foreignTarget", undefined, true],
		["foreignSigner", undefined, false],
	])(
		"tells whether Open Grind signed the build when %s decides updates",
		async (reason, detail, signed) => {
			api.getUpdateCapability.mockResolvedValue({
				state: "unsupported",
				detail: detail === undefined ? { reason } : { reason, detail },
			});
			const { hydrateUpdateCapability, buildSignedByOpenGrind } =
				await import("./capability.svelte");

			await hydrateUpdateCapability();

			expect(buildSignedByOpenGrind()).toBe(signed);
		},
	);

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
