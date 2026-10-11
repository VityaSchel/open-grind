// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import { setLocale, SOURCE_LOCALE, t } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import type { UpdateStage } from "./stage";
import UpdateToast from "./UpdateToast.svelte";

const READY_TITLE = "Open Grind FCM service update is downloaded";
const READY_HINT = "Tap to update";
const DOWNLOADING_TITLE = "Downloading the Open Grind FCM service update…";
const STOP_DOWNLOAD = "Stop the download";

function mountToast(stage: UpdateStage): void {
	render(UpdateToast, {
		props: {
			component: "fcm",
			kind: "update",
			stage,
			received: 1,
			total: 2,
			onActivate: vi.fn(),
			onCancel: vi.fn(),
		},
	});
}

async function switchToPseudoLocale(): Promise<void> {
	await setLocale({ locale: "en-XA" });
	await tick();
}

afterEach(async () => {
	cleanup();
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("the update stage toast", () => {
	it("shows the title and the hint of a downloaded add-on update", () => {
		mountToast("ready");

		expect(screen.getByText(READY_TITLE)).toBeTruthy();
		expect(screen.getByText(READY_HINT)).toBeTruthy();
	});

	it("names the button that stops the download", () => {
		mountToast("downloading");

		expect(screen.getByText(DOWNLOADING_TITLE)).toBeTruthy();
		expect(
			screen.getByRole("button", { name: STOP_DOWNLOAD }),
		).toBeTruthy();
	});
});

describe("the update stage toast after a language change while it shows", () => {
	it("rewords the title and the hint", async () => {
		mountToast("ready");

		await switchToPseudoLocale();

		const title = t("updates.addons.fcm.stage.update.ready");
		const hint = t("updates.stage.hints.update");
		expect(title).toMatch(PSEUDO_MESSAGE);
		expect(hint).toMatch(PSEUDO_MESSAGE);
		expect(screen.getByText(title)).toBeTruthy();
		expect(screen.getByText(hint)).toBeTruthy();
		expect(screen.queryByText(READY_TITLE)).toBeNull();
		expect(screen.queryByText(READY_HINT)).toBeNull();
	});

	it("renames the button that stops the download", async () => {
		mountToast("downloading");

		await switchToPseudoLocale();

		const title = t("updates.addons.fcm.stage.update.downloading");
		const stop = t("updates.toasts.a11y.stopDownload");
		expect(title).toMatch(PSEUDO_MESSAGE);
		expect(stop).toMatch(PSEUDO_MESSAGE);
		expect(screen.getByText(title)).toBeTruthy();
		expect(screen.getByRole("button", { name: stop })).toBeTruthy();
		expect(
			screen.queryByRole("button", { name: STOP_DOWNLOAD }),
		).toBeNull();
	});
});
