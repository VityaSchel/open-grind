import type { Scene } from ".";
import { visit } from "./visit";

export const emptyTaps: Scene = {
	platform: "phone",
	demo: { emptyLists: ["taps"] },
	views: [
		{
			id: "interest/taps/empty",
			drive: (page) =>
				visit({
					page,
					path: "/interest/taps",
					ready: page.locator('[data-slot="empty-title"]'),
				}),
		},
	],
};
