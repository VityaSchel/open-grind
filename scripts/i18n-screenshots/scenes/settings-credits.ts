import type { Locator, Page } from "@playwright/test";

import type { Scene, SceneView } from ".";
import { SUBPAGE_SCROLLER } from "./album-drive";
import { scrollToCenter } from "./drive";
import { failChunks } from "./faults";
import { visit } from "./visit";

const CREDITS_PATH = "/settings/app/credits";
const CREDITS_DATA_MARKER = "Permission is hereby granted";

function suggestEdit(page: Page): Locator {
	return page.getByRole("link", { name: "Suggest an edit" });
}

function openCredits(page: Page): Promise<void> {
	return visit({ page, path: CREDITS_PATH, ready: suggestEdit(page) });
}

function scrolledTo({
	id,
	target,
}: {
	id: string;
	target: (page: Page) => Locator;
}): SceneView {
	return { id, drive: (page) => scrollToCenter(target(page)) };
}

function heading({ page, name }: { page: Page; name: string }): Locator {
	return page.getByRole("heading", { name });
}

export const credits: Scene = {
	platform: "phone",
	views: [
		{
			id: "settings/credits",
			scroller: SUBPAGE_SCROLLER,
			drive: openCredits,
		},
		scrolledTo({
			id: "settings/credits/web-packages",
			target: (page) => heading({ page, name: "Web Packages" }),
		}),
		scrolledTo({
			id: "settings/credits/rust-crates",
			target: (page) => heading({ page, name: "Rust Crates" }),
		}),
		scrolledTo({
			id: "settings/credits/platform",
			target: (page) => heading({ page, name: "Android Libraries" }),
		}),
		scrolledTo({ id: "settings/credits/end", target: suggestEdit }),
	],
};

export const creditsLoadFailed: Scene = {
	platform: "phone",
	views: [
		{
			id: "settings/credits/load-failed",
			drive: async (page) => {
				await failChunks({ page, containing: CREDITS_DATA_MARKER });
				await visit({
					page,
					path: CREDITS_PATH,
					ready: page.getByText("load the credits"),
				});
			},
		},
	],
};
