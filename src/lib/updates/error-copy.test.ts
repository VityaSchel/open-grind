import { afterEach, describe, expect, it } from "vitest";

import { setLocale, SOURCE_LOCALE, t } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import {
	ADDON_KEYS,
	ADDON_NAME,
	APP_COMPONENT,
	FCM_COMPONENT,
	GOOGLE_OAUTH_COMPONENT,
	RECAPTCHA_COMPONENT,
} from "./components";
import {
	installFailedText,
	noReleaseText,
	problemBody,
	unsupportedIsFixable,
	unsupportedText,
	updateErrorText,
} from "./error-copy";
import { addonNames } from "./updates-test-helpers";

const fallback = "updates.flow.errors.downloadFailed";

const foreignTarget = {
	kind: "unsupported",
	detail: { reason: "foreignTarget" },
};

describe("copy for an installed package signed by someone else", () => {
	it("names the app generically for the app itself", () => {
		expect(unsupportedText({ reason: "foreignTarget" })).toBe(
			"The installed app isn’t signed by Open Grind",
		);
		expect(
			updateErrorText(foreignTarget, {
				fallback,
				component: APP_COMPONENT,
			}),
		).toBe("The installed app isn’t signed by Open Grind");
	});

	it("tells the user to uninstall the impostor Google OAuth app", () => {
		const text =
			"The installed Open Grind Google OAuth app isn’t signed by Open Grind. Uninstall it to install the official one.";

		expect(
			unsupportedText(
				{ reason: "foreignTarget" },
				{ component: GOOGLE_OAUTH_COMPONENT },
			),
		).toBe(text);
		for (const kind of ["install", "update"] as const) {
			expect(
				updateErrorText(foreignTarget, {
					fallback,
					component: GOOGLE_OAUTH_COMPONENT,
					kind,
				}),
			).toBe(text);
		}
	});

	it("counts as something the user can fix", () => {
		expect(unsupportedIsFixable({ reason: "foreignTarget" })).toBe(true);
	});
});

describe("copy for an Open Grind build signed by someone else", () => {
	it("blames this build, not the Google OAuth app, when the Google OAuth app cannot be installed", () => {
		const text =
			"This copy of Open Grind isn’t signed by Open Grind, so it can’t install the Open Grind Google OAuth app";

		expect(
			unsupportedText(
				{ reason: "foreignSigner" },
				{ component: GOOGLE_OAUTH_COMPONENT },
			),
		).toBe(text);
		expect(
			updateErrorText(
				{ kind: "unsupported", detail: { reason: "foreignSigner" } },
				{ fallback, component: GOOGLE_OAUTH_COMPONENT },
			),
		).toBe(text);
	});

	it("keeps the app's own wording", () => {
		expect(unsupportedText({ reason: "foreignSigner" })).toBe(
			"This build isn’t signed by Open Grind",
		);
	});
});

describe("copy for a release index with nothing to install", () => {
	it("says no release is published yet instead of blaming the device", () => {
		expect(noReleaseText({ component: GOOGLE_OAUTH_COMPONENT })).toBe(
			"No Open Grind Google OAuth app release is published yet",
		);
		expect(noReleaseText({ component: APP_COMPONENT })).toBe(
			"No Open Grind release is published yet",
		);
	});

	it("stays distinct from a device the release does not cover", () => {
		for (const component of [
			APP_COMPONENT,
			GOOGLE_OAUTH_COMPONENT,
		] as const) {
			expect(noReleaseText({ component })).not.toBe(
				unsupportedText(
					{ reason: "noReleaseArtifacts" },
					{ component },
				),
			);
		}
	});
});

describe("copy for an install the system refused", () => {
	it.each([
		[APP_COMPONENT, "install", "Couldn’t install the update"],
		[APP_COMPONENT, "update", "Couldn’t install the update"],
		[
			GOOGLE_OAUTH_COMPONENT,
			"install",
			"Couldn’t install the Open Grind Google OAuth app",
		],
		[
			GOOGLE_OAUTH_COMPONENT,
			"update",
			"Couldn’t update the Open Grind Google OAuth app",
		],
	] as const)(
		"words a %s %s by what was installed",
		(component, kind, text) => {
			expect(installFailedText({ code: 5, component, kind })).toBe(text);
			expect(installFailedText({ component, kind })).toBe(text);
		},
	);

	it("names full storage for status -4", () => {
		const code = -4;
		expect(
			installFailedText({
				code,
				component: APP_COMPONENT,
				kind: "update",
			}),
		).toBe("Not enough storage to install the update");
		expect(
			installFailedText({
				code,
				component: GOOGLE_OAUTH_COMPONENT,
				kind: "install",
			}),
		).toBe("Not enough storage to install the Open Grind Google OAuth app");
		expect(
			installFailedText({
				code,
				component: GOOGLE_OAUTH_COMPONENT,
				kind: "update",
			}),
		).toBe("Not enough storage to update the Open Grind Google OAuth app");
	});

	it.each([1, 4, 6, -18, -20, -110])(
		"stays generic for status %i",
		(code) => {
			expect(
				installFailedText({
					code,
					component: GOOGLE_OAUTH_COMPONENT,
					kind: "install",
				}),
			).toBe("Couldn’t install the Open Grind Google OAuth app");
		},
	);
});

describe("copy for a download refused while another one runs", () => {
	it.each([
		[
			GOOGLE_OAUTH_COMPONENT,
			APP_COMPONENT,
			"Wait for the Open Grind update to finish downloading",
		],
		[
			APP_COMPONENT,
			GOOGLE_OAUTH_COMPONENT,
			"Wait for the Open Grind Google OAuth app to finish downloading",
		],
	] as const)(
		"tells the %s flow which download is running",
		(component, running, text) => {
			expect(
				updateErrorText(
					{ kind: "busy", detail: { component: running } },
					{ fallback, component },
				),
			).toBe(text);
		},
	);

	it.each([
		["no detail", { kind: "busy" }],
		["an unknown component", { kind: "busy", detail: { component: "x" } }],
	])("keeps the generic text for %s", (_, error) => {
		expect(
			updateErrorText(error, {
				fallback,
				component: GOOGLE_OAUTH_COMPONENT,
			}),
		).toBe("Another download is already running");
	});
});

describe("copy for a release replaced after its one automatic retry", () => {
	it("asks the user to try again instead of promising a download", () => {
		for (const component of [
			APP_COMPONENT,
			GOOGLE_OAUTH_COMPONENT,
		] as const) {
			expect(
				updateErrorText(
					{ kind: "assetReplaced" },
					{ fallback, component },
				),
			).toBe("The release changed during the download. Try again.");
		}
	});
});

describe("copy for the app's own update errors", () => {
	it.each([
		[{ kind: "unsigned" }, "Couldn’t verify the update"],
		[{ kind: "signature" }, "Couldn’t verify the update"],
		[{ kind: "network" }, "Couldn’t reach the release server"],
		[{ kind: "storage" }, "Couldn’t write the update to storage"],
		[
			{ kind: "unknownComponent" },
			"Open Grind doesn’t know that component",
		],
		[
			{ kind: "unsupported", detail: { reason: "undetermined" } },
			"Open Grind can’t tell whether it may update itself",
		],
		[
			{
				kind: "unsupported",
				detail: {
					reason: "locationNotWritable",
					detail: { path: "/Applications/Open Grind.app" },
				},
			},
			"Open Grind can’t install the update in its directory",
		],
	])("words %j", (error, text) => {
		expect(updateErrorText(error, { fallback })).toBe(text);
	});

	it("keeps the caller's fallback for an error it does not know", () => {
		expect(updateErrorText(new Error("no plugin"), { fallback })).toBe(
			"Couldn’t download the update",
		);
	});
});

describe("copy for the Google OAuth app's own errors", () => {
	const component = GOOGLE_OAUTH_COMPONENT;

	it.each([
		[
			{ kind: "unsigned" },
			"Couldn’t verify the Open Grind Google OAuth app",
		],
		[
			{ kind: "storage" },
			"Couldn’t save the Open Grind Google OAuth app download",
		],
		[
			{
				kind: "unsupported",
				detail: {
					reason: "noReleaseArtifacts",
					detail: { target: "android-x86" },
				},
			},
			"The Open Grind Google OAuth app isn’t published for this device",
		],
		[
			{ kind: "unsupported", detail: { reason: "undetermined" } },
			"Open Grind can’t tell whether it may install the Open Grind Google OAuth app",
		],
	])("words %j", (error, text) => {
		expect(updateErrorText(error, { fallback, component })).toBe(text);
	});
});

describe("the subject line under a problem", () => {
	const component = GOOGLE_OAUTH_COMPONENT;

	it.each<[string, () => string]>([
		[
			"a refused install",
			() => installFailedText({ component, kind: "install" }),
		],
		[
			"a refused update",
			() => installFailedText({ component, kind: "update" }),
		],
		[
			"full storage",
			() => installFailedText({ code: -4, component, kind: "update" }),
		],
		[
			"a failed verification",
			() =>
				updateErrorText({ kind: "signature" }, { fallback, component }),
		],
		["no published release", () => noReleaseText({ component })],
		[
			"an impostor install",
			() => unsupportedText({ reason: "foreignTarget" }, { component }),
		],
		[
			"its own running download",
			() =>
				updateErrorText(
					{ kind: "busy", detail: { component } },
					{ fallback, component },
				),
		],
	])("is left out under its own message for %s", (_, title) => {
		expect(problemBody({ component, title: title() })).toBe(undefined);
	});

	it.each<[string, () => string]>([
		[
			"an unreachable server",
			() => updateErrorText({ kind: "network" }, { fallback, component }),
		],
		[
			"an unnamed running download",
			() => updateErrorText({ kind: "busy" }, { fallback, component }),
		],
		[
			"the app's running download",
			() =>
				updateErrorText(
					{ kind: "busy", detail: { component: APP_COMPONENT } },
					{ fallback, component },
				),
		],
		[
			"the reCAPTCHA helper's running download",
			() =>
				updateErrorText(
					{
						kind: "busy",
						detail: { component: RECAPTCHA_COMPONENT },
					},
					{ fallback, component },
				),
		],
		[
			"a release replaced twice",
			() =>
				updateErrorText(
					{ kind: "assetReplaced" },
					{ fallback, component },
				),
		],
		[
			"an unwritable directory",
			() =>
				unsupportedText(
					{ reason: "locationNotWritable" },
					{ component },
				),
		],
		[
			"a problem from elsewhere",
			() => t("updates.flow.finishOtherInstall"),
		],
	])("names the Google OAuth app under the message for %s", (_, title) => {
		expect(problemBody({ component, title: title() })).toBe(
			addonNames[component],
		);
	});

	it("is never added for the app", () => {
		expect(
			problemBody({
				component: APP_COMPONENT,
				title: updateErrorText({ kind: "network" }, { fallback }),
			}),
		).toBe(undefined);
	});
});

describe("the subject line in another language", () => {
	const component = GOOGLE_OAUTH_COMPONENT;

	afterEach(async () => {
		await setLocale({ locale: SOURCE_LOCALE });
	});

	it("is still left out under the add-on's own message", async () => {
		await setLocale({ locale: "en-XA" });
		const title = installFailedText({ component, kind: "install" });

		expect(title).toMatch(PSEUDO_MESSAGE);
		expect(problemBody({ component, title })).toBeUndefined();
	});

	it("names the add-on in that language under a generic message", async () => {
		await setLocale({ locale: "en-XA" });
		const body = problemBody({
			component,
			title: updateErrorText(
				{ kind: "network" },
				{ fallback, component },
			),
		});

		expect(body).toMatch(PSEUDO_MESSAGE);
		expect(body).toBe(t(ADDON_NAME[component]));
	});
});

describe("copy for the reCAPTCHA helper", () => {
	const component = RECAPTCHA_COMPONENT;

	it("names the helper wherever an add-on is named", () => {
		expect(
			unsupportedText({ reason: "foreignTarget" }, { component }),
		).toBe(
			"The installed Open Grind reCAPTCHA helper isn’t signed by Open Grind. Uninstall it to install the official one.",
		);
		expect(
			updateErrorText({ kind: "signature" }, { fallback, component }),
		).toBe("Couldn’t verify the Open Grind reCAPTCHA helper");
		expect(
			updateErrorText(
				{ kind: "install" },
				{ fallback, component, kind: "update" },
			),
		).toBe("Couldn’t update the Open Grind reCAPTCHA helper");
		expect(noReleaseText({ component })).toBe(
			"No Open Grind reCAPTCHA helper release is published yet",
		);
		expect(installFailedText({ code: -4, component, kind: "update" })).toBe(
			"Not enough storage to update the Open Grind reCAPTCHA helper",
		);
	});

	it("never mentions the Google OAuth app", () => {
		const texts = [
			...(
				[
					"externallyManaged",
					"foreignSigner",
					"foreignTarget",
					"noReleaseArtifacts",
					"undetermined",
				] as const
			).map((reason) => unsupportedText({ reason }, { component })),
			...(["unsigned", "signature", "storage", "install"] as const).map(
				(kind) => updateErrorText({ kind }, { fallback, component }),
			),
			installFailedText({ code: -4, component, kind: "install" }),
		];
		for (const text of texts) expect(text).not.toMatch(/Google/);
	});

	it("puts the helper's name under a problem title that lacks it", () => {
		const titleFor = (kind: "network" | "signature") =>
			updateErrorText({ kind }, { fallback, component });

		expect(problemBody({ component, title: titleFor("network") })).toBe(
			addonNames[component],
		);
		expect(
			problemBody({ component, title: titleFor("signature") }),
		).toBeUndefined();
	});
});

describe("copy for the FCM service", () => {
	const component = FCM_COMPONENT;

	it("names the service wherever an add-on is named", () => {
		expect(
			unsupportedText({ reason: "foreignTarget" }, { component }),
		).toBe(
			"The installed Open Grind FCM service isn’t signed by Open Grind. Uninstall it to install the official one.",
		);
		expect(
			updateErrorText({ kind: "signature" }, { fallback, component }),
		).toBe("Couldn’t verify the Open Grind FCM service");
		expect(noReleaseText({ component })).toBe(
			"No Open Grind FCM service release is published yet",
		);
		expect(
			installFailedText({ code: -4, component, kind: "install" }),
		).toBe("Not enough storage to install the Open Grind FCM service");
		expect(
			problemBody({
				component,
				title: updateErrorText(
					{ kind: "network" },
					{ fallback, component },
				),
			}),
		).toBe(addonNames[component]);
	});
});

describe("copy that must name every add-on", () => {
	it("never falls back to generic wording for a known add-on", () => {
		for (const component of ADDON_KEYS) {
			expect(
				updateErrorText(
					{ kind: "busy", detail: { component } },
					{ fallback, component: APP_COMPONENT },
				),
			).toBe(
				`Wait for the ${addonNames[component]} to finish downloading`,
			);
			expect(
				unsupportedText({ reason: "foreignTarget" }, { component }),
			).toContain(addonNames[component]);
		}
	});
});
