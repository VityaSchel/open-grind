import { describe, expect, it } from "vitest";

import { loadCredits } from "$lib/credits";
import generated from "$lib/credits/generated.json";
import type { CreditPlatform } from "$lib/credits/types";

const PLATFORM_SECTIONS: [title: string, platform: CreditPlatform][] = [
	["Android libraries", "android"],
	["Linux libraries", "linux"],
	["macOS libraries", "macos"],
	["Windows libraries", "windows"],
];

const identity = ({
	ecosystem,
	id,
	spdx,
}: {
	ecosystem: string;
	id: string;
	spdx: string;
}) => `${ecosystem} ${id} ${spdx}`;

const sectionEntries = async (title: string) => {
	const { groups } = await loadCredits();
	return groups.find((group) => group.title === title)?.entries ?? [];
};

describe("loadCredits", () => {
	it("lists the shared sections first and then one section per platform", async () => {
		const { groups } = await loadCredits();

		expect(groups.map((group) => group.title)).toEqual([
			"Web packages",
			"Rust crates",
			"Android libraries",
			"Linux libraries",
			"macOS libraries",
			"Windows libraries",
		]);
	});

	it("credits every generated entry exactly once, as a card or in a section", async () => {
		const { cards, groups } = await loadCredits();
		const credited = [
			...cards.flatMap((card) => card.entry ?? []),
			...groups.flatMap((group) => group.entries),
		];

		expect(credited.map(identity).sort()).toEqual(
			generated.entries.map(identity).sort(),
		);
	});

	it.each(PLATFORM_SECTIONS)(
		"puts every library that ships only on one platform under %s",
		async (title, platform) => {
			const exclusive = generated.entries.filter(
				(entry) => entry.platform === platform,
			);
			expect(exclusive.length).toBeGreaterThan(0);

			expect((await sectionEntries(title)).map(identity).sort()).toEqual(
				exclusive.map(identity).sort(),
			);
		},
	);

	it.each([
		["Web packages", ["asset", "npm"]],
		["Rust crates", ["rust"]],
	])(
		"keeps libraries that ship on several platforms under %s",
		async (title, ecosystems) => {
			const entries = await sectionEntries(title);

			expect(
				[...new Set(entries.map((entry) => entry.ecosystem))].sort(),
			).toEqual(ecosystems);
			expect(
				entries
					.filter((entry) => entry.platform !== undefined)
					.map((entry) => entry.name),
			).toEqual([]);
		},
	);

	it("mixes Maven artifacts and Android-only crates into one list sorted by name", async () => {
		const entries = await sectionEntries("Android libraries");
		const names = entries.map((entry) => entry.name.toLowerCase());

		expect(new Set(entries.map((entry) => entry.ecosystem))).toEqual(
			new Set(["android", "rust"]),
		);
		expect(names).toEqual(names.toSorted());
	});
});
