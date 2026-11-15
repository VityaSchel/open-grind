import { formatInteger } from "#lib/i18n/format.ts";
import { t } from "#lib/i18n/index.ts";

const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;

export function formatTimeLeft({ ms }: { ms: number }): string {
	const seconds = Math.max(0, Math.ceil(ms / 1000));
	if (seconds < SECONDS_PER_MINUTE)
		return t("browse.rightNow.timeLeft.seconds", {
			seconds: formatInteger(seconds),
		});
	const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
	if (minutes < MINUTES_PER_HOUR)
		return t("browse.rightNow.timeLeft.minutes", {
			minutes: formatInteger(minutes),
		});
	const hours = Math.floor(minutes / MINUTES_PER_HOUR);
	const rest = minutes % MINUTES_PER_HOUR;
	return rest === 0
		? t("browse.rightNow.timeLeft.hours", { hours: formatInteger(hours) })
		: t("browse.rightNow.timeLeft.hoursMinutes", {
				hours: formatInteger(hours),
				minutes: formatInteger(rest),
			});
}
