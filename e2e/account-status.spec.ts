import { expect, type Page, test } from "@playwright/test";

import {
	captureOpenedUrls,
	installEventInjection,
	installTauriShim,
	openGrid,
} from "./support/app";
import { routeDemoThroughFaultHook } from "./support/demo-faults";

type CascadeFault = { answering: boolean; hits: number };
type FaultyWindow = Window & { __cascadeFault: CascadeFault };

async function answerCascadeWithVerificationRequired(page: Page) {
	await page.addInitScript(() => {
		const fault: CascadeFault = { answering: false, hits: 0 };
		Object.assign(window, {
			__cascadeFault: fault,
			__demoFault: ({ path }: { path: string }) => {
				if (!fault.answering || !path.startsWith("/v4/cascade"))
					return undefined;
				fault.hits += 1;
				return {
					status: 403,
					body: {
						code: 30,
						message: "Verification required",
						profileId: "123456000",
					},
				};
			},
		});
	});
	await routeDemoThroughFaultHook(page);
	return {
		start: () =>
			page.evaluate(() => {
				(window as unknown as FaultyWindow).__cascadeFault.answering =
					true;
			}),
		hits: () =>
			page.evaluate(
				() => (window as unknown as FaultyWindow).__cascadeFault.hits,
			),
	};
}

function emit(page: Page, event: string, payload: unknown) {
	return page.evaluate(
		([name, data]) => window.__emitTauriEvent?.(name, data),
		[event, payload] as const,
	);
}

test("Grindr asking for phone verification opens the popup once", async ({
	page,
}) => {
	test.setTimeout(120_000);
	await installTauriShim(page);
	const cascade = await answerCascadeWithVerificationRequired(page);
	await openGrid(page);
	const onlineFilter = page.getByRole("button", {
		name: "Online",
		exact: true,
	});

	await cascade.start();
	await onlineFilter.click();

	const dialog = page.getByRole("alertdialog");
	await expect(
		dialog.getByRole("heading", { name: "Phone verification required" }),
	).toBeVisible();
	await dialog.getByRole("button", { name: "OK" }).click();
	await expect(dialog).toBeHidden();

	const answered = await cascade.hits();
	await onlineFilter.click();
	await expect
		.poll(cascade.hits, { message: "the grid asks again" })
		.toBeGreaterThan(answered);
	expect(
		await page.getByRole("alertdialog").count(),
		"a dismissed verification popup stays closed",
	).toBe(0);
});

test("a timed ban says when it ends and links the appeal", async ({ page }) => {
	test.setTimeout(120_000);
	await installTauriShim(page);
	await installEventInjection(page);
	await openGrid(page);
	const openedUrls = await captureOpenedUrls(page);

	await emit(page, "auth:restriction", {
		kind: "timedBan",
		reason: "Drug Selling",
		subReason: "DRUG_SALES",
		endsAt: Date.now() + 3 * 24 * 60 * 60 * 1000,
	});

	const dialog = page.getByRole("alertdialog");
	await expect(dialog).toContainText(
		"Grindr suspended this account (Drug sale and distribution) until",
	);
	await dialog.getByRole("link", { name: "Appeal" }).click();
	await expect
		.poll(openedUrls)
		.toEqual(["https://web.grindr.com/ban-appeal"]);

	await page.keyboard.press("Escape");
	await expect(dialog, "a suspension can't be dismissed").toBeVisible();
});

test("a blocked network asks to switch networks", async ({ page }) => {
	test.setTimeout(120_000);
	await installTauriShim(page);
	await installEventInjection(page);
	await openGrid(page);

	await emit(page, "auth:banned", {
		kind: "network",
		code: 31,
		message: "IP is banned",
	});

	const dialog = page.getByRole("alertdialog");
	await expect(
		dialog.getByRole("heading", { name: "Network blocked" }),
	).toBeVisible();
	await expect(dialog).toContainText(
		"This network was blocked by Grindr. Switch it or turn off your VPN, then sign in again.",
	);
	await dialog.getByRole("button", { name: "OK" }).click();

	await expect(dialog).toBeHidden();
});
