import { getName, getVersion } from "@tauri-apps/api/app";
import {
	type AboutMetadata,
	Menu,
	PredefinedMenuItem,
	type PredefinedMenuItemOptions,
	Submenu,
} from "@tauri-apps/api/menu";

import { followLocale, type MessageKey, t } from "$lib/i18n";
import { isMacosPlatform } from "./os";

const WINDOW_SUBMENU_ID = "__tauri_window_menu__";
const HELP_SUBMENU_ID = "__tauri_help_menu__";

type MenuBarKey = Extract<MessageKey, `shell.menuBar.${string}`>;

type ItemPlan = {
	readonly kind: PredefinedMenuItemOptions["item"];
	readonly key?: MenuBarKey;
};

type SubmenuPlan = {
	readonly id?: string;
	readonly title: { readonly key: MenuBarKey } | { readonly text: string };
	readonly items: readonly ItemPlan[];
};

type Label = {
	readonly item: Submenu | PredefinedMenuItem;
	readonly key: MenuBarKey;
	shown: string;
};

type Built<T> = { readonly item: T; readonly labels: readonly Label[] };

const SEPARATOR: ItemPlan = { kind: "Separator" };

let stopFollowing = (): void => {};

function menuPlan(about: AboutMetadata): readonly SubmenuPlan[] {
	return [
		{
			title: { text: about.name ?? "" },
			items: [
				{ kind: { About: about }, key: "shell.menuBar.about" },
				SEPARATOR,
				{ kind: "Services", key: "shell.menuBar.services" },
				SEPARATOR,
				{ kind: "Hide", key: "shell.menuBar.hide" },
				{ kind: "HideOthers", key: "shell.menuBar.hideOthers" },
				SEPARATOR,
				{ kind: "Quit", key: "shell.menuBar.quit" },
			],
		},
		{
			title: { key: "shell.menuBar.file" },
			items: [{ kind: "CloseWindow", key: "shell.menuBar.closeWindow" }],
		},
		{
			title: { key: "shell.menuBar.edit" },
			items: [
				{ kind: "Undo", key: "shell.menuBar.undo" },
				{ kind: "Redo", key: "shell.menuBar.redo" },
				SEPARATOR,
				{ kind: "Cut", key: "shell.menuBar.cut" },
				{ kind: "Copy", key: "shell.menuBar.copy" },
				{ kind: "Paste", key: "shell.menuBar.paste" },
				{ kind: "SelectAll", key: "shell.menuBar.selectAll" },
			],
		},
		{
			title: { key: "shell.menuBar.view" },
			items: [{ kind: "Fullscreen" }],
		},
		{
			id: WINDOW_SUBMENU_ID,
			title: { key: "shell.menuBar.window" },
			items: [
				{ kind: "Minimize", key: "shell.menuBar.minimize" },
				{ kind: "Maximize", key: "shell.menuBar.zoom" },
				SEPARATOR,
				{ kind: "CloseWindow", key: "shell.menuBar.closeWindow" },
			],
		},
		{
			id: HELP_SUBMENU_ID,
			title: { key: "shell.menuBar.help" },
			items: [],
		},
	];
}

function menuText(text: string): string {
	return text.replaceAll("&", "&&");
}

async function buildItem({
	kind,
	key,
}: ItemPlan): Promise<Built<PredefinedMenuItem>> {
	if (key === undefined) {
		const item = await PredefinedMenuItem.new({ item: kind });
		return { item, labels: [] };
	}
	const shown = menuText(t(key));
	const item = await PredefinedMenuItem.new({ item: kind, text: shown });
	return { item, labels: [{ item, key, shown }] };
}

async function buildSubmenu({
	id,
	title,
	items,
}: SubmenuPlan): Promise<Built<Submenu>> {
	const children = await Promise.all(items.map(buildItem));
	const text = menuText("key" in title ? t(title.key) : title.text);
	const item = await Submenu.new({
		id,
		text,
		items: children.map((child) => child.item),
	});
	const own = "key" in title ? [{ item, key: title.key, shown: text }] : [];
	return {
		item,
		labels: [...own, ...children.flatMap((child) => child.labels)],
	};
}

function relabel(labels: readonly Label[]): void {
	for (const label of labels) {
		const text = menuText(t(label.key));
		if (text === label.shown) continue;
		label.shown = text;
		label.item.setText(text).catch((error: unknown) => {
			console.error("Failed to relabel the app menu", error);
		});
	}
}

export async function startAppMenu(): Promise<void> {
	stopFollowing();
	stopFollowing = () => {};
	if (!isMacosPlatform()) return;
	try {
		const [name, version] = await Promise.all([getName(), getVersion()]);
		const submenus = await Promise.all(
			menuPlan({ name, version }).map(buildSubmenu),
		);
		const menu = await Menu.new({
			items: submenus.map(({ item }) => item),
		});
		await menu.setAsAppMenu();
		const labels = submenus.flatMap((submenu) => submenu.labels);
		stopFollowing = followLocale(() => relabel(labels));
	} catch (error) {
		console.error("Failed to set up the app menu", error);
	}
}
