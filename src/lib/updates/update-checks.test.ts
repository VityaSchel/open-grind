import { beforeEach, describe, expect, it, vi } from "vitest";

import { ADDON_KEYS, type AddonKey } from "./components";
import type { CheckReport } from "./flow";

const addonNames = {
	"google-oauth": "Google OAuth app",
	recaptcha: "reCAPTCHA helper",
	fcm: "FCM service",
} satisfies Record<AddonKey, string>;

const addonCases = ADDON_KEYS.map((addon): [AddonKey, string] => [
	addon,
	addonNames[addon],
]);

const { flows, addonFlow, updatesManager, updatesApi, toasts } = vi.hoisted(
	() => {
		const flow = () => ({
			checkNow: vi.fn<(options: unknown) => Promise<CheckReport>>(),
			withdrawUpdate: vi.fn<() => Promise<void>>(),
		});
		const flows = {
			"google-oauth": flow(),
			recaptcha: flow(),
			fcm: flow(),
		} satisfies Record<AddonKey, ReturnType<typeof flow>>;
		return {
			flows,
			addonFlow: (component: AddonKey) => flows[component],
			updatesManager: {
				checkForUpdateNow:
					vi.fn<(options: unknown) => Promise<CheckReport>>(),
			},
			updatesApi: {
				getInstalledVersion:
					vi.fn<(component: AddonKey) => Promise<string | null>>(),
			},
			toasts: {
				showProblem:
					vi.fn<
						(problem: { title: string; body?: string }) => void
					>(),
				showUpToDate: vi.fn<(title: string) => void>(),
				showNotice: vi.fn<(title: string) => void>(),
			},
		};
	},
);

vi.mock("./addon.svelte", () => ({ addonFlow }));
vi.mock("./updates-manager", () => updatesManager);
vi.mock("./index", () => updatesApi);
vi.mock("./toasts", () => toasts);

import {
	automaticChecksSetting,
	checkAfterOptIn,
	checkForUpdatesNow,
	manualCheckOffered,
} from "./update-checks";

const googleOAuth = flows["google-oauth"];

const storeBuild = {
	selfManaged: false,
	unsupportedReason: null,
	addonAvailable: true,
};
const selfManagedBuild = { selfManaged: true, addonAvailable: true };

type Lookup = string | null | { rejects: unknown };

function installed(byComponent: Partial<Record<AddonKey, Lookup>>): void {
	const lookups = new Map(
		Object.entries(byComponent).map(([component, lookup]) => {
			const read = vi.fn<() => Promise<string | null>>();
			if (typeof lookup === "object" && lookup !== null)
				read.mockRejectedValue(lookup.rejects);
			else read.mockResolvedValue(lookup ?? null);
			return [component, read] as const;
		}),
	);
	updatesApi.getInstalledVersion.mockImplementation(
		(component) => lookups.get(component)?.() ?? Promise.resolve(null),
	);
}

beforeEach(() => {
	vi.clearAllMocks();
	installed({ "google-oauth": "1.1.0" });
	updatesManager.checkForUpdateNow.mockResolvedValue("current");
	for (const flow of Object.values(flows)) {
		flow.checkNow.mockResolvedValue("current");
	}
});

describe("the automatic update checks switch", () => {
	it("speaks for the app and its add-ons on a self-managed build", () => {
		expect(
			automaticChecksSetting({ ...storeBuild, selfManaged: true }),
		).toEqual({
			title: "Check updates automatically",
			description:
				"Periodically request updates for Open Grind and its add-ons from git.opengrind.org. No personally identifiable information is sent, no requests are stored or analyzed.",
			blocked: false,
		});
	});

	it("names only Open Grind where no add-on installs", () => {
		expect(
			automaticChecksSetting({
				selfManaged: true,
				unsupportedReason: null,
				addonAvailable: false,
			}).description,
		).toBe(
			"Periodically request updates for Open Grind from git.opengrind.org. No personally identifiable information is sent, no requests are stored or analyzed.",
		);
	});

	it("speaks only for the add-ons on a store build", () => {
		expect(automaticChecksSetting(storeBuild)).toEqual({
			title: "Check add-on updates automatically",
			description:
				"Periodically ask git.opengrind.org whether newer versions of your installed add-ons are published. Open Grind itself isn't updated from here. No personally identifiable information is sent, no requests are stored or analyzed.",
			blocked: false,
		});
	});

	it("stays usable for the add-ons when the app cannot update itself", () => {
		const setting = automaticChecksSetting({
			...storeBuild,
			unsupportedReason:
				"Open Grind can't tell whether it may update itself",
		});

		expect(setting.blocked).toBe(false);
		expect(setting.title).toBe("Check add-on updates automatically");
		expect(setting.description).toMatch(
			/^Open Grind can't tell whether it may update itself\. Periodically ask git\.opengrind\.org whether newer versions of your installed add-ons/,
		);
	});

	it("blocks the switch and says why when nothing here can be checked", () => {
		expect(
			automaticChecksSetting({
				selfManaged: false,
				unsupportedReason:
					"Open Grind can't install the update in its directory",
				addonAvailable: false,
			}),
		).toEqual({
			title: "Check updates automatically",
			description: "Open Grind can't install the update in its directory",
			blocked: true,
		});
	});
});

describe("checking right after opting in", () => {
	it("leaves the app to its store and checks only the add-on", async () => {
		await checkAfterOptIn(storeBuild);

		expect(updatesManager.checkForUpdateNow).not.toHaveBeenCalled();
		expect(googleOAuth.checkNow).toHaveBeenCalledOnce();
	});

	it("checks the app and the add-on quietly on a self-managed build", async () => {
		await checkAfterOptIn(selfManagedBuild);

		expect(updatesManager.checkForUpdateNow).toHaveBeenCalledWith({
			reportFailure: false,
		});
		expect(googleOAuth.checkNow).toHaveBeenCalledWith({
			reportFailure: false,
		});
	});

	it("checks only the app where no add-on installs", async () => {
		await checkAfterOptIn({ selfManaged: true, addonAvailable: false });

		expect(updatesManager.checkForUpdateNow).toHaveBeenCalledOnce();
		expect(updatesApi.getInstalledVersion).not.toHaveBeenCalled();
		expect(googleOAuth.checkNow).not.toHaveBeenCalled();
	});

	it("does not ask about an add-on that is not installed", async () => {
		installed({});

		await checkAfterOptIn(storeBuild);

		expect(googleOAuth.checkNow).not.toHaveBeenCalled();
	});

	it("withdraws the update offer of an add-on that was uninstalled", async () => {
		installed({});

		await checkAfterOptIn(storeBuild);

		expect(googleOAuth.withdrawUpdate).toHaveBeenCalledOnce();
	});

	it("never says that nothing was found", async () => {
		await checkAfterOptIn(selfManagedBuild);

		expect(toasts.showUpToDate).not.toHaveBeenCalled();
	});
});

describe("the Check for updates action", () => {
	it("is offered wherever the app or an add-on updates from here", () => {
		expect(manualCheckOffered(selfManagedBuild)).toBe(true);
		expect(manualCheckOffered(storeBuild)).toBe(true);
		expect(
			manualCheckOffered({ selfManaged: true, addonAvailable: false }),
		).toBe(true);
		expect(
			manualCheckOffered({ selfManaged: false, addonAvailable: false }),
		).toBe(false);
	});

	it("checks the app and the installed add-on and reports failures", async () => {
		await checkForUpdatesNow(selfManagedBuild);

		expect(updatesManager.checkForUpdateNow).toHaveBeenCalledWith({
			reportFailure: true,
		});
		expect(googleOAuth.checkNow).toHaveBeenCalledWith({
			reportFailure: true,
		});
		expect(googleOAuth.withdrawUpdate).not.toHaveBeenCalled();
	});

	it("checks every add-on this build can install", async () => {
		installed(
			Object.fromEntries(ADDON_KEYS.map((addon) => [addon, "1.1.0"])),
		);

		await checkForUpdatesNow(storeBuild);

		for (const addon of ADDON_KEYS) {
			expect(flows[addon].checkNow).toHaveBeenCalledExactlyOnceWith({
				reportFailure: true,
			});
		}
	});

	it("says no updates are available when everything is current", async () => {
		await checkForUpdatesNow(selfManagedBuild);

		expect(toasts.showUpToDate).toHaveBeenCalledExactlyOnceWith(
			"No updates available",
		);
	});

	it("leaves the app to its store", async () => {
		await checkForUpdatesNow(storeBuild);

		expect(updatesManager.checkForUpdateNow).not.toHaveBeenCalled();
		expect(toasts.showUpToDate).toHaveBeenCalledOnce();
	});

	it("skips an add-on that is not installed", async () => {
		installed({});

		await checkForUpdatesNow(selfManagedBuild);

		expect(googleOAuth.checkNow).not.toHaveBeenCalled();
		expect(toasts.showUpToDate).toHaveBeenCalledExactlyOnceWith(
			"No updates available",
		);
	});

	it("does not claim updates were checked when nothing here is installed", async () => {
		installed({});

		await checkForUpdatesNow(storeBuild);

		expect(googleOAuth.checkNow).not.toHaveBeenCalled();
		expect(toasts.showUpToDate).not.toHaveBeenCalled();
		expect(toasts.showNotice).toHaveBeenCalledExactlyOnceWith(
			"No add-ons installed",
		);
	});

	it("withdraws the offer of an uninstalled add-on before saying none is installed", async () => {
		installed({});

		let finishWithdrawing: () => void = () => {};
		googleOAuth.withdrawUpdate.mockReturnValueOnce(
			new Promise((resolve) => {
				finishWithdrawing = resolve;
			}),
		);

		const checking = checkForUpdatesNow(storeBuild);
		await vi.waitFor(() =>
			expect(googleOAuth.withdrawUpdate).toHaveBeenCalledOnce(),
		);
		expect(toasts.showNotice).not.toHaveBeenCalled();

		finishWithdrawing();
		await checking;

		expect(toasts.showNotice).toHaveBeenCalledOnce();
	});

	it("reports an add-on it could not look for instead of calling it current", async () => {
		installed({ "google-oauth": { rejects: new Error("no plugin") } });

		await checkForUpdatesNow(storeBuild);

		expect(googleOAuth.checkNow).not.toHaveBeenCalled();
		expect(toasts.showUpToDate).not.toHaveBeenCalled();
		expect(toasts.showProblem).toHaveBeenCalledExactlyOnceWith({
			title: "Couldn't check for updates",
			body: "Google OAuth app",
		});
	});

	it("does not repeat the Google OAuth app under a title that names it", async () => {
		installed({
			"google-oauth": {
				rejects: {
					kind: "unsupported",
					detail: { reason: "foreignTarget" },
				},
			},
		});

		await checkForUpdatesNow(storeBuild);

		expect(toasts.showProblem).toHaveBeenCalledExactlyOnceWith({
			title: "The installed Google OAuth app isn't signed by Open Grind. Uninstall it to install the official one.",
			body: undefined,
		});
	});

	it("keeps a failed add-on lookup quiet right after opting in", async () => {
		installed({ "google-oauth": { rejects: new Error("no plugin") } });

		await checkAfterOptIn(storeBuild);

		expect(toasts.showProblem).not.toHaveBeenCalled();
	});

	it.each<[CheckReport, CheckReport]>([
		["offered", "current"],
		["current", "offered"],
		["failed", "current"],
		["current", "failed"],
		["busy", "current"],
		["current", "busy"],
	])(
		"stays quiet about the rest when the app reports %s and the add-on %s",
		async (app, addon) => {
			updatesManager.checkForUpdateNow.mockResolvedValue(app);
			googleOAuth.checkNow.mockResolvedValue(addon);

			await checkForUpdatesNow(selfManagedBuild);

			expect(toasts.showUpToDate).not.toHaveBeenCalled();
		},
	);

	it("waits for every check before it settles", async () => {
		let answerAddon: (report: CheckReport) => void = () => {};
		googleOAuth.checkNow.mockReturnValue(
			new Promise((resolve) => {
				answerAddon = resolve;
			}),
		);
		let settled = false;

		const checking = checkForUpdatesNow(selfManagedBuild).then(() => {
			settled = true;
		});
		await vi.waitFor(() =>
			expect(googleOAuth.checkNow).toHaveBeenCalledOnce(),
		);
		expect(settled).toBe(false);

		answerAddon("current");
		await checking;

		expect(toasts.showUpToDate).toHaveBeenCalledOnce();
	});

	it("asks about no add-on where add-ons can't install", async () => {
		installed(
			Object.fromEntries(ADDON_KEYS.map((addon) => [addon, "1.1.0"])),
		);

		await checkForUpdatesNow({ selfManaged: true, addonAvailable: false });

		expect(updatesApi.getInstalledVersion).not.toHaveBeenCalled();
		expect(googleOAuth.checkNow).not.toHaveBeenCalled();
	});
});

describe.each<[AddonKey, string]>(addonCases)(
	"the %s add-on",
	(addon, name) => {
		const flow = flows[addon];
		const others = ADDON_KEYS.filter((other) => other !== addon);

		it("is checked once it is installed", async () => {
			installed({ [addon]: "1.1.0" });

			await checkForUpdatesNow(storeBuild);

			expect(flow.checkNow).toHaveBeenCalledExactlyOnceWith({
				reportFailure: true,
			});
		});

		it("is checked quietly right after opting in", async () => {
			installed({ [addon]: "1.1.0" });

			await checkAfterOptIn(storeBuild);

			expect(flow.checkNow).toHaveBeenCalledExactlyOnceWith({
				reportFailure: false,
			});
		});

		it("is checked on its own while no other add-on is installed", async () => {
			installed({ [addon]: "1.1.0" });

			await checkForUpdatesNow(storeBuild);

			for (const other of others) {
				expect(flows[other].checkNow).not.toHaveBeenCalled();
				expect(flows[other].withdrawUpdate).toHaveBeenCalledOnce();
			}
			expect(toasts.showNotice).not.toHaveBeenCalled();
			expect(toasts.showUpToDate).toHaveBeenCalledExactlyOnceWith(
				"No updates available",
			);
		});

		it("keeps the rest quiet while it offers an update", async () => {
			installed({ [addon]: "1.0.0" });
			flow.checkNow.mockResolvedValue("offered");

			await checkForUpdatesNow(selfManagedBuild);

			expect(toasts.showUpToDate).not.toHaveBeenCalled();
		});

		it("is named under the problem when its lookup fails", async () => {
			installed({ [addon]: { rejects: new Error("no plugin") } });

			await checkForUpdatesNow(storeBuild);

			expect(flow.checkNow).not.toHaveBeenCalled();
			expect(toasts.showProblem).toHaveBeenCalledExactlyOnceWith({
				title: "Couldn't check for updates",
				body: name,
			});
		});
	},
);
