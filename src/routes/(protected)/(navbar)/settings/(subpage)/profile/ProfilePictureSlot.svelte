<script lang="ts">
	import { TrashIcon } from "phosphor-svelte";

	import { Button } from "$lib/components/ui/button";
	import { profileMediaUrl } from "$lib/util/media";

	let {
		mediaHash,
		position,
		onDelete,
	}: {
		mediaHash: string;
		position: number;
		onDelete: () => void;
	} = $props();

	const src = $derived(profileMediaUrl(mediaHash, "thumb"));
</script>

<div class="relative aspect-square overflow-hidden rounded-xl bg-muted">
	<img
		{src}
		alt="Profile photo {position}"
		class="size-full object-cover object-center"
		loading="lazy"
		draggable="false"
	/>
	<Button
		variant="destructive"
		size="icon-sm"
		class="absolute top-1.5 right-1.5 rounded-full bg-background/70 backdrop-blur"
		onclick={() => onDelete()}
		aria-label="Remove profile photo {position}"
	>
		<TrashIcon class="size-4" />
	</Button>
</div>
