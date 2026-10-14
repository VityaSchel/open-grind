import type { Page } from "@playwright/test";

import type { Scene, SceneView } from ".";
import { visit } from "./visit";

const MENU = '[data-slot="dropdown-menu-content"]';

const STATS = "settings/profile#3";
const EXPECTATIONS = "settings/profile/expectations";
const HEALTH = "settings/profile#4";

const LATER_MENUS = [
	{ id: "tribes", label: "My tribes", screen: STATS },
	{ id: "ethnicity", label: "Ethnicity", screen: STATS },
	{ id: "relationship-status", label: "Relationship status", screen: STATS },
	{ id: "looking-for", label: "Looking for", screen: EXPECTATIONS },
	{ id: "meet-at", label: "Meet at", screen: EXPECTATIONS },
	{ id: "nsfw-pics", label: "Accept NSFW pics", screen: EXPECTATIONS },
	{ id: "hiv-status", label: "HIV status", screen: EXPECTATIONS },
	{
		id: "health-practices",
		label: "Sexual health practices",
		screen: HEALTH,
	},
	{ id: "vaccines", label: "Vaccines", screen: HEALTH },
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
	screen,
	from,
}: {
	id: string;
	label: string;
	screen: string;
	from?: (page: Page) => Promise<void>;
}): SceneView {
	return {
		id: `settings/profile/${id}`,
		screen,
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
			screen: "settings/profile#2",
			from: openProfileForm,
		}),
		...LATER_MENUS.map(fieldMenu),
	],
};
