import {
	isFilterableGender,
	isFilterableGenderId,
} from "$lib/model/browse/grid/filters";
import type { Gender } from "$lib/model/users/genders";

type GenderChip = Pick<
	Gender,
	"genderId" | "displayGroup" | "excludeOnFilterSelection"
>;

export function isGenderChipShown({
	gender,
	selected,
	expanded,
}: {
	gender: GenderChip;
	selected: number[];
	expanded: boolean;
}): boolean {
	if (!isFilterableGenderId(gender.genderId)) return false;
	if (selected.includes(gender.genderId)) return true;
	if (!isFilterableGender(gender)) return false;
	const excludedBy = gender.excludeOnFilterSelection ?? [];
	if (selected.some((id) => excludedBy.includes(id))) return false;
	return expanded || gender.displayGroup === 1;
}

export function selectGenders({
	catalog,
	previous,
	next,
}: {
	catalog: GenderChip[];
	previous: number[];
	next: number[];
}): number[] {
	const added = next.filter((id) => !previous.includes(id));
	return next.filter((id) => {
		if (!isFilterableGenderId(id)) return false;
		if (added.includes(id)) return true;
		const excludedBy =
			catalog.find((gender) => gender.genderId === id)
				?.excludeOnFilterSelection ?? [];
		return !excludedBy.some((excluded) => added.includes(excluded));
	});
}
