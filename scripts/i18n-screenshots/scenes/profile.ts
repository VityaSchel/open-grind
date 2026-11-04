import { ACTIVE_PANE } from "../../../e2e/support/profile-pager";
import type { Scene } from ".";
import { press } from "./press";
import { visit } from "./visit";

const FEATURED_PROFILE = "/profile/100001";

export const profile: Scene = {
	platform: "phone",
	views: [
		{
			id: "profile",
			scroller: '[data-slot="profile-scroller"]',
			drive: (page) =>
				visit({
					page,
					path: FEATURED_PROFILE,
					ready: page
						.locator(ACTIVE_PANE)
						.getByRole("button", { name: "Profile menu" }),
				}),
		},
		{
			id: "profile/menu",
			screen: "profile",
			drive: async (page) => {
				await press(
					page
						.locator(ACTIVE_PANE)
						.getByRole("button", { name: "Profile menu" }),
				);
				await page.getByRole("menu").waitFor();
			},
		},
		{
			id: "profile/report",
			screen: "profile",
			drive: async (page) => {
				await press(
					page.getByRole("menuitem", { name: "Report user" }),
				);
				await page.getByRole("dialog").waitFor();
			},
		},
	],
};
