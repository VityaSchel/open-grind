<script lang="ts">
	import { StarIcon } from "phosphor-svelte";

	import { showErrorToast } from "$lib/api/error-toast";
	import {
		addFavoriteUser,
		removeFavoriteUser,
	} from "$lib/api/users/favorites";
	import { Button } from "$lib/components/ui/button";

	let {
		profileId,
		isFavorite,
		onFavorite,
	}: {
		profileId: number;
		isFavorite: boolean;
		onFavorite: (isFavorite: boolean) => void;
	} = $props();

	let submitting = $state(false);
</script>

<Button
	size="icon-lg"
	onclick={async () => {
		if (submitting) return;
		submitting = true;

		try {
			if (isFavorite) {
				await removeFavoriteUser({ profileId });
				onFavorite(false);
			} else {
				await addFavoriteUser({ profileId });
				onFavorite(true);
			}
		} catch (error) {
			console.error(error);
			showErrorToast({
				label: isFavorite
					? "Failed to remove from favorites"
					: "Failed to add to favorites",
				error,
			});
		} finally {
			submitting = false;
		}
	}}
	variant="secondary"
	aria-checked={isFavorite}
	role="switch"
	aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
	class="size-12"
	disabled={submitting}
>
	<StarIcon weight={isFavorite ? "fill" : "bold"} class="size-6" />
</Button>
