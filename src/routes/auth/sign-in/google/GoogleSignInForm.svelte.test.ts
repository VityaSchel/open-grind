// @vitest-environment jsdom

import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";

import {
	awaitingPermission,
	offer,
	outcomeOf,
	progressOf,
	ready,
	resumable,
	settled,
	toastsFake,
	updateApiFake,
} from "$lib/updates/updates-test-helpers";
import type { Capability } from "$lib/updates/types";

const COMPANION_RELEASES =
	"https://git.opengrind.org/open-grind/google-oauth-app/releases#install";
const SCREEN_URL = "http://localhost/auth/sign-in/google";

const fake = updateApiFake();
const toasts = toastsFake();
const { api, readiness, emitProgress, emitOutcome } = fake;
const {
	callMethodMock,
	gotoMock,
	pageMock,
	toastMock,
	platform,
	openExternalLink,
	getUpdateCapability,
} = vi.hoisted(() => ({
	getUpdateCapability: vi.fn<() => Promise<Capability>>(),
	callMethodMock: vi.fn(),
	gotoMock: vi.fn(),
	pageMock: { url: new URL("http://localhost/") },
	toastMock: { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
	platform: { isAndroidPlatform: vi.fn(() => true) },
	openExternalLink: vi.fn(),
}));

vi.mock("$app/navigation", () => ({ goto: gotoMock }));
vi.mock("$app/state", () => ({ page: pageMock }));
vi.mock("$lib/api/methods", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/methods")>()),
	callMethod: callMethodMock,
}));
vi.mock("svelte-sonner", () => ({ toast: toastMock }));
vi.mock("$lib/updates/index", async () => ({
	...(await import("$lib/updates/types")),
	...(await import("$lib/updates/components")),
	...fake.api,
	getUpdateCapability,
}));
vi.mock("$lib/updates/toasts", () => toasts);
vi.mock("$lib/platform/os", () => platform);
vi.mock("$lib/platform/link-opener", () => ({ openExternalLink }));

let testing: typeof import("@testing-library/svelte");

const releaseSigned: Capability = {
	state: "supported",
	detail: { payloadSuffix: "-android.apk", canInstallNow: true },
};

async function opened() {
	testing = await import("@testing-library/svelte");
	const { hydrateUpdateCapability } =
		await import("$lib/updates/capability.svelte");
	await hydrateUpdateCapability();
	const { default: GoogleSignInForm } =
		await import("./GoogleSignInForm.svelte");
	testing.render(GoogleSignInForm);
	await settled();
	return testing;
}

function button(name: string) {
	return testing.screen.getByRole("button", { name });
}

function expectBusy(name: string) {
	const busy = button(name);
	expect(busy).toHaveProperty("disabled", true);
	expect(busy.getAttribute("aria-busy")).toBe("true");
}

async function addonFlow() {
	return import("$lib/updates/addon.svelte");
}

function textOf(element: HTMLElement) {
	return element.textContent.replace(/\s+/g, " ").trim();
}

describe("GoogleSignInForm", () => {
	beforeAll(async () => {
		await import("@testing-library/svelte");
		await import("./GoogleSignInForm.svelte");
	}, 30_000);

	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		fake.reset();
		pageMock.url = new URL(SCREEN_URL);
		platform.isAndroidPlatform.mockReturnValue(true);
		api.checkForUpdate.mockResolvedValue(offer("install"));
		getUpdateCapability.mockResolvedValue(releaseSigned);
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		testing.cleanup();
		vi.restoreAllMocks();
	});

	it("offers to install the missing Google OAuth app", async () => {
		const { screen } = await opened();

		expect(api.getInstalledVersion).toHaveBeenCalledWith("google-oauth");
		expect(textOf(screen.getByText(/Download and install the/))).toBe(
			"Download and install the Open Grind Google OAuth app to sign in with Google",
		);
		const releasePage = screen.getByRole("link", {
			name: "Open Grind Google OAuth app",
		});
		expect(releasePage.textContent).toBe("Open Grind Google OAuth app");
		expect(releasePage).toHaveProperty("href", COMPANION_RELEASES);
		expect(button("Install")).toHaveProperty("disabled", false);
		expect(button("Install").getAttribute("aria-busy")).toBe("false");
		expect(screen.getByRole("link", { name: "Go back" })).toBeTruthy();
		expect(button("paste the OAuth token manually")).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
		expect(screen.queryByLabelText("Token")).toBeNull();
	});

	it("installs through the toast and then offers to continue", async () => {
		const { screen, fireEvent } = await opened();

		await fireEvent.click(button("Install"));
		await settled();

		expect(api.startUpdateDownload).toHaveBeenCalledWith("google-oauth");
		expect(toasts.showStage).toHaveBeenLastCalledWith(
			expect.objectContaining({
				view: expect.objectContaining({ stage: "downloading" }),
			}),
		);
		expectBusy("Downloading…");
		expect(screen.queryByRole("progressbar")).toBeNull();

		emitProgress(progressOf("google-oauth", { phase: "verifying" }));
		await settled();
		expectBusy("Verifying…");

		readiness["google-oauth"] = ready("install");
		emitProgress(
			progressOf("google-oauth", { phase: "ready", received: 100 }),
		);
		await settled();
		expectBusy("Installing…");

		api.getInstalledVersion.mockResolvedValue("1.2.0");
		emitOutcome(outcomeOf("google-oauth"));
		await settled();

		expect(textOf(screen.getByText(/Continue in the/))).toBe(
			"Continue in the Open Grind Google OAuth app to sign in with Google",
		);
		expect(button("Continue")).toHaveProperty("disabled", false);
		expect(callMethodMock).not.toHaveBeenCalled();
	});

	it("still shows the download after leaving the screen and coming back", async () => {
		const { fireEvent } = await opened();

		await fireEvent.click(button("Install"));
		await settled();
		expectBusy("Downloading…");

		testing.cleanup();
		await opened();

		expectBusy("Downloading…");
	});

	it("offers the install again after a failed download", async () => {
		const { fireEvent } = await opened();

		await fireEvent.click(button("Install"));
		await settled();
		emitProgress(progressOf("google-oauth", { phase: "failed" }));
		await settled();

		expect(toasts.showProblem).toHaveBeenCalledOnce();
		expect(button("Install")).toHaveProperty("disabled", false);
	});

	it("lets a cancelled install be tapped again", async () => {
		readiness["google-oauth"] = ready("install");
		const { fireEvent } = await opened();

		await fireEvent.click(button("Install"));
		await settled();
		expectBusy("Installing…");

		emitOutcome(
			outcomeOf("google-oauth", { succeeded: false, canceled: true }),
		);
		await settled();
		expect(button("Install")).toHaveProperty("disabled", false);

		await fireEvent.click(button("Install"));
		await settled();
		expect(api.installUpdate).toHaveBeenCalledTimes(2);
	});

	it("continues in the Google OAuth app when it was installed meanwhile", async () => {
		callMethodMock.mockReturnValue(new Promise(() => {}));
		const { fireEvent } = await opened();
		api.getInstalledVersion.mockResolvedValue("1.1.0");

		await fireEvent.click(button("Install"));
		await settled();

		expect(callMethodMock).toHaveBeenCalledWith("sign_in_with_google");
		expect(api.checkForUpdate).not.toHaveBeenCalled();
		expectBusy("Continue");
	});

	it("follows a newer probe that answers before the one Install started", async () => {
		callMethodMock.mockReturnValue(new Promise(() => {}));
		const { fireEvent } = await opened();
		let answerInstallProbe: (version: string | null) => void = () => {};
		api.getInstalledVersion.mockReturnValueOnce(
			new Promise((resolve) => {
				answerInstallProbe = resolve;
			}),
		);
		api.getInstalledVersion.mockResolvedValue("1.1.0");

		await fireEvent.click(button("Install"));
		document.dispatchEvent(new Event("visibilitychange"));
		await settled();
		expect(button("Continue")).toBeTruthy();

		answerInstallProbe(null);
		await settled();

		expect(callMethodMock).toHaveBeenCalledWith("sign_in_with_google");
		expect(api.checkForUpdate).not.toHaveBeenCalled();
		expectBusy("Continue");
	});

	it("opens the release page where the app cannot install it", async () => {
		api.updatesAvailableHere.mockReturnValue(false);
		const { fireEvent } = await opened();

		await fireEvent.click(button("Install"));
		await settled();

		expect(openExternalLink).toHaveBeenCalledWith(COMPANION_RELEASES);
		expect(api.checkForUpdate).not.toHaveBeenCalled();
	});

	it("opens the release page on a device the Google OAuth app has no build for", async () => {
		readiness["google-oauth"] = {
			state: "unsupported",
			detail: {
				reason: "noReleaseArtifacts",
				detail: { target: "android-x86" },
			},
		};
		const { fireEvent } = await opened();

		await fireEvent.click(button("Install"));
		await settled();

		expect(openExternalLink).toHaveBeenCalledExactlyOnceWith(
			COMPANION_RELEASES,
		);
		expect(toasts.showProblem).not.toHaveBeenCalled();
		expect(api.checkForUpdate).not.toHaveBeenCalled();
		expect(api.startUpdateDownload).not.toHaveBeenCalled();
		expect(button("Install")).toHaveProperty("disabled", false);

		await fireEvent.click(button("Install"));
		await settled();

		expect(openExternalLink).toHaveBeenCalledTimes(2);
		expect(toasts.showProblem).not.toHaveBeenCalled();
	});

	it("still explains an install this device refuses for another reason", async () => {
		readiness["google-oauth"] = {
			state: "unsupported",
			detail: { reason: "foreignTarget" },
		};
		const { fireEvent } = await opened();

		await fireEvent.click(button("Install"));
		await settled();

		expect(toasts.showProblem).toHaveBeenCalledOnce();
		expect(openExternalLink).not.toHaveBeenCalled();
		expect(api.checkForUpdate).not.toHaveBeenCalled();
	});

	it("sends a build Open Grind didn't sign, such as a Google Play install, to the release page and the pasted token", async () => {
		getUpdateCapability.mockResolvedValue({
			state: "unsupported",
			detail: { reason: "foreignSigner" },
		});
		const { screen, fireEvent } = await opened();

		expect(
			screen.getByRole("link", { name: "Open Grind Google OAuth app" }),
		).toHaveProperty("href", COMPANION_RELEASES);
		await fireEvent.click(button("Install"));
		await settled();

		expect(openExternalLink).toHaveBeenCalledExactlyOnceWith(
			COMPANION_RELEASES,
		);
		expect(api.checkForUpdate).not.toHaveBeenCalled();
		expect(api.startUpdateDownload).not.toHaveBeenCalled();
		expect(button("Install")).toHaveProperty("disabled", false);

		await fireEvent.click(button("paste the OAuth token manually"));

		expect(screen.getByLabelText("Token")).toBeTruthy();
	});

	it("returns to the install when the Google OAuth app cannot be opened", async () => {
		api.getInstalledVersion.mockResolvedValue("1.1.0");
		const { fireEvent } = await opened();
		callMethodMock.mockRejectedValue({
			kind: "Auth",
			message: "companion-unavailable",
		});

		await fireEvent.click(button("Continue"));
		await settled();

		expect(toastMock.error).toHaveBeenCalledExactlyOnceWith(
			"Couldn't find the Open Grind Google OAuth app on your device. Install it first, or paste the OAuth token manually.",
		);
		expect(button("Install")).toBeTruthy();

		await fireEvent.click(button("Install"));
		await settled();

		expect(callMethodMock).toHaveBeenCalledOnce();
		expect(api.checkForUpdate).toHaveBeenCalledWith({
			trigger: "manual",
			component: "google-oauth",
		});
	});

	it("stays on Continue when the Google OAuth app is turned off", async () => {
		api.getInstalledVersion.mockResolvedValue("1.1.0");
		const { screen, fireEvent } = await opened();
		callMethodMock.mockRejectedValue({
			kind: "Auth",
			message: "companion-disabled",
		});

		await fireEvent.click(button("Continue"));
		await settled();

		expect(toastMock.error).toHaveBeenCalledExactlyOnceWith(
			"The Open Grind Google OAuth app is turned off. Turn it on in Android settings, then try again.",
		);
		expect(button("Continue")).toHaveProperty("disabled", false);
		expect(screen.queryByRole("button", { name: "Install" })).toBeNull();
		expect(screen.queryByLabelText("Token")).toBeNull();
		expect(api.checkForUpdate).not.toHaveBeenCalled();
	});

	it("tries the Google OAuth app again once the screen is shown again", async () => {
		api.getInstalledVersion.mockResolvedValue("1.1.0");
		const { fireEvent } = await opened();
		callMethodMock.mockRejectedValue({
			kind: "Auth",
			message: "companion-unavailable",
		});
		await fireEvent.click(button("Continue"));
		await settled();
		expect(button("Install")).toBeTruthy();

		document.dispatchEvent(new Event("visibilitychange"));
		await settled();

		expect(button("Continue")).toBeTruthy();
	});

	it("keeps both switches to the other flow outside the card", async () => {
		const { screen, fireEvent } = await opened();
		const toPaste = button("paste the OAuth token manually");
		expect(toPaste.closest('[data-slot="card"]')).toBeNull();

		await fireEvent.click(toPaste);

		const toCompanion = screen.getByRole("button", {
			name: "use the Open Grind Google OAuth app",
		});
		expect(toCompanion.closest('[data-slot="card"]')).toBeNull();
	});

	it("keeps the signing-in card while a handoff is being exchanged", async () => {
		const { googleHandoffState } =
			await import("$lib/api/google-handoff-state.svelte");
		googleHandoffState.phase = "signingIn";
		try {
			const { screen } = await opened();

			expect(screen.getByText("Signing you in")).toBeTruthy();
			expect(
				screen.queryByRole("button", { name: "Install" }),
			).toBeNull();
		} finally {
			googleHandoffState.phase = "idle";
		}
	});

	it("signs in with the pasted token, trimmed", async () => {
		callMethodMock.mockRejectedValue(new Error("refused"));
		const { screen, fireEvent } = await opened();
		await fireEvent.click(button("paste the OAuth token manually"));

		await fireEvent.input(screen.getByLabelText("Token"), {
			target: { value: "  pasted-token \n" },
		});
		await fireEvent.click(button("Sign in"));
		await settled();

		expect(callMethodMock).toHaveBeenCalledWith(
			"sign_in_with_google_token",
			{ token: "pasted-token" },
		);
	});

	it("leaves Install tappable while the install permission is pending", async () => {
		readiness["google-oauth"] = awaitingPermission("install");
		const { fireEvent } = await opened();

		await fireEvent.click(button("Install"));
		await settled();

		expect(api.openInstallPermissionSettings).toHaveBeenCalledOnce();
		expect(button("Install")).toHaveProperty("disabled", false);
	});

	it("falls back to the pasted token when the Google OAuth app is untrusted", async () => {
		api.getInstalledVersion.mockResolvedValue("1.1.0");
		const { screen, fireEvent } = await opened();
		const { untrustedCompanionMessage } = await import("$lib/api/sign-in");
		callMethodMock.mockRejectedValue({
			kind: "Auth",
			message: "companion-untrusted",
		});

		await fireEvent.click(button("Continue"));
		await settled();

		expect(toastMock.error).toHaveBeenCalledExactlyOnceWith(
			untrustedCompanionMessage,
		);
		expect(screen.getByLabelText("Token")).toBeTruthy();
	});

	it("falls back to the pasted token, not the install screen, when the Google OAuth app refuses this build", async () => {
		getUpdateCapability.mockResolvedValue({
			state: "unsupported",
			detail: { reason: "foreignSigner" },
		});
		api.getInstalledVersion.mockResolvedValue("1.1.0");
		const { screen, fireEvent } = await opened();
		const { refusedCompanionMessage } = await import("$lib/api/sign-in");
		callMethodMock.mockRejectedValue({
			kind: "Auth",
			message: "companion-refused",
		});

		await fireEvent.click(button("Continue"));
		await settled();

		expect(toastMock.error).toHaveBeenCalledExactlyOnceWith(
			refusedCompanionMessage,
		);
		expect(screen.getByLabelText("Token")).toBeTruthy();

		await fireEvent.click(button("use the Open Grind Google OAuth app"));

		expect(button("Continue")).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Install" })).toBeNull();
	});

	it("opens on the pasted token when the sign-in screen asks for it", async () => {
		pageMock.url = new URL(`${SCREEN_URL}?paste`);
		api.getInstalledVersion.mockResolvedValue("1.1.0");
		const { screen, fireEvent } = await opened();

		expect(screen.getByLabelText("Token")).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();

		await fireEvent.click(button("use the Open Grind Google OAuth app"));

		expect(button("Continue")).toBeTruthy();
	});

	it("notices an install made outside the app when the screen is shown again", async () => {
		await opened();
		api.getInstalledVersion.mockResolvedValue("1.1.0");
		const visibility = vi
			.spyOn(document, "visibilityState", "get")
			.mockReturnValue("hidden");

		document.dispatchEvent(new Event("visibilitychange"));
		await settled();
		expect(button("Install")).toBeTruthy();

		visibility.mockReturnValue("visible");
		document.dispatchEvent(new Event("visibilitychange"));
		await settled();

		expect(button("Continue")).toBeTruthy();
	});

	it("withdraws the Google OAuth app update offer once the app is found uninstalled", async () => {
		api.getInstalledVersion.mockResolvedValue("1.1.0");
		await opened();
		const { addonActivity, addonUpdates } = await addonFlow();
		api.checkForUpdate.mockResolvedValue(offer("update"));
		await addonUpdates.checkNow();
		expect(addonActivity.stage).toBe("available");

		api.getInstalledVersion.mockResolvedValue(null);
		document.dispatchEvent(new Event("visibilitychange"));
		await settled();

		expect(addonActivity.stage).toBeNull();
		expect(toasts.dismissStage).toHaveBeenCalledWith("google-oauth");
		expect(api.discardStagedUpdate).toHaveBeenCalledWith("google-oauth");
		expect(button("Install")).toBeTruthy();
	});

	it("withdraws a Google OAuth app update offer left from before the screen opened", async () => {
		const { addonActivity, addonUpdates } = await addonFlow();
		api.checkForUpdate.mockResolvedValue(offer("update"));
		await addonUpdates.checkNow();
		expect(addonActivity.stage).toBe("available");

		await opened();

		expect(addonActivity.stage).toBeNull();
		expect(api.discardStagedUpdate).toHaveBeenCalledWith("google-oauth");
	});

	it("withdraws a paused Google OAuth app update once the app is found uninstalled", async () => {
		const { addonActivity, addonUpdates } = await addonFlow();
		api.checkForUpdate.mockResolvedValue(offer("update"));
		await addonUpdates.checkNow();
		emitProgress(progressOf("google-oauth", { phase: "canceled" }));
		expect(addonActivity.stage).toBe("paused");

		await opened();

		expect(addonActivity.stage).toBeNull();
		expect(api.discardStagedUpdate).toHaveBeenCalledWith("google-oauth");
	});

	it("withdraws a downloaded Google OAuth app update once the app is found uninstalled", async () => {
		readiness["google-oauth"] = ready("update");
		const { addonActivity, addonUpdates } = await addonFlow();
		await addonUpdates.start();
		expect(addonActivity.stage).toBe("ready");

		await opened();

		expect(addonActivity.stage).toBeNull();
		expect(api.discardStagedUpdate).toHaveBeenCalledWith("google-oauth");
	});

	it("keeps a first install that resumed downloading after a reload", async () => {
		api.getUpdateProgress.mockResolvedValue(progressOf("google-oauth"));
		readiness["google-oauth"] = resumable("install");
		const { addonActivity, addonUpdates } = await addonFlow();
		await addonUpdates.start();
		expect(addonActivity.stage).toBe("downloading");

		await opened();
		document.dispatchEvent(new Event("visibilitychange"));
		await settled();

		expect(api.discardStagedUpdate).not.toHaveBeenCalled();
		expect(addonActivity.stage).toBe("downloading");
		expectBusy("Downloading…");
	});

	it("finishes withdrawing a stale update offer before Install looks for a download", async () => {
		const { fireEvent } = await opened();
		const { addonActivity, addonUpdates } = await addonFlow();
		api.checkForUpdate.mockResolvedValue(offer("update"));
		await addonUpdates.checkNow();
		expect(addonActivity.stage).toBe("available");
		let finishDiscard: () => void = () => {};
		api.discardStagedUpdate.mockReturnValueOnce(
			new Promise((resolve) => {
				finishDiscard = () => resolve(undefined);
			}),
		);
		api.checkForUpdate.mockClear().mockResolvedValue(offer("install"));
		api.getUpdateReadiness.mockClear();

		await fireEvent.click(button("Install"));
		await settled();

		expect(api.discardStagedUpdate).toHaveBeenCalledExactlyOnceWith(
			"google-oauth",
		);
		expect(api.getUpdateReadiness).not.toHaveBeenCalled();
		expect(api.checkForUpdate).not.toHaveBeenCalled();

		finishDiscard();
		await settled();

		expect(api.getUpdateReadiness).toHaveBeenCalledWith("google-oauth");
		expect(api.startUpdateDownload).toHaveBeenCalledWith("google-oauth");
		expectBusy("Downloading…");
	});

	it("keeps the Google OAuth app update offer while the app is still installed", async () => {
		api.getInstalledVersion.mockResolvedValue("1.1.0");
		await opened();
		const { addonActivity, addonUpdates } = await addonFlow();
		api.checkForUpdate.mockResolvedValue(offer("update"));
		await addonUpdates.checkNow();

		document.dispatchEvent(new Event("visibilitychange"));
		await settled();

		expect(addonActivity.stage).toBe("available");
		expect(api.discardStagedUpdate).not.toHaveBeenCalled();
	});

	it("keeps the Google OAuth app update offer when the probe fails", async () => {
		api.getInstalledVersion.mockResolvedValue("1.1.0");
		await opened();
		const { addonActivity, addonUpdates } = await addonFlow();
		api.checkForUpdate.mockResolvedValue(offer("update"));
		await addonUpdates.checkNow();

		api.getInstalledVersion.mockRejectedValue(new Error("plugin gone"));
		document.dispatchEvent(new Event("visibilitychange"));
		await settled();

		expect(addonActivity.stage).toBe("available");
		expect(api.discardStagedUpdate).not.toHaveBeenCalled();
		expect(button("Install")).toBeTruthy();
	});

	it("keeps the newest probe when an earlier one answers last", async () => {
		let answerFirstProbe: (version: string | null) => void = () => {};
		api.getInstalledVersion.mockReturnValueOnce(
			new Promise((resolve) => {
				answerFirstProbe = resolve;
			}),
		);
		api.getInstalledVersion.mockResolvedValue("1.1.0");
		await opened();

		document.dispatchEvent(new Event("visibilitychange"));
		await settled();
		expect(button("Continue")).toBeTruthy();

		answerFirstProbe(null);
		await settled();
		expect(button("Continue")).toBeTruthy();
	});

	it("switches between the Google OAuth app and the pasted token", async () => {
		const { screen, fireEvent } = await opened();

		await fireEvent.click(button("paste the OAuth token manually"));

		expect(screen.getByLabelText("Token")).toBeTruthy();
		expect(screen.getAllByRole("listitem").map(textOf)).toEqual([
			"Install the Open Grind Google OAuth app",
			"Sign in with Google in the Open Grind Google OAuth app and copy the token",
			'Return to this screen, paste it and tap "Sign in"',
		]);
		expect(screen.queryByRole("button", { name: /^Install/ })).toBeNull();

		await fireEvent.click(button("use the Open Grind Google OAuth app"));

		expect(screen.queryByLabelText("Token")).toBeNull();
		expect(button("Install")).toBeTruthy();
	});

	it("only offers the pasted token off Android", async () => {
		platform.isAndroidPlatform.mockReturnValue(false);
		const { screen } = await opened();

		expect(screen.getByLabelText("Token")).toBeTruthy();
		expect(
			screen.queryByRole("button", {
				name: "use the Open Grind Google OAuth app",
			}),
		).toBeNull();
		expect(api.getInstalledVersion).not.toHaveBeenCalled();
	});
});
