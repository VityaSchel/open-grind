import { describe, expect, it } from "vitest";

import { GENDER_ASK_ME } from "$lib/model/browse/grid/filters";
import { isGenderChipShown, selectGenders } from "./gender-chips";

const chip = ({
	genderId,
	displayGroup = 1,
	excludeOnFilterSelection = null,
}: {
	genderId: number;
	displayGroup?: number;
	excludeOnFilterSelection?: number[] | null;
}) => ({ genderId, displayGroup, excludeOnFilterSelection });

const men = chip({ genderId: 1, excludeOnFilterSelection: [4, 5] });
const cisMen = chip({ genderId: 4, excludeOnFilterSelection: [1] });
const transMen = chip({ genderId: 5, excludeOnFilterSelection: [1] });
const women = chip({ genderId: 2, excludeOnFilterSelection: [6, 7] });
const nonBinary = chip({ genderId: 3, excludeOnFilterSelection: [10] });
const agender = chip({
	genderId: 10,
	displayGroup: 2,
	excludeOnFilterSelection: [3],
});
const retired = chip({
	genderId: 99,
	displayGroup: 0,
	excludeOnFilterSelection: [7],
});
const askMe = chip({ genderId: GENDER_ASK_ME, displayGroup: 2 });
const catalog = [
	men,
	cisMen,
	transMen,
	women,
	nonBinary,
	agender,
	retired,
	askMe,
];

const shownChips = ({
	selected,
	expanded,
}: {
	selected: number[];
	expanded: boolean;
}) =>
	catalog.filter((gender) =>
		isGenderChipShown({ gender, selected, expanded }),
	);

describe("isGenderChipShown", () => {
	it("shows only the first display group while collapsed", () => {
		expect(shownChips({ selected: [], expanded: false })).toEqual([
			men,
			cisMen,
			transMen,
			women,
			nonBinary,
		]);
	});

	it("shows every offered gender once expanded", () => {
		expect(shownChips({ selected: [], expanded: true })).toEqual([
			men,
			cisMen,
			transMen,
			women,
			nonBinary,
			agender,
		]);
	});

	it("never shows Ask me, even when it is selected", () => {
		for (const expanded of [false, true])
			expect(
				isGenderChipShown({
					gender: askMe,
					selected: [GENDER_ASK_ME],
					expanded,
				}),
			).toBe(false);
	});

	it("shows a selected gender that is no longer offered so it can be removed", () => {
		for (const expanded of [false, true])
			expect(
				isGenderChipShown({
					gender: retired,
					selected: [retired.genderId],
					expanded,
				}),
			).toBe(true);
	});

	it("hides Cis Men and Trans Men while Men is selected, and Men while Cis Men is", () => {
		expect(shownChips({ selected: [1], expanded: false })).toEqual([
			men,
			women,
			nonBinary,
		]);
		expect(shownChips({ selected: [4], expanded: false })).toEqual([
			cisMen,
			transMen,
			women,
			nonBinary,
		]);
	});

	it("keeps a selected chip visible while collapsed", () => {
		expect(
			isGenderChipShown({
				gender: agender,
				selected: [10],
				expanded: false,
			}),
		).toBe(true);
	});

	it("keeps a selected chip visible when the selection excludes it", () => {
		for (const expanded of [false, true]) {
			expect(
				isGenderChipShown({ gender: men, selected: [1, 4], expanded }),
			).toBe(true);
		}
	});
});

describe("selectGenders", () => {
	it("unselects Cis Men when Men is picked, and Men when Cis Men is picked", () => {
		expect(
			selectGenders({ catalog, previous: [4, 2], next: [4, 2, 1] }),
		).toEqual([2, 1]);
		expect(selectGenders({ catalog, previous: [1], next: [1, 4] })).toEqual(
			[4],
		);
	});

	it("unselects a gender that is no longer offered when the new pick excludes it", () => {
		expect(
			selectGenders({ catalog, previous: [99], next: [99, 7] }),
		).toEqual([7]);
	});

	it("passes an unselect through unchanged", () => {
		expect(selectGenders({ catalog, previous: [1, 2], next: [2] })).toEqual(
			[2],
		);
	});

	it("drops a saved Ask me on the next pick or unselect", () => {
		expect(
			selectGenders({
				catalog,
				previous: [GENDER_ASK_ME],
				next: [GENDER_ASK_ME, 2],
			}),
		).toEqual([2]);
		expect(
			selectGenders({
				catalog,
				previous: [GENDER_ASK_ME, 1],
				next: [GENDER_ASK_ME],
			}),
		).toEqual([]);
	});

	it("keeps ids missing from the catalog", () => {
		expect(
			selectGenders({ catalog, previous: [-1, 42], next: [-1, 42, 2] }),
		).toEqual([-1, 42, 2]);
	});
});
