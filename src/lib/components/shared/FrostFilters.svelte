<script lang="ts">
	const PILL_DEVIATIONS = [24, 40];
	const ROUND_FILTERS = [
		{ deviation: 8, reach: 1 },
		{ deviation: 24, reach: 6 },
		{ deviation: 40, reach: 6 },
	];
	const TILE_REACHES = [...new Set(ROUND_FILTERS.map(({ reach }) => reach))];
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
	{#each TILE_REACHES as reach (reach)}
		<filter
			id="frost-tile-{reach}"
			x={-reach}
			y={-reach}
			width={2 * reach + 1}
			height={2 * reach + 1}
			primitiveUnits="objectBoundingBox"
			color-interpolation-filters="sRGB"
		>
			<feOffset x="0" y="0" width="1" height="1" result="box" />
			<feTile in="box" />
		</filter>
	{/each}
	{#each ROUND_FILTERS as { deviation, reach } (deviation)}
		<filter
			id="frost-round-{deviation}"
			x={-reach}
			y={-reach}
			width={2 * reach + 1}
			height={2 * reach + 1}
			color-interpolation-filters="sRGB"
		>
			<feGaussianBlur stdDeviation={deviation} />
		</filter>
	{/each}
</svg>
