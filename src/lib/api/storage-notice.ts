import { toast } from "svelte-sonner";

import { callMethod } from "#lib/api/methods.ts";
import { showPersistentErrorToast } from "#lib/api/persistent-error-toast.ts";
import { t } from "#lib/i18n/index.ts";
import { currentPlatform } from "#lib/platform/os.ts";

function fileStoreIsAFallback(): boolean {
	switch (currentPlatform()) {
		case "linux":
			return true;
		case "android":
		case "ios":
		case "macos":
		case "windows":
			return false;
	}
}

export async function noticeStorageBackend(): Promise<void> {
	const backend = await callMethod("storage_backend").catch(() => null);
	if (backend === "unavailable") {
		showPersistentErrorToast({
			id: "storage-backend",
			message: () => t("feedback.storageNotice.unavailable"),
		});
	} else if (backend === "file" && fileStoreIsAFallback()) {
		toast.warning(t("feedback.storageNotice.keyringUnusable"), {
			id: "storage-backend",
		});
	}
}
