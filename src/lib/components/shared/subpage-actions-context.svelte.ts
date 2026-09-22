import { createContext, onDestroy, type Snippet } from "svelte";

class SubpageActions {
	snippet: Snippet | null = $state(null);
}

const [getSubpageActions, setSubpageActionsContext] =
	createContext<SubpageActions>();

export function provideSubpageActions(): SubpageActions {
	return setSubpageActionsContext(new SubpageActions());
}

export function setSubpageActions(snippet: Snippet): void {
	const actions = getSubpageActions();
	actions.snippet = snippet;
	onDestroy(() => {
		if (actions.snippet === snippet) actions.snippet = null;
	});
}
