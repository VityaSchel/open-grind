import { ALBUM_TILE } from "../../../e2e/support/drawer";
import type { Scene } from ".";
import { visit } from "./visit";

const PHOTO_ONLY_ALBUM = `a${ALBUM_TILE}[href="/settings/albums/900"]`;
const MEDIA_SLOT = '[data-slot="media-slot"]';
const STACK_DIM = '[data-slot="page-stack-dim"]';

export const albums: Scene = {
	platform: "phone",
	views: [
		{
			id: "settings/albums",
			drive: (page) =>
				visit({
					page,
					path: "/settings/albums",
					ready: page.locator(ALBUM_TILE),
				}),
		},
		{
			id: "settings/albums/album",
			drive: async (page) => {
				await page.locator(PHOTO_ONLY_ALBUM).click();
				await page.locator(MEDIA_SLOT).first().waitFor();
				await page.locator(STACK_DIM).waitFor({ state: "detached" });
			},
		},
	],
};
