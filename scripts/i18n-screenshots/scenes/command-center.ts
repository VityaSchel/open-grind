import type { Scene } from ".";
import { visit } from "./visit";

export const commandCenter: Scene = {
	platform: "desktop",
	views: [
		{
			id: "command-center",
			drive: async (page) => {
				await visit({
					page,
					path: "/",
					ready: page.locator('[data-slot="empty-title"]'),
				});
				await page.keyboard.press("ControlOrMeta+k");
				await page.getByRole("combobox").waitFor();
			},
		},
	],
};
