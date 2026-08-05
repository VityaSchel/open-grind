<script lang="ts">
	import Skeleton from "$lib/components/ui/skeleton/skeleton.svelte";
	import { mulberry32 } from "$lib/util/random";

	const seededRandom = mulberry32(Math.random() * 2 ** 32);
</script>

{#each Array(10)}
	{@const alignStart = seededRandom() < 0.5}
	<Skeleton
		class={[
			"h-9 max-w-full shrink-0",
			{ "self-start": alignStart, "self-end": !alignStart },
		]}
		style="width: {Math.floor(seededRandom() * 400) + 100}px"
	/>
{/each}
