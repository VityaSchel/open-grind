import { describe, expect, it } from "vitest";

import { type CreditSection, loadCredits } from "$lib/credits";
import generated from "$lib/credits/generated.json";
import { creditPlatforms } from "$lib/credits/types";

const identity = ({
	ecosystem,
	id,
	spdx,
}: {
	ecosystem: string;
	id: string;
	spdx: string;
}) => `${ecosystem} ${id} ${spdx}`;

const sectionEntries = async (id: CreditSection["id"]) => {
	const { groups } = await loadCredits();
	return groups.find((group) => group.id === id)?.entries ?? [];
};

describe("loadCredits", () => {
	it("lists the shared sections first and then one section per platform", async () => {
		const { groups } = await loadCredits();

		expect(groups.map((group) => group.id)).toEqual([
			"webPackages",
			"rustCrates",
			"android",
			"linux",
			"macos",
			"windows",
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

	it.each(creditPlatforms)(
		"puts every library that ships only on %s under its own section",
		async (platform) => {
			const exclusive = generated.entries.filter(
				(entry) => entry.platform === platform,
			);
			expect(exclusive.length).toBeGreaterThan(0);

			expect(
				(await sectionEntries(platform)).map(identity).sort(),
			).toEqual(exclusive.map(identity).sort());
		},
	);

	it.each<[CreditSection["id"], string[]]>([
		["webPackages", ["asset", "npm"]],
		["rustCrates", ["rust"]],
	])(
		"keeps libraries that ship on several platforms under %s",
		async (id, ecosystems) => {
			const entries = await sectionEntries(id);

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
		const entries = await sectionEntries("android");
		const names = entries.map((entry) => entry.name.toLowerCase());

		expect(new Set(entries.map((entry) => entry.ecosystem))).toEqual(
			new Set(["android", "rust"]),
		);
		expect(names).toEqual(names.toSorted());
	});
});
