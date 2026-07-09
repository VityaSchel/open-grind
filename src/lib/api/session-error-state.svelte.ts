export const sessionErrorState = $state<{
	open: boolean;
	message: string;
	unauthorized: boolean;
}>({ open: false, message: "", unauthorized: false });
