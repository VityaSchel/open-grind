import { flushSync } from "svelte";
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	type Mock,
	vi,
} from "vitest";

import {
	type MessageKey,
	setLocale,
	setRegionalSettings,
	SOURCE_LOCALE,
	t,
} from "$lib/i18n";
import { webRegionalSettings } from "$lib/i18n/regional";
import { startAppMenu } from "./app-menu";

type MenuBarKey = Extract<MessageKey, `shell.menuBar.${string}`>;

type FakeKind = "Menu" | "Submenu" | "Predefined";

type FakeOptions = {
	readonly id?: string;
	readonly text?: string;
	readonly item?: unknown;
	readonly items?: readonly Fake[];
};

type Fake = {
	readonly kind: FakeKind;
	readonly options: FakeOptions;
	readonly setText: Mock<(text: string) => Promise<void>>;
	readonly setAsAppMenu: Mock<() => Promise<null>>;
};

const { created, native, fakeClass } = vi.hoisted(() => {
	const created: Fake[] = [];
	const native = {
		tauri: true,
		platform: "macos",
		failing: undefined as FakeKind | undefined,
	};
	const fakeClass = (kind: FakeKind) => ({
		new: (options: FakeOptions): Promise<Fake> => {
			if (native.failing === kind) {
				return Promise.reject(new Error(`No ${kind}`));
			}
			const fake: Fake = {
				kind,
				options,
				setText: vi.fn(() => Promise.resolve()),
				setAsAppMenu: vi.fn(() => Promise.resolve(null)),
			};
			created.push(fake);
			return Promise.resolve(fake);
		},
	});
	return { created, native, fakeClass };
});

vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tauri-apps/api/core")>()),
	isTauri: () => native.tauri,
}));

vi.mock("@tauri-apps/plugin-os", () => ({ platform: () => native.platform }));

vi.mock("@tauri-apps/api/app", () => ({
	getName: () => Promise.resolve("Open Grind"),
	getVersion: () => Promise.resolve("1.2.0"),
}));

vi.mock("@tauri-apps/api/menu", () => ({
	Menu: fakeClass("Menu"),
	PredefinedMenuItem: fakeClass("Predefined"),
	Submenu: fakeClass("Submenu"),
}));

vi.mock("$lib/i18n/catalog-files", async (importOriginal) => {
	const original =
		await importOriginal<typeof import("$lib/i18n/catalog-files")>();
	return {
		...original,
		translationFiles: {
			...original.translationFiles,
			"./locales/de/shell.json": () =>
				Promise.resolve({
					menuBar: {
						help: "Hilfe & Support",
						paste: "Einsetzen & Anpassen",
					},
				}),
		},
	};
});

const MUDA_LABELS = {
	"shell.menuBar.about": "About Open Grind",
	"shell.menuBar.services": "Services",
	"shell.menuBar.hide": "Hide Open Grind",
	"shell.menuBar.hideOthers": "Hide Others",
	"shell.menuBar.quit": "Quit Open Grind",
	"shell.menuBar.file": "File",
	"shell.menuBar.closeWindow": "Close Window",
	"shell.menuBar.edit": "Edit",
	"shell.menuBar.undo": "Undo",
	"shell.menuBar.redo": "Redo",
	"shell.menuBar.cut": "Cut",
	"shell.menuBar.copy": "Copy",
	"shell.menuBar.paste": "Paste",
	"shell.menuBar.selectAll": "Select All",
	"shell.menuBar.view": "View",
	"shell.menuBar.window": "Window",
	"shell.menuBar.minimize": "Minimize",
	"shell.menuBar.zoom": "Zoom",
	"shell.menuBar.help": "Help",
} as const satisfies Record<MenuBarKey, string>;

function expectedMenu(label: (key: MenuBarKey) => string): unknown[] {
	return [
		{
			text: "Open Grind",
			items: [
				["About", label("shell.menuBar.about")],
				["Separator"],
				["Services", label("shell.menuBar.services")],
				["Separator"],
				["Hide", label("shell.menuBar.hide")],
				["HideOthers", label("shell.menuBar.hideOthers")],
				["Separator"],
				["Quit", label("shell.menuBar.quit")],
			],
		},
		{
			text: label("shell.menuBar.file"),
			items: [["CloseWindow", label("shell.menuBar.closeWindow")]],
		},
		{
			text: label("shell.menuBar.edit"),
			items: [
				["Undo", label("shell.menuBar.undo")],
				["Redo", label("shell.menuBar.redo")],
				["Separator"],
				["Cut", label("shell.menuBar.cut")],
				["Copy", label("shell.menuBar.copy")],
				["Paste", label("shell.menuBar.paste")],
				["SelectAll", label("shell.menuBar.selectAll")],
			],
		},
		{ text: label("shell.menuBar.view"), items: [["Fullscreen"]] },
		{
			id: "__tauri_window_menu__",
			text: label("shell.menuBar.window"),
			items: [
				["Minimize", label("shell.menuBar.minimize")],
				["Maximize", label("shell.menuBar.zoom")],
				["Separator"],
				["CloseWindow", label("shell.menuBar.closeWindow")],
			],
		},
		{
			id: "__tauri_help_menu__",
			text: label("shell.menuBar.help"),
			items: [],
		},
	];
}

function shownText(fake: Fake): string | undefined {
	return fake.setText.mock.lastCall?.[0] ?? fake.options.text;
}

function itemKind(item: unknown): string {
	return typeof item === "object" && item !== null
		? Object.keys(item).join()
		: String(item);
}

function outline(fake: Fake): unknown {
	const text = shownText(fake);
	if (fake.kind === "Predefined") {
		const kind = itemKind(fake.options.item);
		return text === undefined ? [kind] : [kind, text];
	}
	const { id, items = [] } = fake.options;
	return { id, text, items: items.map(outline) };
}

function menus(): Fake[] {
	return created.filter(({ kind }) => kind === "Menu");
}

function shownMenu(): unknown[] {
	const [menu, ...others] = menus();
	expect(others).toHaveLength(0);
	return (menu?.options.items ?? []).map(outline);
}

function relabeled(): Fake[] {
	return created.filter(({ setText }) => setText.mock.calls.length > 0);
}

async function switchLocale(locale: string): Promise<void> {
	await setLocale({ locale });
	flushSync();
}

beforeEach(() => {
	created.length = 0;
	Object.assign(native, {
		tauri: true,
		platform: "macos",
		failing: undefined,
	});
});

afterEach(async () => {
	vi.restoreAllMocks();
	setRegionalSettings(webRegionalSettings());
	await switchLocale(SOURCE_LOCALE);
});

describe("startAppMenu", () => {
	it("rebuilds Tauri's default macOS menu with muda's English labels", async () => {
		await startAppMenu();

		expect(shownMenu()).toEqual(expectedMenu((key) => MUDA_LABELS[key]));
		const about = created.find(
			({ options }) => itemKind(options.item) === "About",
		);
		expect(about?.options.item).toEqual({
			About: { name: "Open Grind", version: "1.2.0" },
		});
		expect(menus()[0]?.setAsAppMenu).toHaveBeenCalledOnce();
	});

	it("labels every item in the language shown at start", async () => {
		await setLocale({ locale: "en-XA" });

		await startAppMenu();

		expect(shownMenu()).toEqual(expectedMenu((key) => t(key)));
		expect(t("shell.menuBar.quit")).not.toBe(
			MUDA_LABELS["shell.menuBar.quit"],
		);
	});

	it("relabels the items in place when the language changes", async () => {
		await startAppMenu();
		const count = created.length;

		await switchLocale("en-XA");

		expect(shownMenu()).toEqual(expectedMenu((key) => t(key)));
		expect(created).toHaveLength(count);
		expect(menus()[0]?.setAsAppMenu).toHaveBeenCalledOnce();
		expect(relabeled()).toHaveLength(20);
		for (const fake of relabeled()) {
			expect(fake.setText).toHaveBeenCalledOnce();
		}
	});

	it("leaves the labels alone when only the regional settings change", async () => {
		await startAppMenu();

		setRegionalSettings({ locale: "de-DE", hourCycle: "h23" });
		flushSync();

		expect(relabeled()).toEqual([]);
	});

	it("doubles ampersands so macOS shows them instead of reading a mnemonic", async () => {
		await setLocale({ locale: "de" });
		await startAppMenu();
		const help = created.find(
			({ options }) => options.id === "__tauri_help_menu__",
		);
		const paste = created.find(
			({ options }) => itemKind(options.item) === "Paste",
		);
		expect([help?.options.text, paste?.options.text]).toEqual([
			"Hilfe && Support",
			"Einsetzen && Anpassen",
		]);

		await switchLocale(SOURCE_LOCALE);
		await switchLocale("de");

		expect(help?.setText.mock.calls).toEqual([
			["Help"],
			["Hilfe && Support"],
		]);
		expect(paste?.setText.mock.calls).toEqual([
			["Paste"],
			["Einsetzen && Anpassen"],
		]);
	});

	it("stops relabeling the previous menu after a restart", async () => {
		await startAppMenu();
		const first = [...created];
		await startAppMenu();

		await switchLocale("en-XA");

		expect(menus()).toHaveLength(2);
		for (const fake of first) {
			expect(fake.setText).not.toHaveBeenCalled();
		}
		expect(relabeled()).toHaveLength(20);
	});

	it.each([
		["outside the app", { tauri: false, platform: "macos" }],
		["on Windows", { tauri: true, platform: "windows" }],
		["on Linux", { tauri: true, platform: "linux" }],
	])("keeps the default menu %s", async (_, platform) => {
		Object.assign(native, platform);

		await startAppMenu();
		await switchLocale("en-XA");

		expect(created).toEqual([]);
	});

	it("keeps Tauri's default menu and logs when building fails", async () => {
		const logged = vi.spyOn(console, "error").mockImplementation(() => {});
		native.failing = "Submenu";

		await expect(startAppMenu()).resolves.toBeUndefined();

		expect(menus()).toEqual([]);
		expect(logged).toHaveBeenCalledWith(
			"Failed to set up the app menu",
			new Error("No Submenu"),
		);
	});

	it("logs a label that fails to change", async () => {
		const logged = vi.spyOn(console, "error").mockImplementation(() => {});
		await startAppMenu();
		const quit = created.find(
			({ options }) => itemKind(options.item) === "Quit",
		);
		quit?.setText.mockRejectedValueOnce(new Error("gone"));

		await switchLocale("en-XA");
		await vi.waitFor(() =>
			expect(logged).toHaveBeenCalledWith(
				"Failed to relabel the app menu",
				new Error("gone"),
			),
		);
	});
});
