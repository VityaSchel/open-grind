export type GoogleHandoffPhase =
	| "idle"
	| "confirmingSwitch"
	| "switchingAccount"
	| "signingIn";

export const googleHandoffState = $state<{
	phase: GoogleHandoffPhase;
	answerSwitch: ((accepted: boolean) => void) | null;
}>({ phase: "idle", answerSwitch: null });

export function confirmAccountSwitch(): Promise<boolean> {
	return new Promise((resolve) => {
		googleHandoffState.answerSwitch?.(false);
		googleHandoffState.answerSwitch = resolve;
		googleHandoffState.phase = "confirmingSwitch";
	});
}

export function answerAccountSwitch(accepted: boolean): void {
	const { answerSwitch } = googleHandoffState;
	if (!answerSwitch) return;
	googleHandoffState.answerSwitch = null;
	googleHandoffState.phase = accepted ? "switchingAccount" : "idle";
	answerSwitch(accepted);
}
