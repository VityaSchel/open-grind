let pending = $state(false);

export const rightNowPostSheetRequest = {
	get pending(): boolean {
		return pending;
	},
	request(): void {
		pending = true;
	},
	settle(): void {
		pending = false;
	},
};
