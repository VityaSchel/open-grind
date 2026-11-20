import { expect, type Locator, type Page, test } from "@playwright/test";

import { DEV_SERVER_URL } from "../playwright.config";
import { openAlbum, TWO_ROW_ALBUM } from "./support/albums";
import {
	animationsFinished,
	DEMO_CONVERSATION,
	FIRST_ROUTE_COMPILE_MS,
	installTauriShim,
	openGrid,
} from "./support/app";
import { answerDemoRequests } from "./support/demo-faults";
import {
	focusProblems,
	measureFocusedElement,
	tabThrough,
} from "./support/focus";
import { activeProfilePane } from "./support/profile-pager";
import { goToRightNow, RIGHT_NOW_FEED_TIMEOUT } from "./support/right-now";

const SAVE_BAR = '[data-slot="save-changes-bar"]';
const SUBPAGE_SCROLLER = '[data-slot="subpage-scroller"]';
const PROFILE_SCROLLER = '[data-slot="profile-scroller"]';
const DEMO_PROFILE = "/profile/100001";
const MAX_TAB_STOPS = 150;

test.use({ viewport: { width: 420, height: 700 }, hasTouch: false });
test.describe.configure({ timeout: 240_000 });

async function scrollPaddingBottom(scroller: Locator): Promise<number> {
	return scroller.evaluate(
		(node) =>
			Number.parseFloat(getComputedStyle(node).scrollPaddingBottom) || 0,
	);
}

async function snapportBottom(scroller: Locator): Promise<number> {
	const padding = await scrollPaddingBottom(scroller);
	return scroller.evaluate(
		(node, reserved) => node.getBoundingClientRect().bottom - reserved,
		padding,
	);
}

async function topOf(locator: Locator): Promise<number> {
	const box = await locator.boundingBox();
	if (!box) throw new Error("Nothing to measure");
	return box.y;
}

async function showSaveBar({
	page,
	edit,
}: {
	page: Page;
	edit: () => Promise<void>;
}): Promise<Locator> {
	await edit();
	const bar = page.locator(SAVE_BAR);
	await bar.waitFor();
	await animationsFinished(bar);
	return bar;
}

async function openProfileEditor(page: Page): Promise<Locator> {
	await installTauriShim(page, { platform: "macos" });
	await page.goto("/settings/profile");
	const displayName = page.getByRole("textbox", { name: "Display name" });
	await displayName.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	return displayName;
}

function focusedBehindSaveButton(saveBar: string): Promise<string | null> {
	return new Promise((resolve) =>
		requestAnimationFrame(() =>
			requestAnimationFrame(() => {
				const focused = document.activeElement;
				const save = document.querySelector(`${saveBar} button`);
				if (
					!(focused instanceof HTMLElement) ||
					save === null ||
					save.contains(focused) ||
					focused.contains(save)
				) {
					resolve(null);
					return;
				}
				const control = focused.getBoundingClientRect();
				const button = save.getBoundingClientRect();
				const overlaps =
					control.bottom > button.top + 0.5 &&
					control.top < button.bottom - 0.5 &&
					control.right > button.left + 0.5 &&
					control.left < button.right - 0.5;
				const name =
					focused.getAttribute("aria-label") ??
					focused.innerText.trim().slice(0, 40);
				resolve(
					overlaps
						? `${focused.tagName.toLowerCase()} "${name}"`
						: null,
				);
			}),
		),
	);
}

test.describe("with unsaved changes", () => {
	test("Tab never leaves an Edit Profile control behind the Save button", async ({
		page,
	}) => {
		const displayName = await openProfileEditor(page);
		await showSaveBar({
			page,
			edit: () => displayName.fill("Renamed in a test"),
		});
		const save = page.getByRole("button", { name: "Save changes" });

		const hidden: string[] = [];
		let reachedSave = false;
		for (let stop = 0; stop < MAX_TAB_STOPS && !reachedSave; stop++) {
			await page.keyboard.press("Tab");
			const covered = await page.evaluate(
				focusedBehindSaveButton,
				SAVE_BAR,
			);
			if (covered !== null) hidden.push(covered);
			reachedSave = await save.evaluate(
				(button) => button === document.activeElement,
			);
		}

		expect(reachedSave, "Tab reaches the Save button").toBe(true);
		expect(hidden).toEqual([]);
	});

	test("the Edit Profile scroller reserves the Save button only while it shows", async ({
		page,
	}) => {
		const displayName = await openProfileEditor(page);
		const scroller = page.locator(SUBPAGE_SCROLLER);
		const clean = await scrollPaddingBottom(scroller);

		const bar = await showSaveBar({
			page,
			edit: () => displayName.fill("Renamed in a test"),
		});
		const save = bar.getByRole("button", { name: "Save changes" });
		expect(await scrollPaddingBottom(scroller)).toBeGreaterThan(clean);
		expect(await snapportBottom(scroller)).toBeLessThanOrEqual(
			(await topOf(save)) + 0.5,
		);

		await page.evaluate(() =>
			document.documentElement.setAttribute(
				"data-keyboard-shrinks-page",
				"",
			),
		);
		expect(
			await scrollPaddingBottom(scroller),
			"the soft keyboard drops the reservation",
		).toBe(0);
	});

	test("the album editor scroller keeps revealed media above the Save button", async ({
		page,
	}) => {
		test.setTimeout(120_000);
		await openAlbum(page, { tile: TWO_ROW_ALBUM, platform: "macos" });
		const bar = await showSaveBar({
			page,
			edit: () =>
				page
					.getByRole("button", {
						name: /^Remove album photo in slot 1$/,
					})
					.click(),
		});
		const save = bar.getByRole("button", { name: "Save changes" });

		expect(
			await snapportBottom(page.locator(SUBPAGE_SCROLLER)),
		).toBeLessThanOrEqual((await topOf(save)) + 0.5);
	});
});

test("another member's profile keeps revealed controls above the Chat and Tap bar", async ({
	page,
}) => {
	await installTauriShim(page, { platform: "macos" });
	await page.goto(DEMO_PROFILE);
	const pane = activeProfilePane(page);
	const actions = pane.getByRole("navigation", { name: "Chat and Tap" });
	await actions.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });

	expect(
		await snapportBottom(pane.locator(PROFILE_SCROLLER)),
	).toBeLessThanOrEqual((await topOf(actions)) + 0.5);
});

test("each composer icon button anchors its focus circle to itself", async ({
	page,
}) => {
	await installTauriShim(page, { platform: "macos" });
	await page.goto(DEMO_CONVERSATION);
	await page
		.getByRole("button", { name: "Add attachment" })
		.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });

	const positions = await page
		.locator(".focus-ring-icon")
		.evaluateAll((buttons) =>
			buttons.map((button) => ({
				name: button.getAttribute("aria-label"),
				position: getComputedStyle(button).position,
			})),
		);

	expect(positions.length).toBeGreaterThanOrEqual(3);
	expect(positions.filter(({ position }) => position === "static")).toEqual(
		[],
	);
});

test.describe("the Right Now post dialog", () => {
	test.use({ viewport: { width: 1280, height: 800 } });

	test("keeps every focus ring inside its scrolling body", async ({
		page,
	}) => {
		await installTauriShim(page, { platform: "macos" });
		await goToRightNow(page);
		await page
			.getByRole("article")
			.first()
			.waitFor({ timeout: RIGHT_NOW_FEED_TIMEOUT });
		await page.getByRole("button", { name: "Join · 3 left" }).click();
		await page
			.getByRole("alertdialog", { name: "Join Right Now?" })
			.getByRole("button", { name: "Join now" })
			.click();
		const sheet = page.getByRole("dialog", { name: "Right Now" });
		await sheet.waitFor();
		await animationsFinished(sheet);
		await sheet.focus();

		const stops = await tabThrough(page, {
			stops: 16,
			fromCurrentFocus: true,
		});

		expect(
			stops.some(({ element }) => element.startsWith("textarea")),
			"Tab reaches the post text",
		).toBe(true);
		expect(
			stops.flatMap(({ element, clippedBy }) =>
				clippedBy
					.filter((clipper) => clipper.includes("dialog-body"))
					.map((clipper) => `${element}: clipped by ${clipper}`),
			),
		).toEqual([]);
	});
});

test.describe("the copy error dialog", () => {
	test.use({
		baseURL: DEV_SERVER_URL,
		viewport: { width: 1280, height: 800 },
	});

	test("shows the whole focus ring on its autofocused Copy button", async ({
		page,
	}) => {
		const places = await answerDemoRequests(page, {
			pathPrefix: "/v3/places/search?",
			status: 500,
			body: {},
		});
		await installTauriShim(page, { platform: "macos" });
		await openGrid(page);
		await places.start();
		await page.getByRole("button", { name: "Change location" }).click();
		const search = page.getByRole("combobox", { name: "Search places…" });
		await search.waitFor({ timeout: 180_000 });
		await search.fill("Paris");
		const copyError = page
			.getByRole("dialog")
			.getByRole("button", { name: "Copy error details" });
		await copyError.waitFor();
		await page.keyboard.press("Tab");
		await expect(copyError).toBeFocused();
		await page.keyboard.press("Enter");
		const confirm = page.getByRole("alertdialog", {
			name: "Copy error details?",
		});
		await confirm.waitFor();
		await animationsFinished(confirm);
		const copy = confirm.getByRole("button", { name: "Copy", exact: true });
		await expect(copy).toBeFocused();

		const measured = await page.evaluate(measureFocusedElement);
		expect(
			measured ? focusProblems([measured.stop]) : ["Copy: not focused"],
		).toEqual([]);
		const corners = await copy.evaluate((button) => {
			const style = getComputedStyle(button);
			return [
				style.borderBottomLeftRadius,
				style.borderBottomRightRadius,
			];
		});
		expect(corners).toEqual(["22px", "22px"]);
	});
});
