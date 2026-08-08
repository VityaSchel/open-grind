import { format } from "date-fns";

export function formatMediaDuration(seconds: number) {
	const total =
		Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
	const minutes = Math.floor(total / 60);
	const paddedSeconds = String(total % 60).padStart(2, "0");
	if (minutes < 60) return `${minutes}:${paddedSeconds}`;
	const paddedMinutes = String(minutes % 60).padStart(2, "0");
	return `${Math.floor(minutes / 60)}:${paddedMinutes}:${paddedSeconds}`;
}

export function formatTimeRelativeCustom(date: number) {
	if (date < 0) return "";
	const diff = Date.now() - date;
	if (diff < 60 * 1000) return "Just now";
	else if (diff < 60 * 60 * 1000) {
		const mins = Math.floor(diff / (60 * 1000));
		return `${mins} min` + (mins > 1 ? "s" : "");
	} else if (diff < 24 * 60 * 60 * 1000) {
		const hrs = Math.floor(diff / (60 * 60 * 1000));
		return `${hrs} hr` + (hrs > 1 ? "s" : "");
	} else if (diff < 2 * 24 * 60 * 60 * 1000) return `Yesterday`;
	else if (diff < 7 * 24 * 60 * 60 * 1000) return format(date, "EEEE");
	else return format(date, "MMM d");
}
