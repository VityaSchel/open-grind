import type { Scene } from ".";
import { visit } from "./visit";

export const appSettings: Scene = {
	platform: "phone",
	views: [
		{
			id: "settings/app",
			scroller: '[data-slot="subpage-scroller"]',
			drive: (page) =>
				visit({
					page,
					path: "/settings/app",
					ready: page.getByRole("main").getByRole("heading"),
				}),
		},
	],
};
