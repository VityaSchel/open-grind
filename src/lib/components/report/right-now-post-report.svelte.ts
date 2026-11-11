import { toast } from "svelte-sonner";

import { showErrorToast } from "#lib/api/error-toast.ts";
import { getRightNowPostReport } from "#lib/api/safety/reports.ts";
import { formatTimeRelativeCustom } from "#lib/util/format-time.ts";
import type { RightNowPostId } from "#lib/model/safety/reports.ts";
import type { Profile } from "#lib/model/users/profiles.ts";
import type { ReportTarget } from "./report-request";

export class RightNowPostReport {
	open = $state(false);
	target: ReportTarget | null = $state(null);

	#latestCheck = 0;

	async request({
		postId,
		profileId,
		beforeOpen,
	}: {
		postId: RightNowPostId;
		profileId: Profile["profileId"] | null;
		beforeOpen?: () => void;
	}): Promise<void> {
		const check = ++this.#latestCheck;
		try {
			const earlier = await getRightNowPostReport({ postId, profileId });
			if (check !== this.#latestCheck) return;
			if (earlier !== null) {
				toast("Already reported", {
					description:
						earlier.createTime === null
							? "Awaiting moderation"
							: `${formatTimeRelativeCustom(earlier.createTime)} · Awaiting moderation`,
				});
				return;
			}
		} catch (error) {
			console.error(error);
			if (check === this.#latestCheck)
				showErrorToast({
					label: "Failed to check for an earlier report",
					error,
				});
			return;
		}
		beforeOpen?.();
		this.target = { kind: "rightNowPost", postId, profileId };
		this.open = true;
	}
}
