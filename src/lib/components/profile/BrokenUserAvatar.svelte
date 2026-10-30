<script lang="ts">
	import ImageBrokenIcon from "phosphor-svelte/lib/ImageBrokenIcon";

	import { isHalloween } from "$lib/components/halloween/halloween";
	import ZombieIcon from "$lib/components/halloween/ZombieIcon.svelte";
</script>

<div
	class="flex size-full items-center justify-center rounded-full border border-border/50 bg-muted text-muted-foreground/10"
>
	{#if isHalloween()}
		<ZombieIcon class="size-6" />
	{:else}
		<ImageBrokenIcon class="size-6" />
	{/if}
</div>
