import { byCodeUnits, type Captured } from "./manifest";

export type CompositeButton = { view: string; keys: string[] };

export function englishMeasured(captured: Captured): string[] {
	return captured.measured
		.filter((view) => view in captured.views)
		.sort(byCodeUnits);
}

export function compositeButtons(captured: Captured): CompositeButton[] {
	return Object.keys(captured.views)
		.sort(byCodeUnits)
		.flatMap((view) =>
			(captured.compositeButtons[view] ?? []).map((keys) => ({
				view,
				keys,
			})),
		);
}
