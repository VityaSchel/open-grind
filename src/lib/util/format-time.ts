import { format } from "date-fns";

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
