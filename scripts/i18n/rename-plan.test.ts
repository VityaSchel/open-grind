import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { type FileText, planRename } from "./rename-plan";

const UNCAPTURABLE = "scripts/i18n-screenshots/uncapturable.json";
const ANDROID_STRINGS = "src/lib/i18n/android-strings.json";

const json = (tree: object) => `${JSON.stringify(tree, null, "\t")}\n`;

const entry = (reason: string) => ({
	reason,
	explanation: "Label that no screen shows.",
});

const texts = (files: FileText[]) =>
	Object.fromEntries(files.map(({ file, text }) => [file, text]));

const roots: string[] = [];

function repo(uncapturable: object = {}): string {
	const root = mkdtempSync(path.join(tmpdir(), "rename-plan-"));
	roots.push(root);
	const files = {
		"src/lib/i18n/locales/en/common.json": json({
			actions: { close: "Close", retry: "Retry" },
		}),
		"src/lib/i18n/locales/de/common.json": json({
			actions: { close: "Schließen" },
		}),
		"src/lib/i18n/locales/en/chat.json": json({
			unread_one: "{{count}} unread message",
			unread_other: "{{count}} unread messages",
		}),
		[ANDROID_STRINGS]: json({
			push_close: "common.actions.close",
			push_retry: "common.actions.retry",
		}),
		[UNCAPTURABLE]: json(uncapturable),
		"src/routes/Page.svelte": `{t("common.actions.close")} {t("chat.unread", { count })}\n`,
		"e2e/close.spec.ts": `await marker(page, "common.actions.close").click();\n`,
		"scripts/i18n-screenshots/scenes/close.ts": `export const keys = ["common.actions.close"];\n`,
		"scripts/i18n-screenshots/tally.test.ts": `const key = "common.actions.close";\n`,
	};
	for (const [file, text] of Object.entries(files)) {
		mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
		writeFileSync(path.join(root, file), text);
	}
	return root;
}

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe("planRename", () => {
	it("moves the key in every catalog and rewrites its uses in src, e2e, the screenshot scenes and the Android map", () => {
		const plan = planRename({
			root: repo(),
			from: "common.actions.close",
			to: "common.actions.dismiss",
		});
		expect(texts(plan.catalogs)).toEqual({
			"src/lib/i18n/locales/de/common.json": json({
				actions: { dismiss: "Schließen" },
			}),
			"src/lib/i18n/locales/en/common.json": json({
				actions: { dismiss: "Close", retry: "Retry" },
			}),
		});
		expect(texts(plan.references)).toEqual({
			[ANDROID_STRINGS]: json({
				push_close: "common.actions.dismiss",
				push_retry: "common.actions.retry",
			}),
			"e2e/close.spec.ts": `await marker(page, "common.actions.dismiss").click();\n`,
			"scripts/i18n-screenshots/scenes/close.ts": `export const keys = ["common.actions.dismiss"];\n`,
			"src/routes/Page.svelte": `{t("common.actions.dismiss")} {t("chat.unread", { count })}\n`,
		});
		expect(plan.undecided).toEqual([]);
	});

	it("moves every plural form together", () => {
		const plan = planRename({
			root: repo(),
			from: "chat.unread",
			to: "chat.unreadMessages",
		});
		expect(texts(plan.catalogs)).toEqual({
			"src/lib/i18n/locales/en/chat.json": json({
				unreadMessages_one: "{{count}} unread message",
				unreadMessages_other: "{{count}} unread messages",
			}),
		});
		expect(texts(plan.references)).toEqual({
			"src/routes/Page.svelte": `{t("common.actions.close")} {t("chat.unreadMessages", { count })}\n`,
		});
	});

	it("renames the key's uncapturable entry and the reasons that name it", () => {
		const plan = planRename({
			root: repo({
				"common.actions.close": entry("Only in the native window."),
				"common.actions.retry": entry(
					"Replaced by common.actions.close, as common.actions.close_one, never common.actions.closeAll or app.common.actions.close.",
				),
			}),
			from: "common.actions.close",
			to: "common.actions.dismiss",
		});
		expect(texts(plan.references)[UNCAPTURABLE]).toBe(
			json({
				"common.actions.dismiss": entry("Only in the native window."),
				"common.actions.retry": entry(
					"Replaced by common.actions.dismiss, as common.actions.dismiss_one, never common.actions.closeAll or app.common.actions.close.",
				),
			}),
		);
		expect(plan.undecided).toEqual([]);
	});

	it("leaves a wildcard entry that still covers the new key", () => {
		const plan = planRename({
			root: repo({ "common.actions.*": entry("Only in menus.") }),
			from: "common.actions.close",
			to: "common.actions.dismiss",
		});
		expect(Object.keys(texts(plan.references))).not.toContain(UNCAPTURABLE);
		expect(plan.undecided).toEqual([]);
	});

	it("reports a wildcard entry that no longer covers the new key", () => {
		const plan = planRename({
			root: repo({
				"common.*": entry("Only in the common namespace."),
				"common.actions.*": entry("Only in menus."),
			}),
			from: "common.actions.close",
			to: "common.buttons.close",
		});
		expect(Object.keys(texts(plan.references))).not.toContain(UNCAPTURABLE);
		expect(plan.undecided).toEqual([
			`${UNCAPTURABLE}: common.actions.* covered common.actions.close but does not cover common.buttons.close; give common.buttons.close its own entry or show it in a screenshot view`,
		]);
	});

	it("refuses a key a catalog already has", () => {
		expect(() =>
			planRename({
				root: repo(),
				from: "common.actions.close",
				to: "common.actions.retry",
			}),
		).toThrow(new Error("common.actions.retry already exists in en"));
	});

	it("refuses a key uncapturable.json already has an entry for", () => {
		expect(() =>
			planRename({
				root: repo({ "common.actions.dismiss": entry("Stale.") }),
				from: "common.actions.close",
				to: "common.actions.dismiss",
			}),
		).toThrow(
			new Error(
				`${UNCAPTURABLE} already has an entry for common.actions.dismiss; remove it, then rename again`,
			),
		);
	});
});
