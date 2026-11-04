<script lang="ts" module>
	export const TICKS_PLATE_PX = 36;
</script>

<script lang="ts">
	let {
		progress = 0,
		spinning = false,
	}: { progress?: number; spinning?: boolean } = $props();

	const TICKS = 8;
	const TURN_DEGREES = 360;
	const DIMMEST_SPINNING_OPACITY = 0.25;
	const ticks = Array.from({ length: TICKS }, (_, index) => index);

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
	class={["plate grid place-items-center rounded-full", { spinning }]}
	style:width="{TICKS_PLATE_PX}px"
	style:height="{TICKS_PLATE_PX}px"
>
	<svg viewBox="0 0 24 24" class="size-6 text-muted-foreground">
		<g class="turn">
			{#each ticks as index (index)}
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

<style lang="postcss">
	@reference "$layout";

	.plate {
		transition-property: background-color, box-shadow;
		transition-duration: 150ms;
		transition-timing-function: ease-out;
	}

	.plate.spinning {
		@apply bg-card;
		box-shadow:
			0 1.75px 3.5px rgb(0 0 0 / 0.12),
			0 1px 4px rgb(0 0 0 / 0.24);
	}

	.turn {
		transform-origin: 12px 12px;
	}

	.spinning .turn {
		animation: ticks-turn 800ms steps(8) infinite;
	}

	@keyframes ticks-turn {
		to {
			transform: rotate(360deg);
		}
	}
</style>
