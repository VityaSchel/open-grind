import { toast } from "svelte-sonner";

import { ApiError } from "$lib/api/api-error";
import { promptCopyError } from "$lib/api/error-copy";

function isSessionGone({ kind }: ApiError): boolean {
	return kind === "SessionCleared" || kind === "NotLoggedIn";
}

export function showErrorToast({
	label = "An error occurred",
	error,
	onRetry,
}: {
	label?: string;
	error: unknown;
	onRetry?: () => void;
}) {
	if (error instanceof ApiError && isSessionGone(error)) return;
	if (onRetry) {
		toast.error(label, {
			action: { label: "Retry", onClick: onRetry },
			cancel: {
				label: "Copy details",
				onClick: () => void promptCopyError(error).catch(() => {}),
			},
		});
		return;
	}
	toast.error(label, {
		action: {
			label: "Copy details",
			onClick: () => void promptCopyError(error).catch(() => {}),
		},
	});
}
