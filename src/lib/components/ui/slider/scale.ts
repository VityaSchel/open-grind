export const TRACK_RESOLUTION = 100_000;

export type SliderScale = {
	min: number;
	max: number;
	positions: readonly number[];
	toPosition: (value: number) => number;
	toValue: (position: number) => number;
};
