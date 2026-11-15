import { toast } from "svelte-sonner";

import { showErrorToast } from "#lib/api/error-toast.ts";
import { getRightNowPostReport } from "#lib/api/safety/reports.ts";
import { t } from "#lib/i18n/index.ts";
import { formatTimeRelativeCustom } from "#lib/util/format-time.ts";
import { Generation } from "#lib/util/generation.ts";
import type { RightNowPostId } from "#lib/model/safety/reports.ts";
import type { Profile } from "#lib/model/users/profiles.ts";
import type { ReportTarget } from "./report-request";

export class RightNowPostReportState {
	open = $state(false);
	target: ReportTarget | null = $state(null);

	readonly #checks = new Generation();

	async request({
		postId,
		profileId,
		beforeOpen,
	}: {
		postId: RightNowPostId;
		profileId: Profile["profileId"] | null;
		beforeOpen?: () => void;
	}): Promise<void> {
		const check = this.#checks.next();
		try {
			const earlier = await getRightNowPostReport({ postId, profileId });
			if (this.#checks.isStale(check)) return;
			if (earlier !== null) {
				toast(t("profile.report.rightNowPost.alreadyReported"), {
					description:
						earlier.createTime === null
							? t(
									"profile.report.rightNowPost.awaitingModeration",
								)
							: t(
									"profile.report.rightNowPost.awaitingModerationSince",
									{
										time: formatTimeRelativeCustom(
											earlier.createTime,
										),
									},
								),
				});
				return;
			}
		} catch (error) {
			console.error(error);
			if (!this.#checks.isStale(check))
				showErrorToast({
					label: t("profile.report.rightNowPost.errors.checkFailed"),
					error,
				});
			return;
		}
		beforeOpen?.();
		this.target = { kind: "rightNowPost", postId, profileId };
		this.open = true;
	}
}
