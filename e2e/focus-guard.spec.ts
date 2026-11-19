import { expect, type Page, test } from "@playwright/test";

import { focusProblems, measureFocusedElement } from "./support/focus";

const FIXTURE_STYLE = `
	body { margin: 0; padding: 40px; background: #000; color: #fff; }
	button {
		display: block;
		box-sizing: border-box;
		width: 100px;
		height: 40px;
		border: 0;
		padding: 0;
		background: #333;
		color: inherit;
	}
	button:focus { outline: 2px solid rgb(255 255 255 / 40%); outline-offset: -2px; }
	[data-slot="clip"] { overflow: hidden; width: fit-content; }
	.tile { position: relative; width: 120px; height: 120px; background: #fff; }
	.tile:focus { outline: none; isolation: isolate; }
	.tile:focus::after {
		content: "";
		position: absolute;
		inset: 0;
		outline: 2px solid rgb(255 255 255 / 40%);
		outline-offset: -2px;
	}
	.banded:focus::after { box-shadow: inset 0 0 0 4px #000; }
	[data-slot="pill"] {
		position: relative;
		width: 200px;
		height: 60px;
		overflow: hidden;
		background: #eee;
	}
	.icon { width: 32px; height: 44px; background: transparent; }
	.icon:focus { outline: none; }
	.icon:focus::after {
		content: "";
		position: absolute;
		top: 50%;
		left: var(--icon-center);
		width: 36px;
		height: 36px;
		margin-top: -18px;
		margin-left: -18px;
		border-radius: 9999px;
		outline: 2px solid rgb(0 0 0 / 60%);
	}
`;

async function focusProblemsOfButtonIn(
	page: Page,
	{ markup }: { markup: string },
): Promise<string[]> {
	await page.setContent(`<style>${FIXTURE_STYLE}</style>${markup}`);
	await page.getByRole("button").focus();
	const measured = await page.evaluate(measureFocusedElement);
	return focusProblems(measured ? [measured.stop] : []);
}

test.describe("the focus guard", () => {
	test("reports a square ring cut off by its container's rounded corners", async ({
		page,
	}) => {
		expect(
			await focusProblemsOfButtonIn(page, {
				markup: `<div data-slot="clip" style="border-radius: 16px 16px 0 0"><button>Save</button></div>`,
			}),
		).toEqual([
			'button "Save": focus indicator corner clipped by div clip "Save" (top-left, top-right)',
		]);
	});

	test("accepts a ring that follows its container's rounded corners", async ({
		page,
	}) => {
		expect(
			await focusProblemsOfButtonIn(page, {
				markup: `<div data-slot="clip" style="border-radius: 16px"><button style="border-radius: 16px">Save</button></div>`,
			}),
		).toEqual([]);
	});

	test("reports every corner of a square button inside a pill", async ({
		page,
	}) => {
		expect(
			await focusProblemsOfButtonIn(page, {
				markup: `<div data-slot="clip" style="border-radius: 9999px"><button>Save</button></div>`,
			}),
		).toEqual([
			'button "Save": focus indicator corner clipped by div clip "Save" (top-left, top-right, bottom-right, bottom-left)',
		]);
	});

	test("accepts a button that padding keeps off its container's rounded corners", async ({
		page,
	}) => {
		expect(
			await focusProblemsOfButtonIn(page, {
				markup: `<div data-slot="clip" style="border-radius: 16px; padding: 8px"><button>Save</button></div>`,
			}),
		).toEqual([]);
	});

	test("measures a bordered container's corners at its inner radius", async ({
		page,
	}) => {
		const bordered = "border: 6px solid #444; border-radius: 12px";
		expect(
			await focusProblemsOfButtonIn(page, {
				markup: `<div data-slot="clip" style="${bordered}"><button>Save</button></div>`,
			}),
		).toEqual([
			'button "Save": focus indicator corner clipped by div clip "Save" (top-left, top-right, bottom-right, bottom-left)',
		]);
		expect(
			await focusProblemsOfButtonIn(page, {
				markup: `<div data-slot="clip" style="${bordered}"><button style="border-radius: 6px">Save</button></div>`,
			}),
			"a ring rounded to the inner radius fits",
		).toEqual([]);
	});

	test("reports an outset ring around a square button cut by a slightly rounded corner", async ({
		page,
	}) => {
		expect(
			await focusProblemsOfButtonIn(page, {
				markup: `<div data-slot="clip" style="border-radius: 4px; padding: 2px"><button style="outline-offset: 0">Save</button></div>`,
			}),
		).toEqual([
			'button "Save": focus indicator corner clipped by div clip "Save" (top-left, top-right, bottom-right, bottom-left)',
		]);
	});

	test("ignores a rounded container that an absolutely positioned button escapes", async ({
		page,
	}) => {
		expect(
			await focusProblemsOfButtonIn(page, {
				markup: `<div data-slot="clip" style="border-radius: 16px; width: 100px; height: 40px"><button style="position: absolute; top: 40px; left: 40px">Save</button></div>`,
			}),
		).toEqual([]);
	});

	test("measures an overlay ring against its inset band", async ({
		page,
	}) => {
		expect(
			await focusProblemsOfButtonIn(page, {
				markup: `<button class="tile banded">Photo</button>`,
			}),
		).toEqual([]);
		expect(
			await focusProblemsOfButtonIn(page, {
				markup: `<button class="tile">Photo</button>`,
			}),
			"without the band the ring vanishes into the white tile",
		).toEqual(['button "Photo": focus indicator contrast 1:1']);
	});

	test("reports an icon ring drawn past its button and cut by a clipping ancestor", async ({
		page,
	}) => {
		expect(
			await focusProblemsOfButtonIn(page, {
				markup: `<div data-slot="pill"><div style="position: absolute; top: 8px; left: 8px; width: 32px; height: 44px"><button class="icon" aria-label="Record" style="--icon-center: 2px"></button></div></div>`,
			}),
		).toEqual([
			'button "Record": focus indicator clipped by div pill (left)',
		]);
	});

	test("accepts an icon ring that stays inside its clipping ancestor", async ({
		page,
	}) => {
		expect(
			await focusProblemsOfButtonIn(page, {
				markup: `<div data-slot="pill"><button class="icon" aria-label="Record" style="position: absolute; top: 8px; left: 84px; --icon-center: 16px"></button></div>`,
			}),
		).toEqual([]);
	});
});
