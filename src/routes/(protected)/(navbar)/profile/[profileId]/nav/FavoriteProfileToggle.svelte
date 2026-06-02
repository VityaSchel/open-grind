<script lang="ts">
	import { StarIcon } from "phosphor-svelte";
	import { toast } from "svelte-sonner";

	import {
		addFavoriteUser,
		removeFavoriteUser,
	} from "$lib/api/users/favorites";
	import { Button } from "$lib/components/ui/button";

	let {
		profileId,
		isFavorite = $bindable(),
	}: {
		profileId: number;
		isFavorite: boolean;
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
				isFavorite = false;
			} else {
				await addFavoriteUser({ profileId });
				isFavorite = true;
			}
		} catch (error) {
			console.error(error);
			toast.error(
				"An error occurred while updating favorites. Please try again.",
			);
		} finally {
			submitting = false;
		}
	}}
	variant="secondary"
	aria-checked={isFavorite}
	role="switch"
	aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
	class="size-14"
	disabled={submitting}
>
	<StarIcon weight={isFavorite ? "fill" : "regular"} class="size-8" />
</Button>
