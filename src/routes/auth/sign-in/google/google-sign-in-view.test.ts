import { afterEach, describe, expect, it } from "vitest";

import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import type { UpdateStage } from "$lib/updates/stage";
import {
	googleSignInView,
	installButton,
	stageAwaitsUser,
} from "./google-sign-in-view";

describe("the Google sign-in view", () => {
	it("offers the install while the Google OAuth app is missing", () => {
		expect(
			googleSignInView({
				automated: true,
				pasting: false,
				installed: false,
			}),
		).toBe("install");
	});

	it("offers to continue once the Google OAuth app is installed", () => {
		expect(
			googleSignInView({
				automated: true,
				pasting: false,
				installed: true,
			}),
		).toBe("continue");
	});

	it("shows the token form when asked to paste", () => {
		for (const installed of [false, true]) {
			expect(
				googleSignInView({ automated: true, pasting: true, installed }),
			).toBe("paste");
		}
	});

	it("only has the token form where the companion flow is unavailable", () => {
		for (const installed of [false, true]) {
			expect(
				googleSignInView({
					automated: false,
					pasting: false,
					installed,
				}),
			).toBe("paste");
		}
	});
});

describe("an add-on stage the screen may withdraw", () => {
	it("is one that waits for the user to tap it", () => {
		for (const stage of ["available", "paused", "ready"] as const) {
			expect(stageAwaitsUser(stage)).toBe(true);
		}
	});

	it("is never a download or install that is still running", () => {
		for (const stage of [
			null,
			"downloading",
			"verifying",
			"installing",
		] as const) {
			expect(stageAwaitsUser(stage)).toBe(false);
		}
	});
});

describe("the Install button", () => {
	afterEach(async () => {
		await setLocale({ locale: SOURCE_LOCALE });
	});

	it("says what the add-on flow is doing while it downloads, verifies or installs", () => {
		const during = (stage: UpdateStage) =>
			installButton({ stage, starting: false });

		expect(during("downloading")).toEqual({
			label: "Downloading…",
			busy: true,
		});
		expect(during("verifying")).toEqual({
			label: "Verifying…",
			busy: true,
		});
		expect(during("installing")).toEqual({
			label: "Installing…",
			busy: true,
		});
	});

	it("stays tappable in every other stage so a verified download resumes", () => {
		for (const stage of [null, "available", "paused", "ready"] as const) {
			expect(installButton({ stage, starting: false })).toEqual({
				label: "Install",
				busy: false,
			});
		}
	});

	it("holds a second tap while the first one is still starting", () => {
		expect(installButton({ stage: null, starting: true })).toEqual({
			label: "Install",
			busy: true,
		});
	});

	it("labels every stage in the active locale", async () => {
		await setLocale({ locale: "en-XA" });

		for (const stage of [
			null,
			"downloading",
			"verifying",
			"installing",
		] as const) {
			expect(installButton({ stage, starting: false }).label).toMatch(
				PSEUDO_MESSAGE,
			);
		}
	});
});
