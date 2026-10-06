import z from "zod";

import { translatedLabels } from "$lib/i18n/labels";
import { tapTypeOrNoneSchema } from "$lib/model/interest/taps";
import { viewSourceEnumSchema } from "$lib/model/interest/view-source";
import { mediaHashPublicSchema } from "$lib/model/media";
import {
	rightNowShareLocationSchema,
	rightNowStatusSchema,
} from "$lib/model/right-now";
import {
	knownValueOr,
	knownValueOrNull,
	serverDefault,
} from "$lib/model/tolerance";
import { unmodeledSchema } from "$lib/model/types";
import type { MessageKey } from "$lib/i18n";

export const SexualPosition = {
	Top: 1,
	Bottom: 2,
	Versatile: 3,
	VersBottom: 4,
	VersTop: 5,
	Side: 6,
} as const;

const sexualPositionKeys = {
	[SexualPosition.Top]: "profile.sexualPosition.top",
	[SexualPosition.Bottom]: "profile.sexualPosition.bottom",
	[SexualPosition.Versatile]: "profile.sexualPosition.versatile",
	[SexualPosition.VersBottom]: "profile.sexualPosition.versBottom",
	[SexualPosition.VersTop]: "profile.sexualPosition.versTop",
	[SexualPosition.Side]: "profile.sexualPosition.side",
} as const satisfies Record<SexualPositionId, MessageKey>;

export const sexualPositions = translatedLabels(sexualPositionKeys);

export const sexualPositionSchema = z.enum(SexualPosition);

export type SexualPositionId = z.infer<typeof sexualPositionSchema>;

export const LookingFor = {
	Chat: 2,
	Dates: 3,
	Friends: 4,
	Networking: 5,
	Relationship: 6,
	Hookups: 7,
} as const;

const lookingForKeys = {
	[LookingFor.Chat]: "profile.lookingFor.chat",
	[LookingFor.Dates]: "profile.lookingFor.dates",
	[LookingFor.Friends]: "profile.lookingFor.friends",
	[LookingFor.Networking]: "profile.lookingFor.networking",
	[LookingFor.Relationship]: "profile.lookingFor.relationship",
	[LookingFor.Hookups]: "profile.lookingFor.hookups",
} as const satisfies Record<LookingForId, MessageKey>;

export const lookingFor = translatedLabels(lookingForKeys);

export const lookingForSchema = z.enum(LookingFor);

export type LookingForId = z.infer<typeof lookingForSchema>;

export const AcceptNSFWPics = {
	Never: 1,
	NotAtFirst: 2,
	YesPlease: 3,
} as const;

const acceptNSFWPicsKeys = {
	[AcceptNSFWPics.Never]: "profile.acceptNsfwPics.never",
	[AcceptNSFWPics.NotAtFirst]: "profile.acceptNsfwPics.notAtFirst",
	[AcceptNSFWPics.YesPlease]: "profile.acceptNsfwPics.yesPlease",
} as const satisfies Record<AcceptNSFWPicsId, MessageKey>;

export const acceptNSFWPics = translatedLabels(acceptNSFWPicsKeys);

export const acceptNSFWPicsSchema = z.enum(AcceptNSFWPics);

export type AcceptNSFWPicsId = z.infer<typeof acceptNSFWPicsSchema>;

export const RelationshipStatus = {
	Single: 1,
	Dating: 2,
	Exclusive: 3,
	Committed: 4,
	Partnered: 5,
	Engaged: 6,
	Married: 7,
	OpenRelationship: 8,
} as const;

const relationshipStatusKeys = {
	[RelationshipStatus.Single]: "profile.relationshipStatus.single",
	[RelationshipStatus.Dating]: "profile.relationshipStatus.dating",
	[RelationshipStatus.Exclusive]: "profile.relationshipStatus.exclusive",
	[RelationshipStatus.Committed]: "profile.relationshipStatus.committed",
	[RelationshipStatus.Partnered]: "profile.relationshipStatus.partnered",
	[RelationshipStatus.Engaged]: "profile.relationshipStatus.engaged",
	[RelationshipStatus.Married]: "profile.relationshipStatus.married",
	[RelationshipStatus.OpenRelationship]:
		"profile.relationshipStatus.openRelationship",
} as const satisfies Record<RelationshipStatusId, MessageKey>;

export const relationshipStatuses = translatedLabels(relationshipStatusKeys);

export const relationshipStatusSchema = z.enum(RelationshipStatus);

export type RelationshipStatusId = z.infer<typeof relationshipStatusSchema>;

export const BodyType = {
	Toned: 1,
	Average: 2,
	Large: 3,
	Muscular: 4,
	Slim: 5,
	Stocky: 6,
} as const;

const bodyTypeKeys = {
	[BodyType.Toned]: "profile.bodyType.toned",
	[BodyType.Average]: "profile.bodyType.average",
	[BodyType.Large]: "profile.bodyType.large",
	[BodyType.Muscular]: "profile.bodyType.muscular",
	[BodyType.Slim]: "profile.bodyType.slim",
	[BodyType.Stocky]: "profile.bodyType.stocky",
} as const satisfies Record<BodyTypeId, MessageKey>;

export const bodyTypes = translatedLabels(bodyTypeKeys);

export const bodyTypeSchema = z.enum(BodyType);

export type BodyTypeId = z.infer<typeof bodyTypeSchema>;

export const Tribe = {
	Bear: 1,
	CleanCut: 2,
	Daddy: 3,
	Discreet: 4,
	Geek: 5,
	Jock: 6,
	Leather: 7,
	Otter: 8,
	Poz: 9,
	Rugged: 10,
	Trans: 11,
	Twink: 12,
	Sober: 13,
} as const;

const tribeKeys = {
	[Tribe.Bear]: "profile.tribe.bear",
	[Tribe.CleanCut]: "profile.tribe.cleanCut",
	[Tribe.Daddy]: "profile.tribe.daddy",
	[Tribe.Discreet]: "profile.tribe.discreet",
	[Tribe.Geek]: "profile.tribe.geek",
	[Tribe.Jock]: "profile.tribe.jock",
	[Tribe.Leather]: "profile.tribe.leather",
	[Tribe.Otter]: "profile.tribe.otter",
	[Tribe.Poz]: "profile.tribe.poz",
	[Tribe.Rugged]: "profile.tribe.rugged",
	[Tribe.Sober]: "profile.tribe.sober",
	[Tribe.Trans]: "profile.tribe.trans",
	[Tribe.Twink]: "profile.tribe.twink",
} as const satisfies Record<TribeId, MessageKey>;

export const tribes = translatedLabels(tribeKeys);

export const tribeSchema = z.enum(Tribe);

export type TribeId = z.infer<typeof tribeSchema>;

export const MeetAt = {
	MyPlace: 1,
	YourPlace: 2,
	Bar: 3,
	CoffeeShop: 4,
	Restaurant: 5,
} as const;

const meetAtKeys = {
	[MeetAt.MyPlace]: "profile.meetAt.myPlace",
	[MeetAt.YourPlace]: "profile.meetAt.yourPlace",
	[MeetAt.Bar]: "profile.meetAt.bar",
	[MeetAt.CoffeeShop]: "profile.meetAt.coffeeShop",
	[MeetAt.Restaurant]: "profile.meetAt.restaurant",
} as const satisfies Record<MeetAtId, MessageKey>;

export const meetAt = translatedLabels(meetAtKeys);

export const meetAtSchema = z.enum(MeetAt);

export type MeetAtId = z.infer<typeof meetAtSchema>;

export const Ethnicity = {
	Asian: 1,
	Black: 2,
	Latino: 3,
	MiddleEastern: 4,
	Mixed: 5,
	NativeAmerican: 6,
	White: 7,
	Other: 8,
	SouthAsian: 9,
} as const;

const ethnicityKeys = {
	[Ethnicity.Asian]: "profile.ethnicity.asian",
	[Ethnicity.Black]: "profile.ethnicity.black",
	[Ethnicity.Latino]: "profile.ethnicity.latino",
	[Ethnicity.MiddleEastern]: "profile.ethnicity.middleEastern",
	[Ethnicity.Mixed]: "profile.ethnicity.mixed",
	[Ethnicity.NativeAmerican]: "profile.ethnicity.nativeAmerican",
	[Ethnicity.White]: "profile.ethnicity.white",
	[Ethnicity.Other]: "profile.ethnicity.other",
	[Ethnicity.SouthAsian]: "profile.ethnicity.southAsian",
} as const satisfies Record<EthnicityId, MessageKey>;

export const ethnicities = translatedLabels(ethnicityKeys);

export const ethnicitySchema = z.enum(Ethnicity);

export type EthnicityId = z.infer<typeof ethnicitySchema>;

export const HivStatus = {
	Negative: 1,
	NegativeOnPrep: 2,
	Positive: 3,
	PositiveUndetectable: 4,
} as const;

const hivStatusKeys = {
	[HivStatus.Negative]: "profile.hivStatus.negative",
	[HivStatus.NegativeOnPrep]: "profile.hivStatus.negativeOnPrep",
	[HivStatus.Positive]: "profile.hivStatus.positive",
	[HivStatus.PositiveUndetectable]: "profile.hivStatus.positiveUndetectable",
} as const satisfies Record<HivStatusId, MessageKey>;

export const hivStatuses = translatedLabels(hivStatusKeys);

export const UnsettableHivStatus = { PreferToDiscuss: 5 } as const;

const hivStatusLabelKeys = {
	...hivStatusKeys,
	[UnsettableHivStatus.PreferToDiscuss]: "profile.hivStatus.preferToDiscuss",
} as const satisfies Record<
	| HivStatusId
	| (typeof UnsettableHivStatus)[keyof typeof UnsettableHivStatus],
	MessageKey
>;

export const hivStatusLabels = translatedLabels(hivStatusLabelKeys);

export const hivStatusSchema = z.enum(HivStatus);

export type HivStatusId = z.infer<typeof hivStatusSchema>;

export const HealthPractice = {
	Condoms: 1,
	DoxyPEP: 2,
	PrEP: 3,
	HIVUndetectable: 4,
	PreferToDiscuss: 5,
} as const;

const healthPracticeKeys = {
	[HealthPractice.Condoms]: "profile.healthPractice.condoms",
	[HealthPractice.DoxyPEP]: "profile.healthPractice.doxyPep",
	[HealthPractice.PrEP]: "profile.healthPractice.prep",
	[HealthPractice.HIVUndetectable]: "profile.healthPractice.hivUndetectable",
	[HealthPractice.PreferToDiscuss]: "profile.healthPractice.preferToDiscuss",
} as const satisfies Record<HealthPracticeId, MessageKey>;

export const healthPractices = translatedLabels(healthPracticeKeys);

export const UnsettableHealthPractice = { Sober: 6, DrugFree: 7 } as const;

const healthPracticeLabelKeys = {
	...healthPracticeKeys,
	[UnsettableHealthPractice.Sober]: "profile.healthPractice.sober",
	[UnsettableHealthPractice.DrugFree]: "profile.healthPractice.drugFree",
} as const satisfies Record<
	| HealthPracticeId
	| (typeof UnsettableHealthPractice)[keyof typeof UnsettableHealthPractice],
	MessageKey
>;

export const healthPracticeLabels = translatedLabels(healthPracticeLabelKeys);

export const healthPracticesSchema = z.enum(HealthPractice);

export type HealthPracticeId = z.infer<typeof healthPracticesSchema>;

export const Vaccine = { COVID19: 1, Monkeypox: 2, Meningitis: 3 } as const;

const vaccineKeys = {
	[Vaccine.COVID19]: "profile.vaccine.covid19",
	[Vaccine.Monkeypox]: "profile.vaccine.monkeypox",
	[Vaccine.Meningitis]: "profile.vaccine.meningitis",
} as const satisfies Record<VaccineId, MessageKey>;

export const vaccines = translatedLabels(vaccineKeys);

export const vaccinesSchema = z.enum(Vaccine);

export type VaccineId = z.infer<typeof vaccinesSchema>;

export const socialNetworksSchema = z.object({
	twitter: z.object({ userId: z.string().nullable() }).optional(),
	facebook: z.object({ userId: z.string().nullable() }).optional(),
	instagram: z.object({ userId: z.string().nullable() }).optional(),
});

export type SocialNetworks = z.infer<typeof socialNetworksSchema>;

export const rightNowMediaSchema = z.object({
	mediaId: z.int(),
	thumbnailUrl: z.string(),
	fullImageUrl: z.string(),
	contentType: z.string(),
	isNsfw: z.boolean(),
});

export type RightNowMedia = z.infer<typeof rightNowMediaSchema>;

export const travelPlanSchema = z.object({
	endDate: z.number().nullable(),
	geohash: z.string(),
	travelPlanId: z.int().nullable(),
	locationName: z.string(),
	showOnProfile: z.boolean().nullable(),
	startDate: z.number().nullable(),
});

export type TravelPlan = z.infer<typeof travelPlanSchema>;

export const profileMaskedMinSchema = z.object({
	distance: z.number().nonnegative().nullable().default(null),
	profileImageMediaHash: mediaHashPublicSchema.nullable().default(null),
	isFavorite: serverDefault({ value: z.boolean(), fallback: false }),
});

export const profileMaskedSchema = profileMaskedMinSchema.extend({
	lastViewed: z.number().nullable().default(null),
	seen: z.int().nonnegative().nullable().default(null),
	rightNow: knownValueOr({
		value: rightNowStatusSchema,
		fallback: "NOT_ACTIVE",
		label: "profile rightNow",
	}),
	sexualPosition: z.int().nullable().optional(),
	foundVia: knownValueOrNull({
		value: viewSourceEnumSchema,
		label: "profile foundVia",
	}).optional(),
});

export const profileMinSchema = z.object({
	profileId: z.coerce.number().int().nonnegative(),
	displayName: z.string().nullable().default(null),
	onlineUntil: z.number().nullable().optional(),
});

export const PROFILE_PHOTO_AWAITING_REVIEW = 0;

export const profileShortSchema = profileMaskedSchema
	.extend(profileMinSchema.shape)
	.extend({
		age: z.int().nonnegative().nullable().default(null),
		showAge: serverDefault({ value: z.boolean(), fallback: false }),
		showDistance: serverDefault({ value: z.boolean(), fallback: false }),
		approximateDistance: serverDefault({
			value: z.boolean(),
			fallback: false,
		}),
		lastChatTimestamp: z.number().nullable().default(null),
		isNew: serverDefault({ value: z.boolean(), fallback: false }),
		lastUpdatedTime: z.number().nonnegative().nullable().default(null),
		medias: serverDefault({
			value: z.array(
				z.object({
					mediaHash: mediaHashPublicSchema,
					type: z.int().nonnegative(),
					state: z.int().nonnegative(),
					reason: z.string().nullable(),
					takenOnGrindr: z.boolean().nullable(),
					createdAt: z.number().nonnegative().nullable(),
				}),
			),
			fallback: [],
		}),
	});

export const profileFieldsSchema = z.object({
	meetAt: z.array(z.int()).optional(),
	vaccines: z.array(z.int()).optional(),
	genders: z.array(z.int().nonnegative()).nullable().optional(),
	pronouns: z.array(z.int().nonnegative()).nullable().optional(),
});

export const profileRightNowSchema = z.object({
	rightNowText: z.string().nullable().default(null),
	rightNowPosted: z.number().nullable().default(null),
	rightNowDistance: z.number().nullable().default(null),
	rightNowThumbnailUrl: z.string().nullable().default(null),
	rightNowFullImageUrl: z.string().nullable().default(null),
});

export const profileExtraFields = z.object({
	nsfw: z.int().nullable().default(null),
	verifiedInstagramId: z.string().nullable().default(null),
	isBlockable: z.boolean().nullable().default(null),
	showTribes: serverDefault({ value: z.boolean(), fallback: false }),
	showPosition: serverDefault({ value: z.boolean(), fallback: false }),
});

export const profileSchema = profileShortSchema
	.extend(profileFieldsSchema.shape)
	.extend(profileRightNowSchema.shape)
	.extend(profileExtraFields.shape)
	.extend({
		aboutMe: z.string().nullable().default(null),
		ethnicity: z.int().nullable().default(null),
		relationshipStatus: z.int().nullable().default(null),
		grindrTribes: serverDefault({ value: z.array(z.int()), fallback: [] }),
		lookingFor: serverDefault({ value: z.array(z.int()), fallback: [] }),
		bodyType: z.int().nullable().default(null),
		hivStatus: z.int().nullable().default(null),
		lastTestedDate: z.number().nullable().default(null),
		height: z.number().nullable().default(null),
		weight: z.number().nullable().default(null),
		socialNetworks: serverDefault({
			value: socialNetworksSchema,
			fallback: {},
		}),
		identity: unmodeledSchema,
		hashtags: unmodeledSchema,
		profileTags: serverDefault({
			value: z.array(z.string()),
			fallback: [],
		}),
		tapped: serverDefault({ value: z.boolean(), fallback: false }),
		tapType: knownValueOrNull({
			value: tapTypeOrNoneSchema,
			label: "profile tapType",
		}),
		lastReceivedTapTimestamp: z.number().nullable().default(null),
		isTeleporting: serverDefault({ value: z.boolean(), fallback: false }),
		isRoaming: serverDefault({ value: z.boolean(), fallback: false }),
		arrivalDays: z.number().nullable().default(null),
		unreadCount: serverDefault({ value: z.number(), fallback: 0 }),
		lastThrobTimestamp: unmodeledSchema,
		sexualHealth: serverDefault({ value: z.array(z.int()), fallback: [] }),
		isVisiting: serverDefault({ value: z.boolean(), fallback: false }),
		travelPlans: serverDefault({
			value: z.array(travelPlanSchema),
			fallback: [],
		}),
		isInAList: serverDefault({ value: z.boolean(), fallback: false }),
		tribesImInto: z.array(z.int()).nullable().default(null),
		showVipBadge: serverDefault({ value: z.boolean(), fallback: false }),
		rightNowShareLocation: knownValueOrNull({
			value: rightNowShareLocationSchema,
			label: "profile rightNowShareLocation",
		}),
		rightNowMedias: serverDefault({
			value: z.array(rightNowMediaSchema),
			fallback: [],
		}),
	});

export type Profile = z.infer<typeof profileSchema>;
