import type { DefaultTheme } from "vitepress";

import type { Context } from "./context";
import { SKIP_TAGS } from "./context";
import { tagTitle, tagUrl, withWipSuffix } from "./slugs";
import type { SidebarGroup } from "./types";

export interface StaticSidebarPages {
	before: DefaultTheme.SidebarItem[];
	after: DefaultTheme.SidebarItem[];
}

function tagItem(ctx: Context, tagName: string): DefaultTheme.SidebarItem {
	const tag = ctx.doc.tags.find((t) => t.name === tagName);
	return {
		text: withWipSuffix(tagTitle(tagName), tag?.["x-wip"] === true),
		link: tagUrl(tagName),
	};
}

function groupItem(
	ctx: Context,
	group: SidebarGroup,
): DefaultTheme.SidebarItem {
	const items = group.items
		.filter((tag) => !SKIP_TAGS.has(tag))
		.map((tag) => tagItem(ctx, tag));

	const sharedPage = `${group.group}/shared-types`;
	if ((ctx.schemasByPage.get(sharedPage) ?? []).length > 0) {
		items.push({ text: "Shared types", link: tagUrl(sharedPage) });
	}

	return {
		...tagItem(ctx, group.group),
		link: `${tagUrl(group.group)}/`,
		collapsed: true,
		items,
	};
}

export function buildSidebar(
	ctx: Context,
	staticPages: StaticSidebarPages,
): DefaultTheme.SidebarItem[] {
	const items: DefaultTheme.SidebarItem[] = [...staticPages.before];

	for (const entry of ctx.doc["x-sidebar-order"] ?? []) {
		if (typeof entry === "string") {
			if (SKIP_TAGS.has(entry)) continue;
			items.push(tagItem(ctx, entry));
		} else {
			items.push(groupItem(ctx, entry));
		}
	}

	items.push(...staticPages.after);
	return items;
}
