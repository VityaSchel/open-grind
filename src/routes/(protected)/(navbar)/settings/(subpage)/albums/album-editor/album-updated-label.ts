import { isSameYear } from "date-fns";

import { formatDate } from "#lib/i18n/format.ts";
import { now } from "#lib/util/clock.ts";

export function albumUpdatedLabel(updatedAt: string): string {
	const date = new Date(updatedAt);
	return formatDate({
		date,
		preset: isSameYear(date, now()) ? "monthDay" : "monthDayYear",
	});
}
