import { toast } from "svelte-sonner";

import { followLocale } from "$lib/i18n";

const followers = new Map<string, () => void>();

function isShowing({ id, title }: { id: string; title: string }): boolean {
	return toast
		.getActiveToasts()
		.some((active) => active.id === id && active.title === title);
}

export function showPersistentErrorToast({
	id,
	message,
}: {
	id: string;
	message: () => string;
}): void {
	const options = { id, duration: Number.POSITIVE_INFINITY };
	let shown = message();
	followers.get(id)?.();
	toast.error(shown, options);
	followers.set(
		id,
		followLocale(() => {
			const title = message();
			if (title === shown) return;
			if (!isShowing({ id, title: shown })) {
				followers.get(id)?.();
				followers.delete(id);
				return;
			}
			shown = title;
			toast.error(title, options);
		}),
	);
}
