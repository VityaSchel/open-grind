import { setRegionalSettings } from "$lib/i18n";
import {
	parseRegionalOverride,
	type RegionalSettings,
	webRegionalSettings,
} from "$lib/i18n/regional";

function regionalOverride(): RegionalSettings | undefined {
	const value = new URLSearchParams(location.search).get("regional");
	return value === null ? undefined : parseRegionalOverride(value);
}

function followWebSettings(): void {
	setRegionalSettings(webRegionalSettings());
	window.addEventListener("languagechange", () =>
		setRegionalSettings(webRegionalSettings()),
	);
}

export function startRegionalSettings(): void {
	const pinned = import.meta.env.DEV ? regionalOverride() : undefined;
	if (pinned === undefined) {
		followWebSettings();
	} else {
		setRegionalSettings(pinned);
	}
}
