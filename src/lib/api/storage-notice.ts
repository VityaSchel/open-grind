import { platform } from "@tauri-apps/plugin-os";
import { toast } from "svelte-sonner";

import { callMethod } from "$lib/api/methods";
import { showPersistentErrorToast } from "$lib/api/persistent-error-toast";
import { t } from "$lib/i18n";

export async function noticeStorageBackend(): Promise<void> {
	const backend = await callMethod("storage_backend").catch(() => null);
	if (backend === "unavailable") {
		showPersistentErrorToast({
			id: "storage-backend",
			message: () => t("feedback.storageNotice.unavailable"),
		});
	} else if (backend === "file" && platform() === "linux") {
		toast.warning(t("feedback.storageNotice.plainFile"), {
			id: "storage-backend",
		});
	}
}
