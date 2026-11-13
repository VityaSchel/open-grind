let pending = false;

export const rightNowPostSheetRequest = {
	request(): void {
		pending = true;
	},
	take(): boolean {
		const requested = pending;
		pending = false;
		return requested;
	},
};
