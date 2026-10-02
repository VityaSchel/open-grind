import {
	HEIGHT_CM_MAX,
	HEIGHT_CM_MIN,
	WEIGHT_KG_MAX,
	WEIGHT_KG_MIN,
} from "$lib/model/browse/grid/filters";
import {
	cmToInches,
	inchesToCm,
	kgToPounds,
	poundsToKg,
	type UnitSystem,
} from "$lib/util/units";

export type UnitStops = {
	first: number;
	last: number;
	toStop: (stored: number) => number;
	toStored: (stop: number) => number;
};

function unitStops({
	floor,
	ceiling,
	toStop,
	fromStop,
}: {
	floor: number;
	ceiling: number;
	toStop: (stored: number) => number;
	fromStop: (stop: number) => number;
}): UnitStops {
	const first = toStop(floor);
	const last = toStop(ceiling);
	return {
		first,
		last,
		toStop: (stored) => {
			if (stored <= floor) return first;
			if (stored >= ceiling) return last;
			return Math.min(Math.max(toStop(stored), first + 1), last - 1);
		},
		toStored: (stop) => {
			if (stop <= first) return floor;
			if (stop >= last) return ceiling;
			return fromStop(stop);
		},
	};
}

const sameUnit = (amount: number) => amount;

const heightLimits = { floor: HEIGHT_CM_MIN, ceiling: HEIGHT_CM_MAX };
const weightLimits = { floor: WEIGHT_KG_MIN, ceiling: WEIGHT_KG_MAX };

export const HEIGHT_STOPS: Record<UnitSystem, UnitStops> = {
	metric: unitStops({
		...heightLimits,
		toStop: sameUnit,
		fromStop: sameUnit,
	}),
	imperial: unitStops({
		...heightLimits,
		toStop: cmToInches,
		fromStop: inchesToCm,
	}),
};

export const WEIGHT_STOPS: Record<UnitSystem, UnitStops> = {
	metric: unitStops({
		...weightLimits,
		toStop: Math.round,
		fromStop: sameUnit,
	}),
	imperial: unitStops({
		...weightLimits,
		toStop: kgToPounds,
		fromStop: poundsToKg,
	}),
};

export function storedAfterMove({
	stops,
	stored,
	moved,
}: {
	stops: UnitStops;
	stored: number[];
	moved: number[];
}): number[] {
	const shown = stored.map((amount) => stops.toStop(amount));
	return moved.map((stop, thumb) => {
		if (stop === shown[thumb]) return stored[thumb]!;
		const thumbAtStop = shown.indexOf(stop);
		return thumbAtStop === -1 ? stops.toStored(stop) : stored[thumbAtStop]!;
	});
}
