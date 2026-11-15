import { describe, expect, it } from "vitest";

import { stageBody, stageTitle, type UpdateStage } from "./stage";

const stages: UpdateStage[] = [
	"available",
	"downloading",
	"verifying",
	"paused",
	"ready",
	"installing",
];

type CopyArgs = Parameters<typeof stageTitle>[0];
type CopySubject = Omit<CopyArgs, "stage">;

function copyOf({
	copy,
	component,
	kind,
}: CopySubject & { copy: (args: CopyArgs) => string | undefined }) {
	return Object.fromEntries(
		stages.map((stage) => [stage, copy({ component, kind, stage })]),
	);
}

function titles(subject: CopySubject) {
	return copyOf({ copy: stageTitle, ...subject });
}

function bodies(subject: CopySubject) {
	return copyOf({ copy: stageBody, ...subject });
}

describe("the stage toast title", () => {
	it("says update while an installed add-on updates", () => {
		expect(titles({ component: "google-oauth", kind: "update" })).toEqual({
			available: "Open Grind Google OAuth app update available",
			downloading: "Downloading the Open Grind Google OAuth app update…",
			verifying: "Verifying the Open Grind Google OAuth app update…",
			paused: "Open Grind Google OAuth app update is available",
			ready: "Open Grind Google OAuth app update is downloaded",
			installing: "Updating the Open Grind Google OAuth app…",
		});
	});

	it("says install while an add-on installs for the first time", () => {
		expect(titles({ component: "google-oauth", kind: "install" })).toEqual({
			available: "Open Grind Google OAuth app is available",
			downloading: "Downloading the Open Grind Google OAuth app…",
			verifying: "Verifying the Open Grind Google OAuth app…",
			paused: "Open Grind Google OAuth app is ready to download",
			ready: "Open Grind Google OAuth app is downloaded",
			installing: "Installing the Open Grind Google OAuth app…",
		});
	});

	it("keeps the app's own copy", () => {
		expect(titles({ component: "app", kind: "update" })).toEqual({
			available: "New update available",
			downloading: "Downloading update…",
			verifying: "Verifying the update…",
			paused: "Update is available",
			ready: "Update is downloaded",
			installing: "Installing…",
		});
	});
});

describe("the stage toast body", () => {
	const installBodies = {
		available: "Tap to install, swipe to dismiss",
		downloading: undefined,
		verifying: undefined,
		paused: "Tap to download",
		ready: "Tap to install",
		installing: undefined,
	};

	it("says update while an installed add-on updates", () => {
		expect(bodies({ component: "google-oauth", kind: "update" })).toEqual({
			available: "Tap to update, swipe to dismiss",
			downloading: undefined,
			verifying: undefined,
			paused: "Tap to download",
			ready: "Tap to update",
			installing: undefined,
		});
	});

	it("says install while an add-on installs for the first time", () => {
		expect(bodies({ component: "google-oauth", kind: "install" })).toEqual(
			installBodies,
		);
	});

	it("keeps the app's own copy", () => {
		expect(bodies({ component: "app", kind: "update" })).toEqual(
			installBodies,
		);
	});
});

describe("the reCAPTCHA helper's stage toast title", () => {
	it("names the helper, not another add-on", () => {
		expect(
			copyOf({
				copy: stageTitle,
				component: "recaptcha",
				kind: "update",
			}),
		).toStrictEqual({
			available: "Open Grind reCAPTCHA helper update available",
			downloading: "Downloading the Open Grind reCAPTCHA helper update…",
			verifying: "Verifying the Open Grind reCAPTCHA helper update…",
			paused: "Open Grind reCAPTCHA helper update is available",
			ready: "Open Grind reCAPTCHA helper update is downloaded",
			installing: "Updating the Open Grind reCAPTCHA helper…",
		});
		expect(
			stageTitle({
				component: "recaptcha",
				kind: "install",
				stage: "downloading",
			}),
		).toBe("Downloading the Open Grind reCAPTCHA helper…");
	});
});

describe("the FCM service's stage toast title", () => {
	it("names the service, not another add-on", () => {
		expect(
			stageTitle({
				component: "fcm",
				kind: "install",
				stage: "installing",
			}),
		).toBe("Installing the Open Grind FCM service…");
		expect(
			stageTitle({ component: "fcm", kind: "update", stage: "ready" }),
		).toBe("Open Grind FCM service update is downloaded");
	});
});
