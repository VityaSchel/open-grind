import {
	type SliderScale,
	TRACK_RESOLUTION,
} from "$lib/components/ui/slider/scale";
import {
	AGE_MAX,
	AGE_MIN,
	WEIGHT_KG_MAX,
	WEIGHT_KG_MIN,
} from "$lib/model/browse/grid/filters";

type Curve = (share: number) => number;

function taperedCurve({ knee, taper }: { knee: number; taper: number }): Curve {
	if (!(knee >= 0 && knee < 1))
		throw new RangeError("the knee must sit inside the range");
	if (!(taper > 1))
		throw new RangeError("the taper must shrink the steps past the knee");
	const decay = (taper - 1) / (1 - knee);
	const slope = 1 / (knee + Math.log(taper) / decay);
	return (share) =>
		share <= knee
			? slope * share
			: slope * knee +
				(slope / decay) * Math.log1p(decay * (share - knee));
}

function nearestIndex({
	positions,
	position,
}: {
	positions: readonly number[];
	position: number;
}): number {
	let low = 0;
	let high = positions.length - 1;
	while (high - low > 1) {
		const middle = (low + high) >> 1;
		if (positions[middle]! <= position) low = middle;
		else high = middle;
	}
	return Math.abs(positions[high]! - position) <
		Math.abs(position - positions[low]!)
		? high
		: low;
}

export function taperedScale({
	min,
	max,
	knee,
	taper,
}: {
	min: number;
	max: number;
	knee: number;
	taper: number;
}): SliderScale {
	const span = max - min;
	const curve = taperedCurve({ knee: (knee - min) / span, taper });
	const positions = Array.from({ length: span + 1 }, (_, offset) =>
		Math.round(curve(offset / span) * TRACK_RESOLUTION),
	);
	for (let offset = 1; offset < positions.length; offset++)
		if (positions[offset]! <= positions[offset - 1]!)
			throw new RangeError(
				`${min + offset - 1} and ${min + offset} share a track position`,
			);

	const clampOffset = (offset: number) => Math.min(Math.max(offset, 0), span);

	return {
		min,
		max,
		positions,
		toPosition: (value) => positions[clampOffset(Math.round(value) - min)]!,
		toValue: (position) => min + nearestIndex({ positions, position }),
	};
}

export const AGE_SLIDER_SCALE = taperedScale({
	min: AGE_MIN,
	max: AGE_MAX,
	knee: 45,
	taper: 7,
});

export const WEIGHT_SLIDER_SCALE = taperedScale({
	min: WEIGHT_KG_MIN,
	max: WEIGHT_KG_MAX,
	knee: 105,
	taper: 10,
});
