import { SOURCE_LOCALE } from "./syntax";

export type CountFormatter = (options: {
	count: number;
	locale: string;
	decimal: string;
}) => string;

const countFormats = new Map<string, Intl.NumberFormat>();

export const defaultCountFormatter: CountFormatter = ({
	count,
	locale,
	decimal,
}) => {
	let formatter = countFormats.get(locale);
	if (formatter === undefined) {
		formatter = new Intl.NumberFormat([locale, SOURCE_LOCALE], {
			useGrouping: false,
		});
		countFormats.set(locale, formatter);
	}
	return formatter
		.formatToParts(count)
		.map((part) => (part.type === "decimal" ? decimal : part.value))
		.join("");
};
