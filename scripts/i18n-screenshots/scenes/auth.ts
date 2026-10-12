import type { Scene } from ".";
import { visit } from "./visit";

export const signIn: Scene = {
	platform: "phone",
	demo: { signedOut: true },
	views: [
		{
			id: "auth/sign-in",
			drive: (page) =>
				visit({
					page,
					path: "/auth/sign-in",
					ready: page.locator("form button[type=submit]"),
				}),
		},
	],
};

export const onboarding: Scene = {
	platform: "phone",
	demo: { onboarding: true, updates: true },
	views: [
		{
			id: "onboarding",
			drive: (page) =>
				visit({
					page,
					path: "/onboarding",
					ready: page.getByRole("main").getByRole("button"),
				}),
		},
	],
};
