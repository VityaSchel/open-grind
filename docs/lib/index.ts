import type { DefaultTheme } from "vitepress";

export const grindrApiReferenceMessaging: DefaultTheme.SidebarItem[] = [
	{ text: "Conversations", link: "/grindr-api/messaging/conversations" },
	{ text: "Saved phrases", link: "/grindr-api/messaging/saved-phrases" },
	{ text: "Messages", link: "/grindr-api/messaging/messages" },
	{ text: "Drawer, WIP", link: "/grindr-api/messaging/drawer" },
	{ text: "GIFs, WIP", link: "/grindr-api/messaging/gifs" },
	{ text: "Albums", link: "/grindr-api/messaging/albums" },
	{ text: "Misc", link: "/grindr-api/messaging/misc" },
];

export const grindrApiReferenceUsers: DefaultTheme.SidebarItem[] = [
	{ text: "Profiles", link: "/grindr-api/users/profiles" },
	{ text: "Favorites", link: "/grindr-api/users/favorites" },
];

export const grindrApiReferenceBrowse: DefaultTheme.SidebarItem[] = [
	{ text: "Location", link: "/grindr-api/browse/location" },
	{ text: "Grid", link: "/grindr-api/browse/grid" },
	{ text: "Social events", link: "/grindr-api/browse/social-events" },
	{ text: "Entitlements", link: "/grindr-api/browse/entitlements" },
	{ text: "Links, WIP", link: "/grindr-api/browse/links" },
	{ text: "Travels", link: "/grindr-api/browse/travels" },
	{ text: "Roam, WIP", link: "/grindr-api/browse/roam" },
	{
		text: "Age verification, WIP",
		link: "/grindr-api/browse/age-verification",
	},
	{ text: "Blocks", link: "/grindr-api/browse/blocks" },
	{ text: "Hides", link: "/grindr-api/browse/hides" },
	{ text: "Discover, WIP", link: "/grindr-api/browse/discover" },
];

export const grindrApiReferenceInterest: DefaultTheme.SidebarItem[] = [
	{ text: "Views", link: "/grindr-api/interest/views" },
	{ text: "Taps", link: "/grindr-api/interest/taps" },
	{ text: "Alist, WIP", link: "/grindr-api/interest/alist" },
];

export const grindrApiReferenceMedia: DefaultTheme.SidebarItem[] = [
	{ text: "Public CDN files", link: "/grindr-api/media/public-cdn-files" },
	{ text: "Signed CDN files", link: "/grindr-api/media/signed-cdn-files" },
];

export const grindrApiReferenceSettings: DefaultTheme.SidebarItem[] = [
	{ text: "Account", link: "/grindr-api/settings/account" },
	{
		text: "SMS verification, WIP",
		link: "/grindr-api/settings/sms-verification",
	},
];

export const grindrApiReferenceThirdPartyIntegrations: DefaultTheme.SidebarItem[] =
	[
		{
			text: "Spotify, WIP",
			link: "/grindr-api/third-party-integrations/spotify",
		},
	];

export const grindrApiReferenceCommerce: DefaultTheme.SidebarItem[] = [
	{ text: "StoreApiRest, WIP", link: "/grindr-api/commerce/storeapirest" },
	{ text: "GrindrStore, WIP", link: "/grindr-api/commerce/grindrstore" },
	{ text: "Offers, WIP", link: "/grindr-api/commerce/offers" },
	{ text: "VIP, WIP", link: "/grindr-api/commerce/vip" },
	{ text: "Boosting, WIP", link: "/grindr-api/commerce/boosting" },
	{ text: "Top Picks, WIP", link: "/grindr-api/commerce/top-picks" },
	{ text: "Rewarded ads", link: "/grindr-api/commerce/rewarded-ads" },
	{ text: "Rewarded chats, WIP", link: "/grindr-api/commerce/rewarded-chats" },
];

export const grindrApiReferenceSafety: DefaultTheme.SidebarItem[] = [
	{ text: "Reports, WIP", link: "/grindr-api/safety/reports" },
	{ text: "Warnings, WIP", link: "/grindr-api/safety/warnings" },
	{
		text: "Legal agreements, WIP",
		link: "/grindr-api/safety/legal-agreements",
	},
	{ text: "Access requests, WIP", link: "/grindr-api/safety/access-requests" },
];

export const grindrApiReferenceSystem: DefaultTheme.SidebarItem[] = [
	{ text: "Bootstrap, WIP", link: "/grindr-api/system/bootstrap" },
	{ text: "Logging, WIP", link: "/grindr-api/system/logging" },
	{ text: "Modal, WIP", link: "/grindr-api/system/modal" },
	{ text: "Notifications", link: "/grindr-api/system/notifications" },
	{ text: "Reddot, WIP", link: "/grindr-api/system/reddot" },
	{ text: "Ratings", link: "/grindr-api/system/ratings" },
	{ text: "Heatmap, WIP", link: "/grindr-api/system/heatmap" },
	{ text: "Signal share", link: "/grindr-api/system/signal-share" },
];

export const grindrApiReferenceAnalytics: DefaultTheme.SidebarItem[] = [
	{ text: "Assignments", link: "/grindr-api/analytics/assignments" },
	{ text: "Trackers", link: "/grindr-api/analytics/trackers" },
];

export const grindrApiReferenceWoodwork: DefaultTheme.SidebarItem[] = [
	{
		text: "Random promotion images",
		link: "/grindr-api/woodwork/random-promotion-images",
	},
];

export const grindrApiReferenceWebSocket: DefaultTheme.SidebarItem[] = [
	{ text: "Events", link: "/grindr-api/websocket/events" },
	{
		text: "Notification Event",
		link: "/grindr-api/websocket/notification-event",
	},
	{ text: "Commands", link: "/grindr-api/websocket/commands" },
];

export const grindrApiReference: DefaultTheme.SidebarItem[] = [
	{ text: "Getting started", link: "/grindr-api/getting-started" },
	{ text: "Security headers", link: "/grindr-api/security-headers" },
	{ text: "API Authorization", link: "/grindr-api/api-authorization" },
	{ text: "Authentication", link: "/grindr-api/authentication" },
	{
		text: "Messaging",
		link: "/grindr-api/messaging/",
		collapsed: true,
		items: grindrApiReferenceMessaging,
	},
	{
		text: "Users",
		link: "/grindr-api/users/",
		collapsed: true,
		items: grindrApiReferenceUsers,
	},
	{
		text: "Browse",
		link: "/grindr-api/browse/",
		collapsed: true,
		items: grindrApiReferenceBrowse,
	},
	{ text: "Right Now, WIP", link: "/grindr-api/right-now" },
	{
		text: "Interest",
		link: "/grindr-api/interest/",
		collapsed: true,
		items: grindrApiReferenceInterest,
	},
	{
		text: "Media",
		link: "/grindr-api/media/",
		collapsed: true,
		items: grindrApiReferenceMedia,
	},
	{ text: "Videocalls, WIP", link: "/grindr-api/videocalls" },
	{
		text: "Settings",
		link: "/grindr-api/settings/",
		collapsed: true,
		items: grindrApiReferenceSettings,
	},
	{
		text: "Third party integrations, WIP",
		link: "/grindr-api/third-party-integrations/",
		collapsed: true,
		items: grindrApiReferenceThirdPartyIntegrations,
	},
	{
		text: "Commerce",
		link: "/grindr-api/commerce/",
		collapsed: true,
		items: grindrApiReferenceCommerce,
	},
	{
		text: "Safety",
		link: "/grindr-api/safety/",
		collapsed: true,
		items: grindrApiReferenceSafety,
	},
	{
		text: "System",
		link: "/grindr-api/system/",
		collapsed: true,
		items: grindrApiReferenceSystem,
	},
	{
		text: "Analytics",
		link: "/grindr-api/analytics/",
		collapsed: true,
		items: grindrApiReferenceAnalytics,
	},
	{
		text: "Woodwork",
		link: "/grindr-api/woodwork/",
		collapsed: true,
		items: grindrApiReferenceWoodwork,
	},
	{ text: "Rate limits", link: "/grindr-api/rate-limits" },
	{
		text: "WebSocket",
		link: "/grindr-api/websocket/",
		collapsed: true,
		items: grindrApiReferenceWebSocket,
	},
	{ text: "Appendix", link: "/grindr-api/appendix" },
	{ text: "Shared types", link: "/grindr-api/shared-types" },
];
