import { format, isSameYear } from "date-fns";

import { now } from "$lib/util/clock";

export function albumUpdatedLabel(updatedAt: string): string {
	const date = new Date(updatedAt);
	return format(date, isSameYear(date, now()) ? "MMM d" : "MMM d, yyyy");
}
