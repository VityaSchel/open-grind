import { describe, expect, it } from "vitest";

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

const foreignTarget = {
	kind: "unsupported",
	detail: { reason: "foreignTarget" },
};

describe("copy for an installed package signed by someone else", () => {
	it("names the app generically for the app itself", () => {
		expect(unsupportedText({ reason: "foreignTarget" })).toBe(
			"The installed app isn't signed by Open Grind",
		);
		expect(
			updateErrorText(foreignTarget, {
				fallback: "fallback",
				component: APP_COMPONENT,
			}),
		).toBe("The installed app isn't signed by Open Grind");
	});

	it("tells the user to uninstall the impostor Google OAuth app", () => {
		const text =
			"The installed Google OAuth app isn't signed by Open Grind. Uninstall it to install the official one.";

		expect(
			unsupportedText(
				{ reason: "foreignTarget" },
				{ component: GOOGLE_OAUTH_COMPONENT },
			),
		).toBe(text);
		for (const kind of ["install", "update"] as const) {
			expect(
				updateErrorText(foreignTarget, {
					fallback: "fallback",
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
			"This copy of Open Grind isn't signed by Open Grind, so it can't install the Google OAuth app";

		expect(
			unsupportedText(
				{ reason: "foreignSigner" },
				{ component: GOOGLE_OAUTH_COMPONENT },
			),
		).toBe(text);
		expect(
			updateErrorText(
				{ kind: "unsupported", detail: { reason: "foreignSigner" } },
				{ fallback: "fallback", component: GOOGLE_OAUTH_COMPONENT },
			),
		).toBe(text);
	});

	it("keeps the app's own wording", () => {
		expect(unsupportedText({ reason: "foreignSigner" })).toBe(
			"This build was not signed by Open Grind",
		);
	});
});

describe("copy for a release index with nothing to install", () => {
	it("says no release is published yet instead of blaming the device", () => {
		expect(noReleaseText({ component: GOOGLE_OAUTH_COMPONENT })).toBe(
			"No Google OAuth app release is published yet",
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
		[APP_COMPONENT, "install", "Couldn't install the update"],
		[APP_COMPONENT, "update", "Couldn't install the update"],
		[
			GOOGLE_OAUTH_COMPONENT,
			"install",
			"Couldn't install the Google OAuth app",
		],
		[
			GOOGLE_OAUTH_COMPONENT,
			"update",
			"Couldn't update the Google OAuth app",
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
		).toBe("Not enough storage to install the Google OAuth app");
		expect(
			installFailedText({
				code,
				component: GOOGLE_OAUTH_COMPONENT,
				kind: "update",
			}),
		).toBe("Not enough storage to update the Google OAuth app");
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
			).toBe("Couldn't install the Google OAuth app");
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
			"Wait for the Google OAuth app to finish downloading",
		],
	] as const)(
		"tells the %s flow which download is running",
		(component, running, text) => {
			expect(
				updateErrorText(
					{ kind: "busy", detail: { component: running } },
					{ fallback: "fallback", component },
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
				fallback: "fallback",
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
					{ fallback: "fallback", component },
				),
			).toBe("The release changed during the download. Try again.");
		}
	});
});

describe("the subject line under a problem", () => {
	it.each([
		"Couldn't install the Google OAuth app",
		"Couldn't update the Google OAuth app",
		"Failed to verify the Google OAuth app",
		"No Google OAuth app release is published yet",
		"The installed Google OAuth app isn't signed by Open Grind. Uninstall it to install the official one.",
	])("is left out when the title says %s", (title) => {
		expect(problemBody({ component: GOOGLE_OAUTH_COMPONENT, title })).toBe(
			undefined,
		);
	});

	it.each([
		"Couldn't reach the release server",
		"Another download is already running",
		"Finish the other install first",
		"The release changed during the download. Try again.",
	])("names the Google OAuth app under %s", (title) => {
		expect(problemBody({ component: GOOGLE_OAUTH_COMPONENT, title })).toBe(
			"Google OAuth app",
		);
	});

	it("is never added for the app", () => {
		expect(
			problemBody({
				component: APP_COMPONENT,
				title: "Couldn't reach the release server",
			}),
		).toBe(undefined);
	});
});

describe("copy for the reCAPTCHA helper", () => {
	const component = RECAPTCHA_COMPONENT;

	it("names the helper wherever an add-on is named", () => {
		expect(
			unsupportedText({ reason: "foreignTarget" }, { component }),
		).toBe(
			"The installed reCAPTCHA helper isn't signed by Open Grind. Uninstall it to install the official one.",
		);
		expect(
			updateErrorText(
				{ kind: "signature" },
				{ fallback: "fallback", component },
			),
		).toBe("Failed to verify the reCAPTCHA helper");
		expect(
			updateErrorText(
				{ kind: "install" },
				{ fallback: "fallback", component, kind: "update" },
			),
		).toBe("Couldn't update the reCAPTCHA helper");
		expect(noReleaseText({ component })).toBe(
			"No reCAPTCHA helper release is published yet",
		);
		expect(installFailedText({ code: -4, component, kind: "update" })).toBe(
			"Not enough storage to update the reCAPTCHA helper",
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
				(kind) =>
					updateErrorText(
						{ kind },
						{ fallback: "fallback", component },
					),
			),
			installFailedText({ code: -4, component, kind: "install" }),
		];
		for (const text of texts) expect(text).not.toMatch(/Google/);
	});

	it("puts the helper's name under a problem title that lacks it", () => {
		expect(
			problemBody({ component, title: "Couldn't check for updates" }),
		).toBe("reCAPTCHA helper");
		expect(
			problemBody({
				component,
				title: "Failed to verify the reCAPTCHA helper",
			}),
		).toBeUndefined();
	});
});

describe("copy for the FCM service", () => {
	const component = FCM_COMPONENT;

	it("names the service wherever an add-on is named", () => {
		expect(
			unsupportedText({ reason: "foreignTarget" }, { component }),
		).toBe(
			"The installed FCM service isn't signed by Open Grind. Uninstall it to install the official one.",
		);
		expect(
			updateErrorText(
				{ kind: "signature" },
				{ fallback: "fallback", component },
			),
		).toBe("Failed to verify the FCM service");
		expect(noReleaseText({ component })).toBe(
			"No FCM service release is published yet",
		);
		expect(
			installFailedText({ code: -4, component, kind: "install" }),
		).toBe("Not enough storage to install the FCM service");
		expect(
			problemBody({ component, title: "Couldn't check for updates" }),
		).toBe("FCM service");
	});
});

describe("copy that must name every add-on", () => {
	it("never falls back to generic wording for a known add-on", () => {
		for (const component of ADDON_KEYS) {
			expect(
				updateErrorText(
					{ kind: "busy", detail: { component } },
					{ fallback: "fallback", component: APP_COMPONENT },
				),
			).toBe(
				`Wait for the ${ADDON_NAME[component]} to finish downloading`,
			);
			expect(
				unsupportedText({ reason: "foreignTarget" }, { component }),
			).toContain(ADDON_NAME[component]);
		}
	});
});
