import { tick } from "svelte";

const commandCenterStateDefault = {
	open: false,
	query: "",
	value: "",
};

export const commandCenterState = $state(commandCenterStateDefault);

export function commandCenterClose() {
	commandCenterState.open = false;
	void tick().then(() => {
		setTimeout(() => {
			if (!commandCenterState.open) {
				commandCenterState.query = "";
			}
		}, 200);
	});
}
