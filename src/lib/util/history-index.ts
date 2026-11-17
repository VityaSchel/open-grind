export const HISTORY_METADATA_KEY = "sveltekit:metadata";

type HistoryState =
	| Partial<Record<typeof HISTORY_METADATA_KEY, { historyIndex?: unknown }>>
	| null
	| undefined;

export function liveHistoryIndex(): number | undefined {
	const index = (history.state as HistoryState)?.[HISTORY_METADATA_KEY]
		?.historyIndex;
	return typeof index === "number" ? index : undefined;
}
