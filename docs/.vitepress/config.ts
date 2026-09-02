import { fileURLToPath } from "node:url";
import { defineConfig } from "vitepress";

import { icons } from "./icons";

import { loadContext } from "../scripts/generator/context";
import type { StaticSidebarPages } from "../scripts/generator/sidebar";
import { buildSidebar } from "../scripts/generator/sidebar";

const staticPages: StaticSidebarPages = {
	before: [
		{ text: "Getting started", link: "/grindr-api/getting-started" },
		{ text: "Security headers", link: "/grindr-api/security-headers" },
		{ text: "API Authorization", link: "/grindr-api/api-authorization" },
	],
	after: [
		{ text: "Rate limits", link: "/grindr-api/rate-limits" },
		{
			text: "WebSocket",
			link: "/grindr-api/websocket/",
			collapsed: true,
			items: [
				{ text: "Events", link: "/grindr-api/websocket/events" },
				{
					text: "Notification Event",
					link: "/grindr-api/websocket/notification-event",
				},
				{ text: "Commands", link: "/grindr-api/websocket/commands" },
			],
		},
		{ text: "Appendix", link: "/grindr-api/appendix" },
		{ text: "Shared types", link: "/grindr-api/shared-types" },
	],
};

const grindrApiReference = buildSidebar(
	loadContext(fileURLToPath(new URL("../lib/openapi.json", import.meta.url))),
	staticPages,
);

// https://vitepress.dev/reference/site-config
export default defineConfig({
	srcDir: "content",

	cleanUrls: true,

	rewrites: {
		"generated/:path*": ":path*",
	},

	title: "Open Grind",
	description: "Open Grind project documentation and Grindr API reference",
	head: [
		["link", { rel: "icon", type: "image/png", href: "/favicon-96x96.png", sizes: "96x96" }],
		["link", { rel: "icon", type: "image/svg+xml", href: "/logo.svg" }],
		["link", { rel: "shortcut icon", href: "/favicon.ico" }],
		["link", { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" }],
	],

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
			"/guides/": [
				{
					text: "User guides",
					items: [
						{ text: "Download", link: "/guides/download" },
						{
							text: "Sign in with Google",
							link: "/guides/sign-in-with-google",
						},
						{ text: "FAQ", link: "/guides/faq" },
					],
				},
				{
					text: "Features",
					items: [
						{
							text: "Unlimited profiles",
							link: "/guides/features/unlimited-profiles",
						},
						{ text: "No ads", link: "/guides/features/no-ads" },
						{ text: "Privacy", link: "/guides/features/privacy" },
						{
							text: "Location spoofing",
							link: "/guides/features/location-spoofing-teleport",
						},
						{
							text: "Command Center",
							link: "/guides/features/command-center/",
							collapsed: true,
							items: [
								{
									text: "Open profile by ID",
									link: "/guides/features/command-center/open-profile-by-id/",
								},
								{
									text: "Quick filters preset",
									link: "/guides/features/command-center/quick-filters-preset/",
								},
								{
									text: "Quick go to",
									link: "/guides/features/command-center/quick-go-to/",
								},
								{
									text: "Quick warp",
									link: "/guides/features/command-center/quick-warp/",
								},
							],
						},
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

	vite: {
		plugins: [icons()],
		esbuild: { legalComments: "inline" },
	},
});
