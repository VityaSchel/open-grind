import { toast } from "svelte-sonner";

import { ApiError } from "$lib/api/api-error";
import { promptCopyError } from "$lib/api/error-copy";

function isSessionGone({ kind }: ApiError): boolean {
	return kind === "SessionCleared" || kind === "NotSignedIn";
}

export function showErrorToast({
	label = "An error occurred",
	error,
	onRetry,
	id,
}: {
	label?: string;
	error: unknown;
	onRetry?: () => void;
	id?: string;
}) {
	if (error instanceof ApiError && isSessionGone(error)) return;
	if (onRetry) {
		toast.error(label, {
			id,
			action: { label: "Retry", onClick: onRetry },
			cancel: {
				label: "Copy details",
				onClick: () => void promptCopyError(error).catch(() => {}),
			},
		});
		return;
	}
	toast.error(label, {
		id,
		action: {
			label: "Copy details",
			onClick: () => void promptCopyError(error).catch(() => {}),
		},
	});
}
