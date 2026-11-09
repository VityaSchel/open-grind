import type {
	ProfileReportRequest,
	ReportLocation,
	ReportReason,
	RightNowPostId,
} from "#lib/model/safety/reports.ts";
import type { Profile } from "#lib/model/users/profiles.ts";

export type ReportTarget =
	| { kind: "profile"; profileId: Profile["profileId"] }
	| { kind: "message"; profileId: Profile["profileId"] }
	| {
			kind: "rightNowPost";
			postId: RightNowPostId;
			profileId: Profile["profileId"] | null;
	  };

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
