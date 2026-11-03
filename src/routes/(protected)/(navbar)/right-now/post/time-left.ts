const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;

export function formatTimeLeft({ ms }: { ms: number }): string {
	const seconds = Math.max(0, Math.ceil(ms / 1000));
	if (seconds < SECONDS_PER_MINUTE) return `${seconds}s`;
	const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
	if (minutes < MINUTES_PER_HOUR) return `${minutes}m`;
	const hours = Math.floor(minutes / MINUTES_PER_HOUR);
	const rest = minutes % MINUTES_PER_HOUR;
	return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}
