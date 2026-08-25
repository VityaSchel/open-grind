<script lang="ts">
	import { platform } from "@tauri-apps/plugin-os";
	import { onMount } from "svelte";
	import { toast } from "svelte-sonner";

	import { callMethod } from "$lib/api/methods";

	onMount(() => {
		void callMethod("storage_backend")
			.then((backend) => {
				if (backend === "unavailable") {
					toast.error(
						"This device can't store your login. You'll be signed out when the app closes.",
						{
							id: "storage-backend",
							duration: Number.POSITIVE_INFINITY,
						},
					);
				} else if (backend === "file" && platform() === "linux") {
					toast.warning(
						"No secret service found. Your login is kept in a plain file only your user can read.",
						{ id: "storage-backend" },
					);
				}
			})
			.catch(() => {});
	});
</script>
