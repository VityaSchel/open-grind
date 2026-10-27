import { toast } from "svelte-sonner";

import { callMethod } from "$lib/api/methods";
import { isLinuxPlatform } from "$lib/platform/os";

export async function noticeStorageBackend(): Promise<void> {
	const backend = await callMethod("storage_backend").catch(() => null);
	if (backend === "unavailable") {
		toast.error(
			"This device can't keep you signed in. You'll be signed out when the app closes.",
			{ id: "storage-backend", duration: Number.POSITIVE_INFINITY },
		);
	} else if (backend === "file" && isLinuxPlatform()) {
		toast.warning(
			"No secret service found. Your sign-in is kept in a plain file only your user can read.",
			{ id: "storage-backend" },
		);
	}
}
