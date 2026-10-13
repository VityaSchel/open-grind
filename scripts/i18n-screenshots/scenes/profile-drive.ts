import type { Locator, Page } from "@playwright/test";

import { ACTIVE_PANE } from "../../../e2e/support/profile-pager";
import { addingToast } from "./toast";
import { visit } from "./visit";

export const FAVORITE_ID = 100001;
export const OTHER_ID = 100002;
export const BLOCKED_BY_US_ID = 100801;
export function profilePath(profileId: number): string {
	return `/profile/${profileId}`;
}

export function inActivePane({
	page,
	name,
	role = "button",
}: {
	page: Page;
	name: string;
	role?: "button" | "switch";
}): Locator {
	return page.locator(ACTIVE_PANE).getByRole(role, { name });
}

export function openProfile({
	page,
	profileId,
	ready = inActivePane({ page, name: "Profile menu" }),
}: {
	page: Page;
	profileId: number;
	ready?: Locator;
}): Promise<void> {
	return visit({ page, path: profilePath(profileId), ready });
}

export async function chooseProfileAction({
	page,
	action,
}: {
	page: Page;
	action: string;
}): Promise<void> {
	await inActivePane({ page, name: "Profile menu" }).click();
	await page.getByRole("menuitem", { name: action }).click();
}

export function profileActionToast({
	page,
	action,
}: {
	page: Page;
	action: string;
}): Promise<void> {
	return addingToast({
		page,
		action: () => chooseProfileAction({ page, action }),
	});
}
