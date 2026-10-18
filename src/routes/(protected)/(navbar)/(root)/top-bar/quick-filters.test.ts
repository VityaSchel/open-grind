import { describe, expect, it } from "vitest";

import {
	defaultFilters,
	FilterAcceptNSFWPics,
	FilterBodyType,
	FilterHealthPractice,
	FilterLookingFor,
	FilterMeetAt,
	FilterRelationshipStatus,
	HEIGHT_CM_MAX,
	WEIGHT_KG_MAX,
} from "$lib/model/browse/grid/filters";
import { SexualPosition, Tribe } from "$lib/model/users/profiles";
import { sentFilterKeysWithoutQuickFilter } from "./quick-filters";

describe("sentFilterKeysWithoutQuickFilter", () => {
	it("lists nothing for the defaults", () => {
		expect(
			sentFilterKeysWithoutQuickFilter({
				filters: defaultFilters,
				genderFilterFlag: false,
			}),
		).toEqual([]);
	});

	it("leaves out every filter the top bar already shows", () => {
		expect(
			sentFilterKeysWithoutQuickFilter({
				filters: {
					...defaultFilters,
					isOnline: true,
					isRightNow: true,
					isFresh: true,
					ageEnabled: true,
					age: [25, 40],
					positionEnabled: true,
					positions: [SexualPosition.Top],
				},
				genderFilterFlag: false,
			}),
		).toEqual([]);
	});

	it("lists favorites, which only the sheet can turn on", () => {
		expect(
			sentFilterKeysWithoutQuickFilter({
				filters: { ...defaultFilters, isFavorite: true },
				genderFilterFlag: false,
			}),
		).toEqual(["favorites"]);
	});

	it("lists every sheet filter and no quick one when all of them are on", () => {
		expect(
			sentFilterKeysWithoutQuickFilter({
				filters: {
					isFavorite: true,
					isOnline: true,
					isRightNow: true,
					isFresh: true,
					ageEnabled: true,
					age: [25, 40],
					genderEnabled: true,
					genders: [1],
					tagsEnabled: true,
					tags: ["bear"],
					positionEnabled: true,
					positions: [SexualPosition.Top],
					photosEnabled: true,
					photos: ["has-photos", "has-face-pics", "has-albums"],
					tribesEnabled: true,
					tribes: [Tribe.Bear],
					tribesImIntoEnabled: true,
					tribesImInto: [Tribe.Bear],
					bodyTypesEnabled: true,
					bodyTypes: [FilterBodyType.NotSpecified],
					heightEnabled: true,
					height: [170, HEIGHT_CM_MAX],
					weightEnabled: true,
					weight: [60, WEIGHT_KG_MAX],
					relationshipStatusesEnabled: true,
					relationshipStatuses: [
						FilterRelationshipStatus.NotSpecified,
					],
					acceptNSFWPicsEnabled: true,
					acceptNSFWPics: [FilterAcceptNSFWPics.NotSpecified],
					lookingForEnabled: true,
					lookingFor: [FilterLookingFor.NotSpecified],
					meetAtEnabled: true,
					meetAt: [FilterMeetAt.NotSpecified],
					haventChattedTodayEnabled: true,
					healthPracticesEnabled: true,
					healthPractices: [FilterHealthPractice.NotSpecified],
				},
				genderFilterFlag: false,
			}),
		).toEqual([
			"favorites",
			"genders",
			"photoOnly",
			"hasAlbum",
			"faceOnly",
			"tribes",
			"tribesImInto",
			"bodyTypes",
			"heightCmMin",
			"heightCmMax",
			"weightGramsMin",
			"weightGramsMax",
			"relationshipStatuses",
			"nsfwPics",
			"lookingFor",
			"meetAt",
			"notRecentlyChatted",
			"sexualHealth",
			"tags",
		]);
	});

	it("ignores a sheet filter that is switched off but keeps its values", () => {
		expect(
			sentFilterKeysWithoutQuickFilter({
				filters: {
					...defaultFilters,
					tribes: [Tribe.Bear],
					height: [170, 190],
				},
				genderFilterFlag: false,
			}),
		).toEqual([]);
	});

	it("ignores a sheet filter that is on but sends nothing", () => {
		expect(
			sentFilterKeysWithoutQuickFilter({
				filters: {
					...defaultFilters,
					tribesEnabled: true,
					tribes: [Tribe.Trans],
				},
				genderFilterFlag: true,
			}),
		).toEqual([]);
	});
});
