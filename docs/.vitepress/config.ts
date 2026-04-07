import { defineConfig } from "vitepress";

// https://vitepress.dev/reference/site-config
export default defineConfig({
	srcDir: "content",

	title: "Open Grind Docs",
	description: "Open Grind project documentation and Grindr API reference",
	themeConfig: {
		// https://vitepress.dev/reference/default-theme-config
		nav: [
			{ text: "Home", link: "/" },
			{ text: "Examples", link: "/markdown-examples" },
		],

		sidebar: [
			{
				text: "Examples",
				items: [
					{ text: "Markdown Examples", link: "/markdown-examples" },
					{ text: "Runtime API Examples", link: "/api-examples" },
				],
			},
		],

		socialLinks: [
			{ icon: "git", link: "https://git.hloth.dev/hloth/open-grind/" },
		],
	},
});
