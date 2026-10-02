import { expect, type Page, test } from "@playwright/test";

import { FIRST_ROUTE_COMPILE_MS, installTauriShim } from "./support/app";
import { type Box, expectSameBox } from "./support/box";
import { STACK_PANE } from "./support/page-stack";

type Row = { box: Box; parts: Box[] };

type EditorLayout = {
	root: Box;
	photos: Box;
	sections: { box: Box; rows: Row[] }[];
};

type EditorSelectors = { root: string; photos: string };

declare global {
	interface Window {
		__measureProfileEditor?: (
			selectors: EditorSelectors,
		) => EditorLayout | undefined;
		__profileSkeleton?: EditorLayout;
	}
}

const SKELETON: EditorSelectors = {
	root: '[data-slot="profile-form-skeleton"]',
	photos: '[data-slot="profile-form-skeleton-photos"]',
};
const FORM: EditorSelectors = {
	root: '[data-slot="profile-form"]',
	photos: '[data-slot="media-slot-grid"]',
};
const SECTION = '[data-slot="profile-form-section"]';

const VIEWPORTS = [
	{ width: 360, height: 800 },
	{ width: 1280, height: 800 },
];

async function recordLoadingSkeleton(page: Page): Promise<void> {
	await page.addInitScript(
		({ skeleton, section, pane }) => {
			window.__measureProfileEditor = ({ root, photos }) => {
				const editor = document.querySelector(root);
				const grid = editor?.querySelector(photos);
				if (!editor || !grid) return undefined;
				const origin = editor.closest(pane)?.getBoundingClientRect();
				const boxOf = (element: Element): Box => {
					const { x, y, width, height } =
						element.getBoundingClientRect();
					return {
						x: x - (origin?.x ?? 0),
						y: y - (origin?.y ?? 0),
						width,
						height,
					};
				};
				return {
					root: boxOf(editor),
					photos: boxOf(grid),
					sections: [...editor.querySelectorAll(section)].map(
						(element) => ({
							box: boxOf(element),
							rows: [...element.children].map((row) => ({
								box: boxOf(row),
								parts: [...row.children].map(boxOf),
							})),
						}),
					),
				};
			};
			new MutationObserver(() => {
				window.__profileSkeleton ??=
					window.__measureProfileEditor?.(skeleton);
			}).observe(document, { childList: true, subtree: true });
		},
		{ skeleton: SKELETON, section: SECTION, pane: STACK_PANE },
	);
}

function expectSameRows({
	actual,
	expected,
	label,
}: {
	actual: Box[];
	expected: Box[];
	label: string;
}): void {
	expect(actual, `${label} count`).toHaveLength(expected.length);
	for (const [index, box] of expected.entries()) {
		const drawn = actual[index];
		if (drawn === undefined) continue;
		expectSameBox({
			actual: drawn,
			expected: box,
			label: `${label} ${index}`,
			edges: ["y", "height"],
		});
	}
}

for (const viewport of VIEWPORTS) {
	test.describe(`profile editor at ${viewport.width}px`, () => {
		test.use({ viewport });

		test("the loading skeleton lays out every section, row and control where the form puts them", async ({
			page,
		}) => {
			await recordLoadingSkeleton(page);
			await installTauriShim(page);
			await page.goto("/settings/profile");
			await page
				.getByRole("textbox", { name: "Display name" })
				.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });

			const skeleton = await page.evaluate(
				() => window.__profileSkeleton,
			);
			const form = await page.evaluate(
				(selectors) => window.__measureProfileEditor?.(selectors),
				FORM,
			);
			expect(skeleton, "the loading skeleton rendered").toBeDefined();
			expect(form, "the form rendered").toBeDefined();
			if (skeleton === undefined || form === undefined) return;

			expectSameBox({
				actual: skeleton.root,
				expected: form.root,
				label: "editor",
			});
			expectSameBox({
				actual: skeleton.photos,
				expected: form.photos,
				label: "photo grid",
			});

			expect(form.sections.length).toBeGreaterThan(1);
			expect(skeleton.sections).toHaveLength(form.sections.length);
			for (const [index, section] of form.sections.entries()) {
				const drawn = skeleton.sections[index];
				if (drawn === undefined) continue;
				expectSameBox({
					actual: drawn.box,
					expected: section.box,
					label: `section ${index}`,
				});
				expectSameRows({
					actual: drawn.rows.map((row) => row.box),
					expected: section.rows.map((row) => row.box),
					label: `section ${index} row`,
				});
				for (const [row, { parts }] of section.rows.entries()) {
					expectSameRows({
						actual: drawn.rows[row]?.parts ?? [],
						expected: parts,
						label: `section ${index} row ${row} part`,
					});
				}
			}
		});
	});
}
