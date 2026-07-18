<script lang="ts">
	import Skeleton from "$lib/components/ui/skeleton/skeleton.svelte";
	import { mulberry32 } from "$lib/util/random";

	let seededRandom = mulberry32(Math.random() * 2 ** 32);
</script>

{#each Array(10)}
	<Skeleton
		class={[
			"h-9 max-w-full shrink-0",
			seededRandom() < 0.5 ? "self-start" : "self-end",
		]}
		style="width: {Math.floor(seededRandom() * 400) + 100}px"
	/>
{/each}
