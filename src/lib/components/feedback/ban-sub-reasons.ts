import { type MessageKey, t } from "$lib/i18n";
import {
	type BanSubReason,
	banSubReasonSchema,
} from "$lib/model/authentication";

const labelKeys = {
	UNDERAGE_ACCESS: "feedback.accountStatus.banReason.underageAccess",
	UNDERAGE_IMPERSONATION:
		"feedback.accountStatus.banReason.underageImpersonation",
	CHILD_ENDANGERMENT: "feedback.accountStatus.banReason.childEndangerment",
	UNWANTED_MESSAGING: "feedback.accountStatus.banReason.unwantedMessaging",
	PROFILE_SPAM: "feedback.accountStatus.banReason.profileSpam",
	PHISHING_AND_FRAUD: "feedback.accountStatus.banReason.phishingAndFraud",
	BOT_ACTIVITY: "feedback.accountStatus.banReason.botActivity",
	DRUG_SALES: "feedback.accountStatus.banReason.drugSales",
	FREQUENT_DRUG_SOLICITATION:
		"feedback.accountStatus.banReason.frequentDrugSolicitation",
	OCCASIONAL_DRUG_SOLICITATION:
		"feedback.accountStatus.banReason.occasionalDrugSolicitation",
	DRUG_PROMOTION: "feedback.accountStatus.banReason.drugPromotion",
	NON_ILLICIT_SUBSTANCES:
		"feedback.accountStatus.banReason.nonIllicitSubstances",
	PAID_SEXUAL_SERVICES: "feedback.accountStatus.banReason.paidSexualServices",
	MILD_SOLICITATION: "feedback.accountStatus.banReason.mildSolicitation",
	SALE_OF_SEXUAL_CONTENT:
		"feedback.accountStatus.banReason.saleOfSexualContent",
	MILD_INSULTS: "feedback.accountStatus.banReason.mildInsults",
	BULLYING: "feedback.accountStatus.banReason.bullying",
	HATE_SPEECH: "feedback.accountStatus.banReason.hateSpeech",
	BLACKMAIL_AND_THREATS:
		"feedback.accountStatus.banReason.blackmailAndThreats",
	PRIVACY_VIOLATIONS: "feedback.accountStatus.banReason.privacyViolations",
	IMPERSONATION: "feedback.accountStatus.banReason.impersonation",
	CONSENT_VIOLATIONS: "feedback.accountStatus.banReason.consentViolations",
	OFFLINE_INCIDENTS: "feedback.accountStatus.banReason.offlineIncidents",
	GENERAL_ADVERTISING: "feedback.accountStatus.banReason.generalAdvertising",
	BUSINESS_SOLICITATION:
		"feedback.accountStatus.banReason.businessSolicitation",
	TRANSACTIONAL_SERVICES:
		"feedback.accountStatus.banReason.transactionalServices",
	SCAMS_AND_PROMOTIONS: "feedback.accountStatus.banReason.scamsAndPromotions",
	DRUG_SEEKING: "feedback.accountStatus.banReason.drugSeeking",
	DRUG_FACILITATION: "feedback.accountStatus.banReason.drugFacilitation",
	NON_CONSENSUAL_INTIMATE_IMAGERY:
		"feedback.accountStatus.banReason.nonConsensualIntimateImagery",
	SEXTORTION: "feedback.accountStatus.banReason.sextortion",
	BLOCK_DECISION: null,
	Other: null,
} as const satisfies Record<BanSubReason, MessageKey | null>;

const appealableTimedBans = new Set<BanSubReason>([
	"UNDERAGE_ACCESS",
	"UNDERAGE_IMPERSONATION",
	"CHILD_ENDANGERMENT",
	"PHISHING_AND_FRAUD",
	"BOT_ACTIVITY",
	"DRUG_SALES",
	"PAID_SEXUAL_SERVICES",
	"BLACKMAIL_AND_THREATS",
	"PRIVACY_VIOLATIONS",
	"IMPERSONATION",
	"OFFLINE_INCIDENTS",
	"SCAMS_AND_PROMOTIONS",
]);

function parse(subReason: string | null | undefined): BanSubReason | null {
	const parsed = banSubReasonSchema.safeParse(subReason);
	return parsed.success ? parsed.data : null;
}

export function banSubReasonLabel(
	subReason: string | null | undefined,
): string | null {
	const known = parse(subReason);
	const key = known && labelKeys[known];
	return key ? t(key) : null;
}

export function banOffersAppeal(subReason: string | null | undefined): boolean {
	return parse(subReason) !== "BLOCK_DECISION";
}

export function timedBanOffersAppeal(
	subReason: string | null | undefined,
): boolean {
	const known = parse(subReason);
	return known !== null && appealableTimedBans.has(known);
}
