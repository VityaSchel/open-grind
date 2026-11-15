import { describe, expect, it } from "vitest";

import {
	type LanguagePlan,
	type LanguageSettings,
	type LanguageSyncTier,
	planLanguageChoice,
	reconcileLanguage,
} from "./language-sync";

const OFFERED = new Set(["de", "en-US", "es-419", "fr", "pt-BR"]);

const isOffered = (tag: string) => OFFERED.has(tag);

type Case = {
	language: string | null;
	seen: string | null | undefined;
	native: string | null;
	expected: {
		language: string | null;
		seen: string | null | undefined;
		write?: string | null;
	};
};

function settings({
	language,
	seen,
}: {
	language: string | null;
	seen: string | null | undefined;
}): LanguageSettings {
	return {
		language,
		languageSync: seen === undefined ? null : { native: seen },
	};
}

function plan(expected: Case["expected"]): LanguagePlan {
	return {
		...settings(expected),
		write: expected.write === undefined ? null : { tag: expected.write },
	};
}

function reconcile({
	tier,
	language,
	seen,
	native,
}: Omit<Case, "expected"> & { tier: LanguageSyncTier }): LanguagePlan {
	return reconcileLanguage({
		tier,
		native,
		isOffered,
		...settings({ language, seen }),
	});
}

const NEVER = undefined;

const twoWay: [string, Case][] = [
	[
		"first run with nothing chosen anywhere",
		{
			language: null,
			seen: NEVER,
			native: null,
			expected: { language: null, seen: null },
		},
	],
	[
		"first run on Android 13 after a choice made on Android 12",
		{
			language: "de",
			seen: NEVER,
			native: null,
			expected: { language: "de", seen: "de", write: "de" },
		},
	],
	[
		"first run after choosing in the system settings",
		{
			language: null,
			seen: NEVER,
			native: "fr",
			expected: { language: "fr", seen: "fr" },
		},
	],
	[
		"first run where the system and the app disagree",
		{
			language: "de",
			seen: NEVER,
			native: "fr",
			expected: { language: "fr", seen: "fr" },
		},
	],
	[
		"the echo of the app's own write",
		{
			language: "de",
			seen: "de",
			native: "de",
			expected: { language: "de", seen: "de" },
		},
	],
	[
		"the echo of the app's own write in another spelling",
		{
			language: "pt-BR",
			seen: "pt-BR",
			native: "pt_br",
			expected: { language: "pt-BR", seen: "pt_br" },
		},
	],
	[
		"a language picked in the system settings",
		{
			language: "de",
			seen: "de",
			native: "fr",
			expected: { language: "fr", seen: "fr" },
		},
	],
	[
		"the system settings' System default",
		{
			language: "de",
			seen: "de",
			native: null,
			expected: { language: null, seen: null },
		},
	],
	[
		"a system language picked while nothing was chosen",
		{
			language: null,
			seen: null,
			native: "es-419",
			expected: { language: "es-419", seen: "es-419" },
		},
	],
	[
		"a choice whose write failed",
		{
			language: "fr",
			seen: "de",
			native: "de",
			expected: { language: "fr", seen: "fr", write: "fr" },
		},
	],
	[
		"a choice whose write failed while the system had none",
		{
			language: "fr",
			seen: null,
			native: null,
			expected: { language: "fr", seen: "fr", write: "fr" },
		},
	],
	[
		"a choice cleared in the app while the system kept it",
		{
			language: null,
			seen: "de",
			native: "de",
			expected: { language: null, seen: null, write: null },
		},
	],
	[
		"a stored choice the app no longer offers",
		{
			language: "sw",
			seen: "sw",
			native: "sw",
			expected: { language: null, seen: null, write: null },
		},
	],
	[
		"a stored choice the app no longer offers with nothing in the system",
		{
			language: "sw",
			seen: NEVER,
			native: null,
			expected: { language: null, seen: null },
		},
	],
	[
		"a system language the app doesn't offer",
		{
			language: "de",
			seen: "de",
			native: "sw",
			expected: { language: null, seen: null, write: null },
		},
	],
];

const readOnly: [string, Case][] = [
	[
		"first run with nothing chosen anywhere",
		{
			language: null,
			seen: NEVER,
			native: null,
			expected: { language: null, seen: null },
		},
	],
	[
		"first run with a choice made in the app",
		{
			language: "de",
			seen: NEVER,
			native: null,
			expected: { language: "de", seen: null },
		},
	],
	[
		"first run after choosing in the system settings",
		{
			language: "de",
			seen: NEVER,
			native: "fr",
			expected: { language: "fr", seen: "fr" },
		},
	],
	[
		"a choice made in the app since the last launch",
		{
			language: "de",
			seen: "fr",
			native: "fr",
			expected: { language: "de", seen: "fr" },
		},
	],
	[
		"a language picked in the system settings",
		{
			language: "de",
			seen: "fr",
			native: "es-419",
			expected: { language: "es-419", seen: "es-419" },
		},
	],
	[
		"the system settings' default",
		{
			language: "de",
			seen: "fr",
			native: null,
			expected: { language: null, seen: null },
		},
	],
	[
		"a stored choice the app no longer offers",
		{
			language: "sw",
			seen: "fr",
			native: "fr",
			expected: { language: null, seen: "fr" },
		},
	],
	[
		"a system language the app doesn't offer",
		{
			language: "de",
			seen: "fr",
			native: "sw",
			expected: { language: null, seen: "sw" },
		},
	],
];

const none: [string, Case][] = [
	[
		"a choice made in the app",
		{
			language: "de",
			seen: NEVER,
			native: null,
			expected: { language: "de", seen: NEVER },
		},
	],
	[
		"a value the platform can't report",
		{
			language: "de",
			seen: "fr",
			native: "es-419",
			expected: { language: "de", seen: "fr" },
		},
	],
	[
		"nothing chosen",
		{
			language: null,
			seen: NEVER,
			native: null,
			expected: { language: null, seen: NEVER },
		},
	],
	[
		"a stored choice the app no longer offers",
		{
			language: "sw",
			seen: NEVER,
			native: null,
			expected: { language: null, seen: NEVER },
		},
	],
];

describe.each([
	["two-way", twoWay],
	["read-only", readOnly],
	["none", none],
] as const)("reconcileLanguage on a %s platform", (tier, cases) => {
	it.each(cases)("settles %s", (_, { expected, ...state }) => {
		expect(reconcile({ tier, ...state })).toEqual(plan(expected));
	});
});

describe("planLanguageChoice", () => {
	it("writes a choice to a two-way platform and remembers it as seen", () => {
		expect(
			planLanguageChoice({
				tier: "two-way",
				tag: "es-419",
				languageSync: { native: "de" },
			}),
		).toEqual(
			plan({ language: "es-419", seen: "es-419", write: "es-419" }),
		);
	});

	it.each(["read-only", "none"] as const)(
		"only stores a choice on a %s platform",
		(tier) => {
			expect(
				planLanguageChoice({
					tier,
					tag: "es-419",
					languageSync: { native: "de" },
				}),
			).toEqual(plan({ language: "es-419", seen: "de" }));
		},
	);

	it("stores the tag in its canonical spelling", () => {
		expect(
			planLanguageChoice({
				tier: "none",
				tag: "pt_br",
				languageSync: null,
			}).language,
		).toBe("pt-BR");
	});
});

describe("a choice followed by native reports", () => {
	it("ignores the echo of a successful write", () => {
		const chosen = planLanguageChoice({
			tier: "two-way",
			tag: "fr",
			languageSync: { native: "de" },
		});

		expect(
			reconcileLanguage({
				tier: "two-way",
				native: "fr",
				isOffered,
				...chosen,
			}),
		).toEqual(plan({ language: "fr", seen: "fr" }));
	});

	it("retries a write that failed once the failure is remembered", () => {
		const chosen = planLanguageChoice({
			tier: "two-way",
			tag: "fr",
			languageSync: { native: "de" },
		});
		const afterFailure = { ...chosen, languageSync: { native: "de" } };

		expect(
			reconcileLanguage({
				tier: "two-way",
				native: "de",
				isOffered,
				...afterFailure,
			}),
		).toEqual(plan({ language: "fr", seen: "fr", write: "fr" }));
	});

	it("lets a system change win over a choice whose write failed", () => {
		const chosen = planLanguageChoice({
			tier: "two-way",
			tag: "fr",
			languageSync: { native: "de" },
		});
		const afterFailure = { ...chosen, languageSync: { native: "de" } };

		expect(
			reconcileLanguage({
				tier: "two-way",
				native: "es-419",
				isOffered,
				...afterFailure,
			}),
		).toEqual(plan({ language: "es-419", seen: "es-419" }));
	});
});
