import { RightNowPostState } from "./right-now-post-state.svelte";
import { PROFILE_ID } from "./right-now-post-test-helpers";

const createdStates: RightNowPostState[] = [];

export function createState(): RightNowPostState {
	const state = new RightNowPostState({ profileId: PROFILE_ID });
	createdStates.push(state);
	return state;
}

export async function loadedState(): Promise<RightNowPostState> {
	const state = createState();
	await state.load();
	return state;
}

export function destroyCreatedStates(): void {
	for (const state of createdStates.splice(0)) state.destroy();
}
