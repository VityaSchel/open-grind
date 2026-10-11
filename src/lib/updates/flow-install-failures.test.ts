import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ComponentKey } from "./components";
import type { InstallKind } from "./stage";
import {
	awaitingPermission,
	flowFor,
	offer,
	outcomeOf,
	ready,
	settled,
	updateApiFake,
} from "./updates-test-helpers";

const RAW_REFUSAL =
	"INSTALL_FAILED_UPDATE_INCOMPATIBLE: Existing package org.opengrind.google_oauth signatures do not match newer version; ignoring!";

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

describe("an install that does not go through", () => {
	it.each<[InstallKind, string]>([
		["update", "problem:Couldn’t update the Open Grind Google OAuth app"],
		["install", "problem:Couldn’t install the Open Grind Google OAuth app"],
	])(
		"names a Google OAuth app %s the system refused to install",
		async (kind, problem) => {
			readiness["google-oauth"] = ready(kind);
			api.installUpdate.mockRejectedValue({ kind: "install" });
			const { flow, view } = await flowFor("google-oauth");

			await flow.installNow();

			expect(view.problems()).toEqual([problem]);
		},
	);

	it.each<[ComponentKey, InstallKind, string]>([
		[
			"google-oauth",
			"update",
			"problem:Couldn’t update the Open Grind Google OAuth app",
		],
		[
			"google-oauth",
			"install",
			"problem:Couldn’t install the Open Grind Google OAuth app",
		],
		["app", "update", "problem:Couldn’t install the update"],
	])(
		"words a %s %s the system refused without the system's own message",
		async (component, kind, problem) => {
			readiness[component] = ready(kind);
			const { flow, view } = await flowFor(component);
			await flow.installNow();

			emitOutcome(
				outcomeOf(component, {
					succeeded: false,
					code: -7,
					message: RAW_REFUSAL,
				}),
			);
			await settled();

			expect(view.problems()).toEqual([problem]);
			expect(view.events.at(-1)).toBe("show:ready");
		},
	);

	it.each<[InstallKind, string]>([
		[
			"install",
			"problem:Not enough storage to install the Open Grind Google OAuth app",
		],
		[
			"update",
			"problem:Not enough storage to update the Open Grind Google OAuth app",
		],
	])(
		"says storage ran out for a Google OAuth app %s",
		async (kind, problem) => {
			readiness["google-oauth"] = ready(kind);
			const { flow, view } = await flowFor("google-oauth");
			await flow.installNow();

			emitOutcome(
				outcomeOf("google-oauth", {
					succeeded: false,
					code: -4,
					message:
						"INSTALL_FAILED_INSUFFICIENT_STORAGE: Failed to allocate",
				}),
			);
			await settled();

			expect(view.problems()).toEqual([problem]);
		},
	);

	it.each<[ComponentKey, InstallKind]>([
		["google-oauth", "install"],
		["google-oauth", "update"],
		["app", "update"],
	])(
		"keeps the %s %s tappable when the permission screen will not open",
		async (component, kind) => {
			readiness[component] = awaitingPermission(kind);
			api.openInstallPermissionSettings.mockRejectedValue({
				kind: "install",
				detail: "settings-unavailable",
			});
			const { flow, view } = await flowFor(component);

			await flow.installNow();

			expect(view.events).toEqual([
				"show:ready",
				"problem:Couldn’t open the install permission screen",
			]);
		},
	);

	it("names the Google OAuth app when its store owns its updates", async () => {
		readiness["google-oauth"] = {
			state: "unsupported",
			detail: {
				reason: "externallyManaged",
				detail: { installer: "org.fdroid.fdroid" },
			},
		};
		const { flow, view } = await flowFor("google-oauth");

		await flow.installNow();

		expect(view.problems()).toEqual([
			"problem:The store that installed the Open Grind Google OAuth app manages its updates",
		]);
	});
});

describe("a failure the updater gives no reason for", () => {
	it("says the download did not finish", async () => {
		api.checkForUpdate.mockResolvedValue(
			offer("update", { component: "app" }),
		);
		const { flow, view } = await flowFor("app");
		await flow.start();
		api.startUpdateDownload.mockRejectedValue(new Error("no plugin"));

		view.activate();
		await settled();

		expect(view.problems()).toEqual([
			"problem:Couldn’t download the update",
		]);
	});

	it("says the check did not finish when asked to report it", async () => {
		api.checkForUpdate.mockRejectedValue(new Error("no plugin"));
		const { flow, view } = await flowFor("app");

		expect(await flow.checkNow({ reportFailure: true })).toBe("failed");
		expect(view.problems()).toEqual(["problem:Couldn’t check for updates"]);
	});

	it("says the download could not be stopped", async () => {
		api.checkForUpdate.mockResolvedValue(
			offer("update", { component: "app" }),
		);
		const { flow, view } = await flowFor("app");
		await flow.start();
		view.activate();
		await settled();
		api.cancelUpdateDownload.mockRejectedValue(new Error("no plugin"));

		view.cancel();
		await settled();

		expect(view.problems()).toEqual(["problem:Couldn’t stop the download"]);
	});
});
