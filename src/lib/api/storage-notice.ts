import { toast } from "svelte-sonner";

import { callMethod } from "$lib/api/methods";
import { currentPlatform } from "$lib/platform/os";

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
		toast.error(
			"This device can't keep you signed in. You'll be signed out when the app closes.",
			{ id: "storage-backend", duration: Number.POSITIVE_INFINITY },
		);
	} else if (backend === "file" && fileStoreIsAFallback()) {
		toast.warning(
			"No secret service found. Your sign-in is kept in a plain file only your user can read.",
			{ id: "storage-backend" },
		);
	}
}
