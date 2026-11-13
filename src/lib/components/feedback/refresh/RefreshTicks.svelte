<script lang="ts">
	let {
		progress = 0,
		spinning = false,
	}: { progress?: number; spinning?: boolean } = $props();

	const TICKS = 8;
	const TURN_DEGREES = 360;
	const DIMMEST_SPINNING_OPACITY = 0.25;

	const filled = $derived(Math.min(1, Math.max(0, progress)) * TICKS);

	function opacityOf(index: number): number {
		if (spinning)
			return (
				DIMMEST_SPINNING_OPACITY +
				((1 - DIMMEST_SPINNING_OPACITY) * index) / (TICKS - 1)
			);
		return Math.min(1, Math.max(0, filled - index));
	}
</script>

<div
	data-refresh-ticks
	data-spinning={spinning || undefined}
	class="grid size-9 place-items-center rounded-full transition-[background-color,box-shadow] duration-150 ease-[ease-out] data-spinning:bg-card data-spinning:shadow-refresh-disc"
>
	<svg viewBox="0 0 24 24" class="size-6 text-muted-foreground">
		<g class="turn">
			{#each { length: TICKS }, index (index)}
				<line
					x1="12"
					y1="3"
					x2="12"
					y2="7.5"
					stroke="currentColor"
					stroke-width="2.25"
					stroke-linecap="round"
					transform="rotate({(index * TURN_DEGREES) / TICKS} 12 12)"
					opacity={opacityOf(index)}
				/>
			{/each}
		</g>
	</svg>
</div>

<style>
	.turn {
		transform-origin: 12px 12px;
	}

	[data-spinning] .turn {
		animation: ticks-turn 800ms steps(8) infinite;
	}

	@keyframes ticks-turn {
		to {
			transform: rotate(360deg);
		}
	}
</style>
