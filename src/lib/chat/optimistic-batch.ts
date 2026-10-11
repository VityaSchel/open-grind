import { showErrorToast } from "$lib/api/error-toast";
import { type MessageKeyWith, t } from "$lib/i18n";

export async function applyOptimisticBatch<T>({
	items,
	request,
	rollback,
	errorLabel,
}: {
	items: T[];
	request: (item: T) => Promise<unknown>;
	rollback: (item: T) => void;
	errorLabel: MessageKeyWith<{ count: number }>;
}): Promise<boolean> {
	const results = await Promise.allSettled(items.map(request));
	const failures: T[] = [];
	let error: unknown = null;
	items.forEach((item, index) => {
		const result = results[index];
		if (result?.status !== "rejected") return;
		failures.push(item);
		error ??= result.reason;
	});
	if (failures.length === 0) return false;
	for (const item of failures.toReversed()) rollback(item);
	console.error(error);
	const label = t(errorLabel, { count: failures.length });
	showErrorToast({ label, error });
	return true;
}
