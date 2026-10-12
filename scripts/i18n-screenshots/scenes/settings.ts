import type { Scene } from ".";
import { visit } from "./visit";

export const appSettings: Scene = {
	id: "settings/app",
	platform: "phone",
	open: (page) =>
		visit({
			page,
			path: "/settings/app",
			ready: page.getByRole("main").getByRole("heading"),
		}),
};
