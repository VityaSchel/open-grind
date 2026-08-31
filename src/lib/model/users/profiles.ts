import z from "zod";

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

export const SexualPosition = {
	Top: 1,
	Bottom: 2,
	Versatile: 3,
	VersBottom: 4,
	VersTop: 5,
	Side: 6,
} as const;

export const sexualPositions = {
	[SexualPosition.Top]: "Top",
	[SexualPosition.Bottom]: "Bottom",
	[SexualPosition.Versatile]: "Versatile",
	[SexualPosition.VersBottom]: "Vers Bottom",
	[SexualPosition.VersTop]: "Vers Top",
	[SexualPosition.Side]: "Side",
};

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

export const lookingFor = {
	[LookingFor.Chat]: "Chat",
	[LookingFor.Dates]: "Dates",
	[LookingFor.Friends]: "Friends",
	[LookingFor.Networking]: "Networking",
	[LookingFor.Relationship]: "Relationship",
	[LookingFor.Hookups]: "Hookups",
} as const;

export const lookingForSchema = z.enum(LookingFor);

export type LookingForId = z.infer<typeof lookingForSchema>;

export const AcceptNSFWPics = {
	Never: 1,
	NotAtFirst: 2,
	YesPlease: 3,
} as const;

export const acceptNSFWPics = {
	[AcceptNSFWPics.Never]: "Never",
	[AcceptNSFWPics.NotAtFirst]: "Not At First",
	[AcceptNSFWPics.YesPlease]: "Yes Please",
} as const;

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

export const relationshipStatuses = {
	[RelationshipStatus.Single]: "Single",
	[RelationshipStatus.Dating]: "Dating",
	[RelationshipStatus.Exclusive]: "Exclusive",
	[RelationshipStatus.Committed]: "Committed",
	[RelationshipStatus.Partnered]: "Partnered",
	[RelationshipStatus.Engaged]: "Engaged",
	[RelationshipStatus.Married]: "Married",
	[RelationshipStatus.OpenRelationship]: "Open Relationship",
} as const;

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

export const bodyTypes = {
	[BodyType.Toned]: "Toned",
	[BodyType.Average]: "Average",
	[BodyType.Large]: "Large",
	[BodyType.Muscular]: "Muscular",
	[BodyType.Slim]: "Slim",
	[BodyType.Stocky]: "Stocky",
} as const;

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

export const tribes = {
	[Tribe.Bear]: "Bear",
	[Tribe.CleanCut]: "Clean-Cut",
	[Tribe.Daddy]: "Daddy",
	[Tribe.Discreet]: "Discreet",
	[Tribe.Geek]: "Geek",
	[Tribe.Jock]: "Jock",
	[Tribe.Leather]: "Leather",
	[Tribe.Otter]: "Otter",
	[Tribe.Poz]: "Poz",
	[Tribe.Rugged]: "Rugged",
	[Tribe.Sober]: "Sober",
	[Tribe.Trans]: "Trans",
	[Tribe.Twink]: "Twink",
} as const;

export const tribeSchema = z.enum(Tribe);

export type TribeId = z.infer<typeof tribeSchema>;

export const MeetAt = {
	MyPlace: 1,
	YourPlace: 2,
	Bar: 3,
	CoffeeShop: 4,
	Restaurant: 5,
} as const;

export const meetAt = {
	[MeetAt.MyPlace]: "My Place",
	[MeetAt.YourPlace]: "Your Place",
	[MeetAt.Bar]: "Bar",
	[MeetAt.CoffeeShop]: "Coffee Shop",
	[MeetAt.Restaurant]: "Restaurant",
} as const;

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

export const ethnicities = {
	[Ethnicity.Asian]: "Asian",
	[Ethnicity.Black]: "Black",
	[Ethnicity.Latino]: "Latino",
	[Ethnicity.MiddleEastern]: "Middle Eastern",
	[Ethnicity.Mixed]: "Mixed",
	[Ethnicity.NativeAmerican]: "Native American",
	[Ethnicity.White]: "White",
	[Ethnicity.Other]: "Other",
	[Ethnicity.SouthAsian]: "South Asian",
} as const;

export const ethnicitySchema = z.enum(Ethnicity);

export type EthnicityId = z.infer<typeof ethnicitySchema>;

export const HivStatus = {
	Negative: 1,
	NegativeOnPrep: 2,
	Positive: 3,
	PositiveUndetectable: 4,
} as const;

export const hivStatuses = {
	[HivStatus.Negative]: "Negative",
	[HivStatus.NegativeOnPrep]: "Negative, on PrEP",
	[HivStatus.Positive]: "Positive",
	[HivStatus.PositiveUndetectable]: "Positive, undetectable",
} as const;

export const hivStatusSchema = z.enum(HivStatus);

export type HivStatusId = z.infer<typeof hivStatusSchema>;

export const HealthPractice = {
	Condoms: 1,
	DoxyPEP: 2,
	PrEP: 3,
	HIVUndetectable: 4,
	PreferToDiscuss: 5,
} as const;

export const healthPractices = {
	[HealthPractice.Condoms]: "Condoms",
	[HealthPractice.DoxyPEP]: "I'm on doxyPEP",
	[HealthPractice.PrEP]: "I'm on PrEP",
	[HealthPractice.HIVUndetectable]: "I'm HIV undetectable",
	[HealthPractice.PreferToDiscuss]: "Prefer to discuss",
} as const;

export const UnsettableHealthPractice = { Sober: 6, DrugFree: 7 } as const;

export const healthPracticeLabels = {
	...healthPractices,
	[UnsettableHealthPractice.Sober]: "Sober",
	[UnsettableHealthPractice.DrugFree]: "Drug-Free",
} as const;

export const healthPracticesSchema = z.enum(HealthPractice);

export type HealthPracticeId = z.infer<typeof healthPracticesSchema>;

export const Vaccine = { COVID19: 1, Monkeypox: 2, Meningitis: 3 } as const;

export const vaccines = {
	[Vaccine.COVID19]: "COVID-19",
	[Vaccine.Monkeypox]: "Monkeypox",
	[Vaccine.Meningitis]: "Meningitis",
} as const;

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
