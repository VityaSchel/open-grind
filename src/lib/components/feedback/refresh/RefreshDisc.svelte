<script lang="ts">
	import { slingshotTension } from "./disc-math";

	let {
		progress = 0,
		spinning = false,
	}: { progress?: number; spinning?: boolean } = $props();

	const RADIUS = 7.5;
	const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
	const MAX_ARC = 0.8;
	const STROKE_WIDTH = 2.5;
	const ARROW_HALF_WIDTH = 5;
	const ARROW_HEIGHT = 5;
	const RING_START_DRAG = 0.4;
	const RING_MIN_OPACITY = 0.3;
	const REST_ROTATION_HALF_TURNS = -0.25;
	const DRAG_ROTATION_HALF_TURNS = 0.4;
	const TENSION_ROTATION_HALF_TURNS = 2;
	const SPIN_INTRO_MIN_SWEEP = 0.05;

	const drag = $derived(Math.min(1, Math.max(0, progress)));
	const ringProgress = $derived(
		Math.max(drag - RING_START_DRAG, 0) / (1 - RING_START_DRAG),
	);
	const sweep = $derived(Math.min(MAX_ARC, ringProgress * MAX_ARC));
	const arrowScale = $derived(Math.min(1, ringProgress));
	const tension = $derived(slingshotTension(progress));
	const rotation = $derived(
		(REST_ROTATION_HALF_TURNS +
			DRAG_ROTATION_HALF_TURNS * ringProgress +
			TENSION_ROTATION_HALF_TURNS * tension) *
			180,
	);
	const ringOpacity = $derived(
		progress >= 1
			? 1
			: RING_MIN_OPACITY + (1 - RING_MIN_OPACITY) * ringProgress,
	);

	let arrowAtSpinStart = $state({ rotation: 0, sweep: 0 });
	$effect.pre(() => {
		if (!spinning) arrowAtSpinStart = { rotation, sweep };
	});
	const spinBase = $derived(
		arrowAtSpinStart.rotation + arrowAtSpinStart.sweep * 360,
	);
	const introArc = $derived(arrowAtSpinStart.sweep * CIRCUMFERENCE);
	const withIntro = $derived(arrowAtSpinStart.sweep > SPIN_INTRO_MIN_SWEEP);
</script>

<div
	data-refresh-disc
	data-spinning={spinning || undefined}
	class="disc grid size-10 place-items-center rounded-full bg-card"
>
	<svg viewBox="0 0 40 40" class="size-10 text-accent">
		{#if spinning}
			<g transform="rotate({spinBase} 20 20)">
				<g class="spin-group">
					<circle
						class={["spin-arc", { "with-intro": withIntro }]}
						style:--intro-arc={introArc}
						style:--circumference={CIRCUMFERENCE}
						cx="20"
						cy="20"
						r={RADIUS}
						fill="none"
						stroke="currentColor"
						stroke-width={STROKE_WIDTH}
						stroke-linecap="square"
					/>
				</g>
			</g>
		{:else}
			<g
				transform="rotate({rotation} 20 20)"
				opacity={ringOpacity}
				class="drag-ring"
			>
				<circle
					cx="20"
					cy="20"
					r={RADIUS}
					fill="none"
					stroke="currentColor"
					stroke-width={STROKE_WIDTH}
					stroke-linecap="square"
					stroke-dasharray="{sweep * CIRCUMFERENCE} {CIRCUMFERENCE}"
				/>
				{#if arrowScale > 0}
					<g transform="rotate({sweep * 360} 20 20)">
						<polygon
							fill="currentColor"
							points="{20 +
								RADIUS -
								ARROW_HALF_WIDTH * arrowScale},20 {20 +
								RADIUS +
								ARROW_HALF_WIDTH * arrowScale},20 {20 +
								RADIUS},{20 + ARROW_HEIGHT * arrowScale}"
						/>
					</g>
				{/if}
			</g>
		{/if}
	</svg>
</div>

<style lang="postcss">
	@reference "$layout";

	.disc {
		/* CircleImageView: key shadow y 1.75 r 3.5 @ 12% + ambient fill @ 24% */
		box-shadow:
			0 1.75px 3.5px rgb(0 0 0 / 0.12),
			0 1px 4px rgb(0 0 0 / 0.24);
	}

	.drag-ring {
		transition: opacity 200ms ease-out;
	}

	/* Dash values are Android's CircularProgressDrawable scaled to r 7.5. */
	.spin-group {
		transform-origin: 20px 20px;
		animation: disc-rotate 1568ms linear infinite;
	}
	.spin-arc {
		transform-origin: 20px 20px;
		animation: disc-dash 1332ms cubic-bezier(0.4, 0, 0.2, 1) infinite;
	}

	.spin-arc.with-intro {
		animation:
			disc-spin-intro 666ms linear,
			disc-dash 1332ms cubic-bezier(0.4, 0, 0.2, 1) 666ms infinite;
	}
	@keyframes disc-rotate {
		to {
			transform: rotate(360deg);
		}
	}
	@keyframes disc-spin-intro {
		from {
			stroke-dasharray: var(--intro-arc) 150;
			stroke-dashoffset: calc(
				(var(--intro-arc) - var(--circumference)) * 1px
			);
		}
		to {
			stroke-dasharray: 0.5 150;
			stroke-dashoffset: calc((0.5 - var(--circumference)) * 1px);
		}
	}
	@keyframes disc-dash {
		0% {
			stroke-dasharray: 0.5 150;
			stroke-dashoffset: 0;
		}
		50% {
			stroke-dasharray: 33.4 150;
			stroke-dashoffset: -13.1;
		}
		100% {
			stroke-dasharray: 33.4 150;
			stroke-dashoffset: -46.4;
		}
	}
</style>
