<script lang="ts">
	import { TrashIcon } from "phosphor-svelte";

	import { Button } from "$lib/components/ui/button";
	import { profileMediaUrl } from "$lib/util/media";

	let {
		mediaHash,
		onDelete,
	}: {
		mediaHash: string;
		onDelete: () => void;
	} = $props();

	const src = $derived(profileMediaUrl(mediaHash, "thumb"));
</script>

<div class="bg-muted relative aspect-square overflow-hidden rounded-xl">
	<img
		{src}
		alt=""
		class="size-full object-cover object-center"
		loading="lazy"
		draggable="false"
	/>
	<Button
		variant="destructive"
		size="icon-sm"
		class="bg-background/70 absolute right-1.5 top-1.5 rounded-full backdrop-blur"
		onclick={() => onDelete()}
		aria-label="Remove photo"
	>
		<TrashIcon class="size-4" />
	</Button>
</div>
