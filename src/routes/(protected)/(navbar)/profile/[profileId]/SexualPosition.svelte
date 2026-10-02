<script lang="ts">
	import { sexualPositionIcons } from "$lib/components/profile/sexual-position-icons";
	import {
		sexualPositions,
		sexualPositionSchema,
	} from "$lib/model/users/profiles";

	let { sexualPosition }: { sexualPosition: number } = $props();

	const knownPosition = $derived(
		sexualPositionSchema.safeParse(sexualPosition).data,
	);
</script>

{#if knownPosition !== undefined}
	{@const Icon = sexualPositionIcons[knownPosition]}
	<span class="flex items-center gap-1 whitespace-nowrap *:shrink-0">
		<Icon class="shrink-0" />
		{sexualPositions[knownPosition]}
	</span>
{/if}
