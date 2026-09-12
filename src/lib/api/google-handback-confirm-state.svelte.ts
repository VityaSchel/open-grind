export const googleHandbackConfirmState = $state<{
	open: boolean;
	resolve: ((accepted: boolean) => void) | null;
}>({ open: false, resolve: null });

function supersedePending(): void {
	googleHandbackConfirmState.resolve?.(false);
}

export function confirmGoogleHandback(): Promise<boolean> {
	return new Promise((resolve) => {
		supersedePending();
		googleHandbackConfirmState.resolve = resolve;
		googleHandbackConfirmState.open = true;
	});
}

export function settleGoogleHandbackConfirm(accepted: boolean): void {
	const { resolve } = googleHandbackConfirmState;
	googleHandbackConfirmState.resolve = null;
	googleHandbackConfirmState.open = false;
	resolve?.(accepted);
}
