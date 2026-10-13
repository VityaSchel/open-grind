import type { Page } from "@playwright/test";

import type { Scene, SceneView } from ".";
import { visit } from "./visit";

const MENU = '[data-slot="dropdown-menu-content"]';

const LATER_MENUS = [
	{ id: "tribes", label: "My tribes" },
	{ id: "ethnicity", label: "Ethnicity" },
	{ id: "relationship-status", label: "Relationship status" },
	{ id: "looking-for", label: "Looking for" },
	{ id: "meet-at", label: "Meet at" },
	{ id: "nsfw-pics", label: "Accept NSFW pics" },
	{ id: "hiv-status", label: "HIV status" },
	{ id: "health-practices", label: "Sexual health practices" },
	{ id: "vaccines", label: "Vaccines" },
];

async function closeMenus(page: Page): Promise<void> {
	if ((await page.locator(MENU).count()) === 0) return;
	await page.keyboard.press("Escape");
	await page.locator(MENU).waitFor({ state: "detached" });
}

async function openFieldMenu({
	page,
	label,
}: {
	page: Page;
	label: string;
}): Promise<void> {
	await closeMenus(page);
	const trigger = page.getByRole("button", { name: label });
	await trigger.evaluate((element) => {
		element.scrollIntoView({ block: "center", behavior: "instant" });
	});
	await trigger.click();
	await page.locator(MENU).waitFor();
}

function openProfileForm(page: Page): Promise<void> {
	return visit({
		page,
		path: "/settings/profile",
		ready: page.getByRole("textbox", { name: "Display name" }),
	});
}

function fieldMenu({
	id,
	label,
	from,
}: {
	id: string;
	label: string;
	from?: (page: Page) => Promise<void>;
}): SceneView {
	return {
		id: `settings/profile/${id}`,
		scroller: MENU,
		drive: async (page) => {
			await from?.(page);
			await openFieldMenu({ page, label });
		},
	};
}

export const profileFieldMenus: Scene = {
	platform: "phone",
	views: [
		fieldMenu({
			id: "body-type",
			label: "Body type",
			from: openProfileForm,
		}),
		...LATER_MENUS.map(fieldMenu),
	],
};
