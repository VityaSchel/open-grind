import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ComponentKey } from "./components";
import {
	awaitingPermission,
	flowFor,
	offer,
	outcomeOf,
	ready,
	resumable,
	settled,
	updateApiFake,
} from "./updates-test-helpers";

const fake = updateApiFake();
const { api, readiness, emitOutcome } = fake;

vi.mock("./index", async () => ({
	...(await import("./types")),
	...(await import("./components")),
	...fake.api,
}));

beforeEach(() => {
	vi.resetModules();
	fake.reset();
});

describe("flows sharing one device", () => {
	async function addonInstallWhileAppInstalls() {
		readiness.app = ready("update", { tag: "v0.2.0" });
		readiness["google-oauth"] = ready("update");
		const app = await flowFor("app");
		const addon = await flowFor("google-oauth");
		await app.flow.start();
		await addon.flow.start();
		app.view.activate();
		await settled();
		addon.view.activate();
		await settled();
		return addon;
	}

	it("keep a second install out while the first awaits its outcome", async () => {
		api.installPending.mockResolvedValue(true);

		const addon = await addonInstallWhileAppInstalls();

		expect(api.installUpdate.mock.calls).toEqual([["app"]]);
		expect(api.installPending).toHaveBeenCalledOnce();
		expect(addon.view.problems()).toEqual([
			"problem:Finish the other install first",
		]);

		emitOutcome(outcomeOf("app", { succeeded: false, canceled: true }));
		await settled();
		addon.view.activate();
		await settled();

		expect(api.installUpdate).toHaveBeenLastCalledWith("google-oauth");
	});

	it("take over from an install whose session the system already closed", async () => {
		const addon = await addonInstallWhileAppInstalls();

		expect(api.installPending).toHaveBeenCalledOnce();
		expect(addon.view.problems()).toEqual([]);
		expect(api.installUpdate).toHaveBeenLastCalledWith("google-oauth");
	});

	it("return the flow they took over from to its downloaded stage", async () => {
		readiness.app = ready("update", { tag: "v0.2.0" });
		readiness["google-oauth"] = ready("update");
		const app = await flowFor("app");
		const addon = await flowFor("google-oauth");
		await app.flow.start();
		await addon.flow.start();
		app.view.activate();
		await settled();
		const installing = app.view.events.length;
		expect(app.view.events.at(-1)).toBe("show:installing");

		addon.view.activate();
		await settled();

		expect(app.view.events.slice(installing)).toEqual(["show:ready"]);
	});

	it("leave alone an install that finished while they were asking the system", async () => {
		readiness.app = ready("update", { tag: "v0.2.0" });
		readiness["google-oauth"] = ready("update");
		let answer!: (pending: boolean) => void;
		api.installPending.mockImplementation(
			() => new Promise<boolean>((resolve) => (answer = resolve)),
		);
		const app = await flowFor("app");
		const addon = await flowFor("google-oauth");
		await app.flow.start();
		await addon.flow.start();
		app.view.activate();
		await settled();
		addon.view.activate();
		await settled();

		emitOutcome(outcomeOf("app", { succeeded: false, canceled: true }));
		await settled();
		const appAfterCancel = app.view.events.length;
		answer(false);
		await settled();

		expect(app.view.events.slice(appAfterCancel)).not.toContain("dismiss");
		expect(api.installUpdate).toHaveBeenLastCalledWith("google-oauth");
	});

	it("never ask the system while the other install is still being handed over", async () => {
		readiness.app = ready("update", { tag: "v0.2.0" });
		readiness["google-oauth"] = ready("update");
		api.installUpdate.mockImplementation(
			(component?: string) =>
				new Promise<void>((resolve) => {
					if (component !== "app") resolve();
				}),
		);
		const app = await flowFor("app");
		const addon = await flowFor("google-oauth");
		await app.flow.start();
		await addon.flow.start();

		app.view.activate();
		await settled();
		addon.view.activate();
		await settled();

		expect(api.installPending).not.toHaveBeenCalled();
		expect(api.installUpdate.mock.calls).toEqual([["app"]]);
		expect(addon.view.problems()).toEqual([
			"problem:Finish the other install first",
		]);
	});

	it("keep refusing when it cannot tell whether the other install is still open", async () => {
		api.installPending.mockRejectedValue(new Error("no plugin"));

		const addon = await addonInstallWhileAppInstalls();

		expect(api.installUpdate).toHaveBeenCalledTimes(1);
		expect(addon.view.problems()).toEqual([
			"problem:Finish the other install first",
		]);
	});

	it("share one install permission, so a grant in one flow counts for the other", async () => {
		readiness.app = awaitingPermission("update", { tag: "v0.2.0" });
		readiness["google-oauth"] = awaitingPermission("update");
		const app = await flowFor("app");
		const addon = await flowFor("google-oauth");
		await app.flow.start();
		await addon.flow.start();

		app.view.activate();
		await settled();
		expect(api.openInstallPermissionSettings).toHaveBeenCalledTimes(1);

		readiness.app = ready("update", { tag: "v0.2.0" });
		readiness["google-oauth"] = ready("update");
		addon.view.activate();
		await settled();

		expect(api.openInstallPermissionSettings).toHaveBeenCalledTimes(1);
		expect(api.installUpdate).toHaveBeenCalledWith("google-oauth");

		document.dispatchEvent(new Event("visibilitychange"));
		await settled();
	});

	it("resume only the flow that opened the permission screen", async () => {
		readiness.app = awaitingPermission("update", { tag: "v0.2.0" });
		readiness["google-oauth"] = awaitingPermission("update");
		const app = await flowFor("app");
		const addon = await flowFor("google-oauth");
		await app.flow.start();
		await addon.flow.start();

		app.view.activate();
		await settled();
		addon.view.activate();
		await settled();
		expect(api.openInstallPermissionSettings).toHaveBeenCalledTimes(2);

		readiness.app = ready("update", { tag: "v0.2.0" });
		readiness["google-oauth"] = ready("update");
		document.dispatchEvent(new Event("visibilitychange"));
		await settled();

		expect(api.installUpdate).toHaveBeenCalledTimes(1);
		expect(api.installUpdate).toHaveBeenCalledWith("google-oauth");
	});

	it("keep an offer and stay quiet when an automatic resume finds the queue busy", async () => {
		readiness["google-oauth"] = resumable("update");
		api.startUpdateDownload.mockRejectedValue({
			kind: "busy",
			detail: { component: "app" },
		});
		const { flow, view } = await flowFor("google-oauth");

		await flow.start();

		expect(view.problems()).toEqual([]);
		expect(view.events).toEqual(["show:downloading", "show:paused"]);
	});

	it("say why a tapped download did not start", async () => {
		api.checkForUpdate.mockResolvedValue(offer("update"));
		const { flow, view } = await flowFor("google-oauth");
		await flow.start();
		api.startUpdateDownload.mockRejectedValue({ kind: "busy" });

		view.activate();
		await settled();

		expect(view.events.at(-2)).toBe("show:available");
		expect(view.problems()).toEqual([
			"problem:Another download is already running",
		]);
	});

	it.each<[ComponentKey, ComponentKey, string]>([
		[
			"google-oauth",
			"app",
			"Wait for the Open Grind update to finish downloading",
		],
		[
			"app",
			"google-oauth",
			"Wait for the Open Grind Google OAuth app to finish downloading",
		],
	])(
		"tells the %s flow that the %s download has to finish first",
		async (component, running, problem) => {
			api.checkForUpdate.mockResolvedValue(
				offer("update", { component }),
			);
			api.startUpdateDownload.mockRejectedValue({
				kind: "busy",
				detail: { component: running },
			});
			const { flow, view } = await flowFor(component);

			await flow.installNow();

			expect(view.problems()).toEqual([`problem:${problem}`]);
		},
	);
});
