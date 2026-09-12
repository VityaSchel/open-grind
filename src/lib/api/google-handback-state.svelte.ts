export type GoogleHandbackPhase =
	| "idle"
	| "confirmingSwitch"
	| "switchingAccount"
	| "signingIn";

export const googleHandbackState = $state<{
	phase: GoogleHandbackPhase;
	answerSwitch: ((accepted: boolean) => void) | null;
}>({ phase: "idle", answerSwitch: null });

export function confirmAccountSwitch(): Promise<boolean> {
	return new Promise((resolve) => {
		googleHandbackState.answerSwitch?.(false);
		googleHandbackState.answerSwitch = resolve;
		googleHandbackState.phase = "confirmingSwitch";
	});
}

export function answerAccountSwitch(accepted: boolean): void {
	const { answerSwitch } = googleHandbackState;
	if (!answerSwitch) return;
	googleHandbackState.answerSwitch = null;
	googleHandbackState.phase = accepted ? "switchingAccount" : "idle";
	answerSwitch(accepted);
}
