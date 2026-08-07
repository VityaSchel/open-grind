import { showErrorToast } from "$lib/api/error-toast";

export async function applyOptimisticBatch<T>({
	items,
	request,
	rollback,
	errorLabel,
}: {
	items: T[];
	request: (item: T) => Promise<unknown>;
	rollback: (item: T) => void;
	errorLabel: string;
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
	showErrorToast({ label: errorLabel, error });
	return true;
}
