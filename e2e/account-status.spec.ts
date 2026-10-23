import { expect, type Page, test } from "@playwright/test";

import {
	captureOpenedUrls,
	emitTauriEvent,
	installEventInjection,
	installTauriShim,
	openGrid,
} from "./support/app";
import { answerDemoRequests } from "./support/demo-faults";
import { restingToast, UPDATE_TOASTS_MODULE_URL } from "./support/toast";

const TRANSPORT_MODULE_URL = "/src/lib/api/transport.ts";

function clickBackground(page: Page) {
	return page.mouse.click(10, 400);
}

test("ban events explain a blocked network and when a suspension ends", async ({
	page,
}) => {
	test.setTimeout(120_000);
	await installTauriShim(page);
	await installEventInjection(page);
	await openGrid(page);
	const openedUrls = await captureOpenedUrls(page);
	const dialog = page.getByRole("alertdialog");

	await emitTauriEvent(page, {
		event: "auth:banned",
		payload: { kind: "network", code: 31, message: "IP is banned" },
	});
	await expect(dialog).toContainText(
		"This network was blocked by Grindr. Switch it or turn off your VPN, then sign in again.",
	);
	await dialog.getByRole("button", { name: "OK" }).click();
	await expect(dialog).toBeHidden();

	await emitTauriEvent(page, {
		event: "auth:restriction",
		payload: {
			kind: "timedBan",
			reason: "Drug Selling",
			subReason: "DRUG_SALES",
			endsAt: Date.now() + 3 * 24 * 60 * 60 * 1000,
		},
	});
	await expect(dialog).toContainText(
		"Grindr suspended this account (Drug sale and distribution) until",
	);
	await dialog.getByRole("link", { name: "Appeal" }).click();
	await expect
		.poll(openedUrls)
		.toEqual(["https://web.grindr.com/ban-appeal"]);

	await page.keyboard.press("Escape");
	expect(await dialog.getAttribute("data-state"), "Escape").toBe("open");
	await clickBackground(page);
	expect(await dialog.getAttribute("data-state"), "a background click").toBe(
		"open",
	);
});

test("Grindr refusing the app version asks once to update, and the update toast works over it", async ({
	page,
}) => {
	test.setTimeout(120_000);
	await installTauriShim(page);
	const cascade = await answerDemoRequests(page, {
		pathPrefix: "/v4/cascade",
		status: 412,
		body: { code: 8, message: "The client version is deprecated" },
	});
	await openGrid(page);
	const openedUrls = await captureOpenedUrls(page);
	const onlineFilter = page.getByRole("button", {
		name: "Online",
		exact: true,
	});
	const dialog = page.getByRole("alertdialog");

	await cascade.start();
	await onlineFilter.click();
	await expect(
		dialog.getByRole("heading", { name: "Update Open Grind" }),
	).toBeVisible();

	await page.evaluate(async (module) => {
		const { fetchRest } = await import(module);
		await Promise.all(
			[1, 2, 3].map((page) =>
				fetchRest(`/v4/cascade?pageNumber=${page}`),
			),
		);
	}, TRANSPORT_MODULE_URL);
	expect(await cascade.hits()).toBeGreaterThanOrEqual(4);
	expect(
		await page.getByRole("alertdialog").count(),
		"more refusals don't stack popups",
	).toBe(1);

	await dialog.getByRole("link", { name: "Check for updates" }).click();
	await expect
		.poll(openedUrls)
		.toEqual(["https://opengrind.org/guides/download"]);

	let activations = 0;
	await page.exposeFunction("recordActivation", () => (activations += 1));
	await page.evaluate(async (module) => {
		const { showStage } = await import(module);
		const record = (window as unknown as { recordActivation: () => void })
			.recordActivation;
		showStage({
			view: { stage: "available", received: 0, total: 0 },
			kind: "update",
			onActivate: record,
			onCancel: () => {},
			onDismiss: () => {},
		});
	}, UPDATE_TOASTS_MODULE_URL);
	const updateToast = await restingToast({
		page,
		label: "New update available",
	});
	await updateToast.tap();
	await expect.poll(() => activations).toBe(1);
	await expect(
		dialog,
		"the update toast doesn't close the popup",
	).toBeVisible();

	await clickBackground(page);
	await expect(dialog).toBeHidden();
	const answered = await cascade.hits();
	await onlineFilter.click();
	await expect
		.poll(cascade.hits, { message: "the grid asks again" })
		.toBeGreaterThan(answered);
	expect(
		await page.getByRole("alertdialog").count(),
		"a dismissed update popup stays closed",
	).toBe(0);
});
