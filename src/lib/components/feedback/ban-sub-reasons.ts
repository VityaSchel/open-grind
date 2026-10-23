import {
	type BanSubReason,
	banSubReasonSchema,
} from "$lib/model/authentication";

const labels: Record<BanSubReason, string | null> = {
	UNDERAGE_ACCESS: "Underage access",
	UNDERAGE_IMPERSONATION: "Underage impersonation",
	CHILD_ENDANGERMENT: "Child protection and endangerment",
	UNWANTED_MESSAGING: "Repeated or unwanted messaging",
	PROFILE_SPAM: "Profile spam and advertising",
	PHISHING_AND_FRAUD: "Phishing, fraud, and harmful links",
	BOT_ACTIVITY: "Automated/bot activity",
	DRUG_SALES: "Drug sale and distribution",
	FREQUENT_DRUG_SOLICITATION: "Frequent drug solicitation",
	OCCASIONAL_DRUG_SOLICITATION: "Occasional drug solicitation",
	DRUG_PROMOTION: "Drug promotion or glorification drug solicitation",
	NON_ILLICIT_SUBSTANCES:
		"Casual mentions of legal or non-illicit substances and symbols",
	PAID_SEXUAL_SERVICES: "Paid sexual services",
	MILD_SOLICITATION: "Mild solicitation and casual offers",
	SALE_OF_SEXUAL_CONTENT: "Sale of sexually explicit content",
	MILD_INSULTS: "Mild insults and disrespect",
	BULLYING: "Targeted bullying and repeated abuse",
	HATE_SPEECH: "Hate speech and offensive content",
	BLACKMAIL_AND_THREATS: "Blackmail, extortion, and direct threats",
	PRIVACY_VIOLATIONS: "Privacy violations and doxxing",
	IMPERSONATION: "Impersonation and identity misuse",
	CONSENT_VIOLATIONS: "Consent violations",
	OFFLINE_INCIDENTS: "Serious offline incidents",
	GENERAL_ADVERTISING: "General advertising and solicitation",
	BUSINESS_SOLICITATION: "Business solicitation",
	TRANSACTIONAL_SERVICES: "Transactional services",
	SCAMS_AND_PROMOTIONS: "Scam and fraudulent promotions",
	DRUG_SEEKING: "Drug seeking",
	DRUG_FACILITATION: "Drug facilitation",
	NON_CONSENSUAL_INTIMATE_IMAGERY: "Non-consensual intimate imagery",
	SEXTORTION: "Sextortion",
	BLOCK_DECISION: null,
	Other: null,
};

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
	return known && labels[known];
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
