import type {
	ProfileReportRequest,
	ReportLocation,
	ReportReason,
} from "#lib/model/safety/reports.ts";

export function buildProfileReport({
	reason,
	comment,
	locations,
}: {
	reason: ReportReason;
	comment: string;
	locations: ReportLocation[];
}): ProfileReportRequest {
	if (reason === "SPAM")
		return { reason, comment: "", locations: ["CHAT_MESSAGE"] };
	return { reason, comment: comment.trim(), locations };
}
