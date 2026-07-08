import { fileURLToPath } from "node:url";
import { defineConfig } from "vitepress";
import { grindrApiReference } from "../lib";

// https://vitepress.dev/reference/site-config
export default defineConfig({
	srcDir: "content",

	vite: {
		resolve: {
			alias: {
				$lib: fileURLToPath(new URL("../lib", import.meta.url)),
			},
		},
	},

	cleanUrls: true,

	rewrites: {
		"generated/:path*": ":path*",
	},

	title: "Open Grind",
	description: "Open Grind project documentation and Grindr API reference",
	head: [["link", { rel: "icon", href: "/logo.svg" }]],

	themeConfig: {
		// https://vitepress.dev/reference/default-theme-config

		logo: "/logo.svg",

		nav: [
			{ text: "Home", link: "/" },
			{ text: "Grindr API", link: "/grindr-api" },
		],

		search: {
			provider: "local",
		},

		sidebar: {
			"/guide/": [
				{
					text: "User guide",
					items: [
						{ text: "Download", link: "/guide/download" },
						{ text: "Sign in with Google", link: "/guide/sign-in-with-google" },
					],
				},
			],
			"/grindr-api/": [
				{
					text: "Grindr API",
					link: "/grindr-api/",
					items: grindrApiReference,
				},
			],
		},

		socialLinks: [
			{ icon: "git", link: "https://git.opengrind.org/open-grind/open-grind/" },
		],

		footer: {
			message: "Open Grind is not affiliated with Grindr in any way.",
			copyright:
				'Licensed under the <a href="https://opengrind.org/license">MIT</a> License.',
		},
	},
});
