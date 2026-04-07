import { defineConfig } from "vitepress";

// https://vitepress.dev/reference/site-config
export default defineConfig({
	srcDir: "content",

	title: "Open Grind",
	description: "Open Grind project documentation and Grindr API reference",
	themeConfig: {
		// https://vitepress.dev/reference/default-theme-config
		nav: [
			{ text: "Home", link: "/" },
			{ text: "Grindr API", link: "/grindr-api" },
		],

		sidebar: [
			{
				text: "Reference",
				items: [
					{ text: "Download", link: "/download" },
					{
						text: "Grindr API",
						link: "/",
						base: "/grindr-api/",
						collapsed: true,
						items: [
							{ text: "Foo", link: "foo" },
							{ text: "Bar", link: "bar" },
						],
					},
				],
			},
		],

		socialLinks: [
			{ icon: "git", link: "https://git.hloth.dev/hloth/open-grind/" },
		],

		footer: {
			message: "Open Grind is not affiliated with Grindr in any way.",
			copyright:
				'Licensed under the <a href="https://git.hloth.dev/hloth/open-grind/src/branch/main/LICENSE">MIT</a> License.',
		},
	},
});
