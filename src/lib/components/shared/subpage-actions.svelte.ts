import { getContext, onDestroy, setContext, type Snippet } from "svelte";

const SUBPAGE_ACTIONS = Symbol("SUBPAGE_ACTIONS");

export class SubpageActions {
	snippet: Snippet | null = $state(null);
}

export function provideSubpageActions(): SubpageActions {
	return setContext(SUBPAGE_ACTIONS, new SubpageActions());
}

export function setSubpageActions(snippet: Snippet): void {
	const actions = getContext<SubpageActions>(SUBPAGE_ACTIONS);
	actions.snippet = snippet;
	onDestroy(() => {
		if (actions.snippet === snippet) actions.snippet = null;
	});
}
