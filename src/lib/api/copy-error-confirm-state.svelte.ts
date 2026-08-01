export type CopyErrorConfirmChoice = { redact: boolean } | { abort: true };

export const copyErrorConfirmState = $state<{
	open: boolean;
	error: unknown;
	resolve: ((choice: CopyErrorConfirmChoice) => void) | null;
}>({ open: false, error: null, resolve: null });

function supersedePending(): void {
	copyErrorConfirmState.resolve?.({ abort: true });
}

export function confirmCopyError(
	error: unknown,
): Promise<CopyErrorConfirmChoice> {
	return new Promise((resolve) => {
		supersedePending();
		copyErrorConfirmState.error = error;
		copyErrorConfirmState.resolve = resolve;
		copyErrorConfirmState.open = true;
	});
}

export function settleCopyErrorConfirm(choice: CopyErrorConfirmChoice): void {
	const { resolve } = copyErrorConfirmState;
	copyErrorConfirmState.resolve = null;
	copyErrorConfirmState.open = false;
	resolve?.(choice);
}
