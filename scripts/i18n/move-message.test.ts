import { describe, expect, it } from "vitest";

import { FIXTURES, readLocaleFiles } from "./locale-files";
import { type LocaleFile, moveMessage, renameLiterals } from "./move-message";

const weblate = (tree: object) => `${JSON.stringify(tree, null, "\t")}\n`;

const pathOf = ({ locale, namespace }: LocaleFile) => `${locale}/${namespace}`;

function catalog(trees: Record<string, object>): LocaleFile[] {
	return Object.entries(trees).map(([name, tree]) => {
		const [locale = "", namespace = ""] = name.split("/");
		return { locale, namespace, text: weblate(tree) };
	});
}

function texts(files: LocaleFile[]): Record<string, string> {
	return Object.fromEntries(files.map((file) => [pathOf(file), file.text]));
}

function apply({
	files,
	changes,
}: {
	files: LocaleFile[];
	changes: LocaleFile[];
}): LocaleFile[] {
	const changed = new Map(changes.map((file) => [pathOf(file), file]));
	return files.map((file) => changed.get(pathOf(file)) ?? file);
}

describe("moveMessage", () => {
	it("renames a key in place in every locale that has it", () => {
		const files = catalog({
			"en/common": {
				actions: { close: "Close", retry: "Retry" },
				time: { justNow: "Just now" },
			},
			"de/common": { actions: { close: "Schließen", retry: "Erneut" } },
			"fr/common": { time: { justNow: "À l'instant" } },
		});
		const from = "common.actions.close";
		const to = "common.actions.dismiss";
		expect(texts(moveMessage({ files, from, to }))).toEqual({
			"en/common": weblate({
				actions: { dismiss: "Close", retry: "Retry" },
				time: { justNow: "Just now" },
			}),
			"de/common": weblate({
				actions: { dismiss: "Schließen", retry: "Erneut" },
			}),
		});
	});

	it("moves every plural form a locale has, cleared ones included", () => {
		const files = catalog({
			"en/sample": {
				chat: {
					typing: "{{name}} is typing…",
					unread_one: "{{count}} unread message",
					unread_other: "{{count}} unread messages",
					drafts: {},
				},
			},
			"ru/sample": {
				chat: { unread_one: "F0", unread_few: "", unread_many: "F2" },
			},
		});
		const from = "sample.chat.unread";
		const to = "sample.chat.unseen";
		expect(texts(moveMessage({ files, from, to }))).toEqual({
			"en/sample": weblate({
				chat: {
					typing: "{{name}} is typing…",
					unseen_one: "{{count}} unread message",
					unseen_other: "{{count}} unread messages",
					drafts: {},
				},
			}),
			"ru/sample": weblate({
				chat: { unseen_one: "F0", unseen_few: "", unseen_many: "F2" },
			}),
		});
	});

	describe("within a namespace", () => {
		const files = catalog({
			"en/feedback": {
				errorToast: { defaultLabel: "An error occurred" },
				errorCopy: { errors: { copyFailed: "Couldn't copy" } },
				requestBlocked: {
					rotate: "Rotate parameters",
					errors: { network: "Blocked" },
				},
				later: {},
			},
		});

		it.each([
			[
				"feedback.errorCopy.errors.copyFailed",
				"feedback.copyFailed",
				{
					errorToast: { defaultLabel: "An error occurred" },
					copyFailed: "Couldn't copy",
					requestBlocked: {
						rotate: "Rotate parameters",
						errors: { network: "Blocked" },
					},
					later: {},
				},
			],
			[
				"feedback.requestBlocked.rotate",
				"feedback.requestBlocked.actions.rotate",
				{
					errorToast: { defaultLabel: "An error occurred" },
					errorCopy: { errors: { copyFailed: "Couldn't copy" } },
					requestBlocked: {
						actions: { rotate: "Rotate parameters" },
						errors: { network: "Blocked" },
					},
					later: {},
				},
			],
			[
				"feedback.errorCopy.errors.copyFailed",
				"feedback.requestBlocked.copyFailed",
				{
					errorToast: { defaultLabel: "An error occurred" },
					requestBlocked: {
						rotate: "Rotate parameters",
						errors: { network: "Blocked" },
						copyFailed: "Couldn't copy",
					},
					later: {},
				},
			],
		])("moves %s to %s", (from, to, expected) => {
			expect(texts(moveMessage({ files, from, to }))).toEqual({
				"en/feedback": weblate(expected),
			});
		});
	});

	it("appends to another namespace, creating files only where the message is", () => {
		const files = catalog({
			"en/shell": {
				error: { title: "Unexpected Error", refresh: "Refresh" },
			},
			"en/common": {
				error: { code: "Error code" },
				actions: { close: "Close" },
			},
			"de/shell": { error: { title: "Unerwarteter Fehler" } },
			"fr/shell": { error: { refresh: "Actualiser" } },
			"fr/common": { actions: { close: "Fermer" } },
		});
		const from = "shell.error.title";
		expect(texts(moveMessage({ files, from, to: "common.title" }))).toEqual(
			{
				"en/shell": weblate({ error: { refresh: "Refresh" } }),
				"en/common": weblate({
					error: { code: "Error code" },
					actions: { close: "Close" },
					title: "Unexpected Error",
				}),
				"de/shell": weblate({}),
				"de/common": weblate({ title: "Unerwarteter Fehler" }),
			},
		);
		expect(
			texts(moveMessage({ files, from, to: "dialogs.title" })),
		).toEqual({
			"en/shell": weblate({ error: { refresh: "Refresh" } }),
			"en/dialogs": weblate({ title: "Unexpected Error" }),
			"de/shell": weblate({}),
			"de/dialogs": weblate({ title: "Unerwarteter Fehler" }),
		});
	});

	describe("on real Weblate files", () => {
		const fixtures = [...readLocaleFiles(FIXTURES)].flatMap(
			([locale, files]) =>
				files.map(({ namespace, text }) => ({
					locale,
					namespace,
					text,
				})),
		);

		it.each([
			["sample.chat.unread", "sample.chat.unseen"],
			["sample.photos", "sample.media.photos"],
			["sample.settings.theme.light", "sample.light"],
		])("round-trips %s through %s byte for byte", (from, to) => {
			const there = moveMessage({ files: fixtures, from, to });
			const moved = apply({ files: fixtures, changes: there });
			const back = moveMessage({ files: moved, from: to, to: from });
			expect(moved).not.toEqual(fixtures);
			expect(back.map(pathOf)).toEqual(there.map(pathOf));
			expect(apply({ files: moved, changes: back })).toEqual(fixtures);
		});
	});

	describe("refuses", () => {
		const files = catalog({
			"en/common": {
				actions: { close: "Close" },
				time: {
					minutes_one: "{{count}} min",
					minutes_other: "{{count}} mins",
				},
				later: {},
			},
			"de/common": { stale: "Veraltet" },
		});

		it.each([
			[
				"common.actions.open",
				"common.open",
				"common.actions.open does not exist in en",
			],
			[
				"common.stale",
				"common.fresh",
				"common.stale does not exist in en",
			],
			[
				"common.actions",
				"common.buttons",
				"common.actions does not exist in en",
			],
			[
				"common.actions.close",
				"common.actions.close",
				"common.actions.close already exists in en",
			],
			[
				"common.actions.close",
				"common.time.minutes",
				"common.time.minutes already exists in en",
			],
			[
				"common.actions.close",
				"common.later",
				"common.later already exists in en",
			],
			[
				"common.actions.close",
				"common.actions.close.label",
				"common.actions.close.label already exists in en",
			],
			[
				"common.actions.close",
				"common.time.minutes.short",
				"common.time.minutes.short already exists in en",
			],
			[
				"common.actions.close",
				"common.stale",
				"common.stale already exists in de",
			],
			["common", "common.close", "common is not a valid message key"],
			[
				"common.actions.close",
				"common.time.minutes_one",
				"common.time.minutes_one is not a valid message key",
			],
			[
				"common.actions.close",
				"common..close",
				"common..close is not a valid message key",
			],
			[
				"common.actions.close",
				"common.actions.close me",
				"common.actions.close me is not a valid message key",
			],
			[
				"common.actions.close",
				"common/x.close",
				"common/x.close is not a valid message key",
			],
			[
				"common.actions.close",
				"common.actions.close_button",
				"common.actions.close_button is not a valid message key",
			],
			[
				"common.actions.close",
				"common.actions.Close",
				"common.actions.Close is not a valid message key",
			],
		])("%s to %s", (from, to, reason) => {
			expect(() => moveMessage({ files, from, to })).toThrow(
				new Error(reason),
			);
		});
	});
});

describe("renameLiterals", () => {
	it("rewrites quoted keys only", () => {
		const text = [
			`t("shell.error.title")`,
			`t('shell.error.title', params)`,
			"t(`shell.error.title`)",
			`richParts("shell.error.title")`,
			`<Rich key="shell.error.title">`,
			`status === 404 ? "shell.error.pageNotFound" : "shell.error.title"`,
			`{ title: "shell.error.title", other: "shell.error.titles" }`,
			`t("shell.error.title.short")`,
			`"app.shell.error.title"`,
			`"shell.error.title'`,
			`shell.error.title`,
			`"shellXerrorXtitle"`,
		].join("\n");
		expect(
			renameLiterals({
				text,
				from: "shell.error.title",
				to: "shell.failure.title",
			}),
		).toBe(
			[
				`t("shell.failure.title")`,
				`t('shell.failure.title', params)`,
				"t(`shell.failure.title`)",
				`richParts("shell.failure.title")`,
				`<Rich key="shell.failure.title">`,
				`status === 404 ? "shell.error.pageNotFound" : "shell.failure.title"`,
				`{ title: "shell.failure.title", other: "shell.error.titles" }`,
				`t("shell.error.title.short")`,
				`"app.shell.error.title"`,
				`"shell.error.title'`,
				`shell.error.title`,
				`"shellXerrorXtitle"`,
			].join("\n"),
		);
	});
});
