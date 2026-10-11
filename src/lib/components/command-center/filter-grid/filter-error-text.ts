import { t } from "$lib/i18n";
import { formatInteger } from "$lib/i18n/format";
import { booleanTokens } from "./apply";
import type { FilterError } from "./types";

const RANGE_EXAMPLE = "25-40";

export function filterErrorText(error: FilterError): string {
	switch (error.kind) {
		case "unknownFilter":
			return t("commands.filterGrid.errors.unknownFilter");
		case "expectedBoolean":
			return t(
				"commands.filterGrid.errors.expectedBoolean",
				booleanTokens,
			);
		case "notANumber":
			return t("commands.filterGrid.errors.notANumber");
		case "outOfRange":
			return t("commands.filterGrid.errors.outOfRange", {
				min: formatInteger(error.min),
				max: formatInteger(error.max),
			});
		case "rangeSyntax":
			return t("commands.filterGrid.errors.rangeSyntax", {
				example: RANGE_EXAMPLE,
			});
		case "noValues":
			return t("commands.filterGrid.errors.noValues");
		case "unknownValue":
			return t("commands.filterGrid.errors.unknownValue", {
				value: error.value,
			});
		case "invalidGenderId":
			return t("commands.filterGrid.errors.invalidGenderId", {
				value: error.value,
			});
	}
}
