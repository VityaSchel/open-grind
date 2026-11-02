import { toast } from "svelte-sonner";

import { BlockDidNotStickError } from "#lib/api/browse/blocks.ts";
import { showErrorToast } from "#lib/api/error-toast.ts";
import { openExternalLink } from "#lib/platform/link-opener.ts";

const WHY_BLOCKING_FAILS_URL =
	"https://opengrind.org/guides/blocking-and-hiding-profiles#why-cant-i-block-some-profiles";

export function showBlockFailure(error: unknown): void {
	if (error instanceof BlockDidNotStickError) {
		toast.error("Blocking this profile failed. Try hiding instead.", {
			action: {
				label: "Learn more",
				onClick: () => openExternalLink(WHY_BLOCKING_FAILS_URL),
			},
		});
		return;
	}
	showErrorToast({ label: "Failed to block user", error });
}
