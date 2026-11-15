import { isAssignmentOn } from "#lib/api/analytics/assignments.ts";
import { ApiError } from "#lib/api/api-error.ts";
import { callMethod } from "#lib/api/methods.ts";
import { fetchRest } from "#lib/api/transport.ts";
import {
	type ProfileReportRequest,
	type ProfileReportRequestV2,
	type RightNowPostId,
	type RightNowPostReportRequest,
	rightNowPostSubmittedReportResponseSchema,
	type SubmittedReport,
	submittedReportSchema,
} from "#lib/model/safety/reports.ts";
import type { Profile } from "#lib/model/users/profiles.ts";

const RIGHT_NOW_MODERATION = "right-now-moderation";

function refusedByServer(error: unknown): boolean {
	if (!(error instanceof ApiError) || error.response === null) return false;
	const { status } = error.response;
	return status >= 400 && status < 500;
}

async function submittedReportAt(
	path: string,
): Promise<SubmittedReport | null> {
	const res = await fetchRest(path);
	if (res.status === 404) return null;
	return res.jsonParsed(submittedReportSchema);
}

export function getProfileReportV31({
	profileId,
}: {
	profileId: Profile["profileId"];
}): Promise<SubmittedReport | null> {
	return submittedReportAt(`/v3.1/flags/${profileId}`);
}

export function getProfileReportV4({
	profileId,
}: {
	profileId: Profile["profileId"];
}): Promise<SubmittedReport | null> {
	return submittedReportAt(`/v4/flags/${profileId}`);
}

export async function reportProfileV31({
	profileId,
	report,
}: {
	profileId: Profile["profileId"];
	report: ProfileReportRequest;
}) {
	await fetchRest(`/v3.1/flags/${profileId}`, {
		method: "POST",
		body: report,
	}).then((res) => res.assertOk());
}

export async function reportProfileV4({
	profileId,
	report,
}: {
	profileId: Profile["profileId"];
	report: ProfileReportRequest;
}) {
	await fetchRest(`/v4/flags/${profileId}`, {
		method: "POST",
		body: report,
	}).then((res) => res.assertOk());
}

export async function reportProfileV5({
	profileId,
	report,
}: {
	profileId: Profile["profileId"];
	report: ProfileReportRequestV2;
}) {
	await fetchRest(`/v5/flags/${profileId}`, {
		method: "POST",
		body: report,
	}).then((res) => res.assertOk());
}

export async function getRightNowPostReportV1({
	postId,
}: {
	postId: RightNowPostId;
}): Promise<SubmittedReport | null> {
	const res = await fetchRest(`/v1/flags/right-now/${postId}`);
	if (res.status === 404) return null;
	return res.jsonParsed(rightNowPostSubmittedReportResponseSchema).flagReport;
}

export async function reportRightNowPostV1({
	postId,
	report,
}: {
	postId: RightNowPostId;
	report: RightNowPostReportRequest;
}) {
	await fetchRest(`/v1/flags/right-now/${postId}`, {
		method: "POST",
		body: report,
	}).then((res) => res.assertOk());
}

export async function getProfileReport({
	profileId,
}: {
	profileId: Profile["profileId"];
}): Promise<SubmittedReport | null> {
	return (await isAssignmentOn({ key: RIGHT_NOW_MODERATION }))
		? await getProfileReportV4({ profileId })
		: await getProfileReportV31({ profileId });
}

export async function reportProfile({
	profileId,
	report,
}: {
	profileId: Profile["profileId"];
	report: ProfileReportRequest;
}) {
	if (!(await isAssignmentOn({ key: RIGHT_NOW_MODERATION }))) {
		await reportProfileV31({ profileId, report });
		return;
	}
	const captchaToken = await callMethod("mint_recaptcha_token", {
		action: "report",
	}).catch(() => null);
	if (captchaToken === null) {
		await reportProfileV31({ profileId, report });
		return;
	}
	try {
		await reportProfileV5({
			profileId,
			report: { ...report, captchaToken },
		});
	} catch (error) {
		if (!refusedByServer(error)) throw error;
		await reportProfileV31({ profileId, report });
	}
}

export function getRightNowPostReport({
	postId,
	profileId,
}: {
	postId: RightNowPostId;
	profileId: Profile["profileId"] | null;
}): Promise<SubmittedReport | null> {
	return profileId === null
		? getRightNowPostReportV1({ postId })
		: getProfileReport({ profileId });
}

export async function reportRightNowPost({
	postId,
	profileId,
	report,
}: {
	postId: RightNowPostId;
	profileId: Profile["profileId"] | null;
	report: RightNowPostReportRequest;
}) {
	if (profileId === null) {
		await reportRightNowPostV1({ postId, report });
		return;
	}
	await reportProfile({
		profileId,
		report: { ...report, rightNowInfo: { postId } },
	});
}
