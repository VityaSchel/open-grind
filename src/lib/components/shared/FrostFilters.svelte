<script lang="ts">
	const PILL_DEVIATIONS = [24, 40];
	const ROUND_DEVIATIONS = [8, 24, 40];
</script>

<svg aria-hidden="true" class="pointer-events-none absolute size-0">
	{#each PILL_DEVIATIONS as deviation (deviation)}
		<filter
			id="frost-pill-{deviation}"
			x="0"
			y="0"
			width="1"
			height="1"
			color-interpolation-filters="sRGB"
		>
			<feGaussianBlur stdDeviation={deviation} />
			<feComponentTransfer>
				<feFuncA type="table" tableValues="1 1" />
			</feComponentTransfer>
		</filter>
	{/each}
	<filter
		id="frost-tile"
		x="-6"
		y="-6"
		width="13"
		height="13"
		primitiveUnits="objectBoundingBox"
		color-interpolation-filters="sRGB"
	>
		<feOffset x="0" y="0" width="1" height="1" result="box" />
		<feTile in="box" />
	</filter>
	{#each ROUND_DEVIATIONS as deviation (deviation)}
		<filter
			id="frost-round-{deviation}"
			x="-6"
			y="-6"
			width="13"
			height="13"
			color-interpolation-filters="sRGB"
		>
			<feGaussianBlur stdDeviation={deviation} />
		</filter>
	{/each}
</svg>
