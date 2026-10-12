import { t } from "$lib/i18n";
import { addonFlow } from "./addon.svelte";
import { ADDON_KEYS, type AddonKey } from "./components";
import { problemBody, unsupportedText, updateErrorText } from "./error-copy";
import type { CheckReport } from "./flow";
import { getInstalledVersion } from "./index";
import { showNotice, showProblem, showUpToDate } from "./toasts";
import type { Unsupported } from "./types";
import { checkForUpdateNow } from "./updates-manager";

export type UpdatesScope = {
	selfManaged: boolean;
	unsupportedReason: Unsupported["reason"] | null;
	addonAvailable: boolean;
};

type CheckScope = Pick<UpdatesScope, "selfManaged" | "addonAvailable">;

function describeChecks({
	selfManaged,
	unsupportedReason,
	addonAvailable,
}: UpdatesScope): string {
	const reason =
		unsupportedReason === null
			? null
			: unsupportedText({ reason: unsupportedReason });
	if (selfManaged || !addonAvailable) {
		return (
			reason ??
			t(
				addonAvailable
					? "updates.settings.automaticChecks.description.appAndAddons"
					: "updates.settings.automaticChecks.description.app",
			)
		);
	}
	if (reason !== null) {
		return t(
			"updates.settings.automaticChecks.description.addonsOnlyWithReason",
			{ reason },
		);
	}
	return t("updates.settings.automaticChecks.description.addonsOnly");
}

export function automaticChecksSetting(scope: UpdatesScope): {
	title: string;
	description: string;
	blocked: boolean;
} {
	const addonsOnly = scope.addonAvailable && !scope.selfManaged;
	return {
		title: t(
			addonsOnly
				? "updates.settings.automaticChecks.addonsTitle"
				: "common.updates.checkAutomatically",
		),
		description: describeChecks(scope),
		blocked: scope.unsupportedReason !== null && !scope.addonAvailable,
	};
}

export function manualCheckOffered({
	selfManaged,
	addonAvailable,
}: CheckScope): boolean {
	return selfManaged || addonAvailable;
}

async function checkInstalledAddon(
	component: AddonKey,
	{ reportFailure }: { reportFailure: boolean },
): Promise<CheckReport | null> {
	const flow = addonFlow(component);
	try {
		if ((await getInstalledVersion(component)) === null) {
			await flow.withdrawUpdate();
			return null;
		}
	} catch (error) {
		if (reportFailure) {
			const title = updateErrorText(error, {
				fallback: "updates.errors.checkFailed",
				component,
			});
			showProblem({ title, body: problemBody({ component, title }) });
		}
		return "failed";
	}
	return flow.checkNow({ reportFailure });
}

async function checkEachComponent({
	selfManaged,
	addonAvailable,
	reportFailure,
}: CheckScope & { reportFailure: boolean }): Promise<CheckReport[]> {
	const reports = await Promise.all([
		selfManaged ? checkForUpdateNow({ reportFailure }) : null,
		...(addonAvailable
			? ADDON_KEYS.map((addon) =>
					checkInstalledAddon(addon, { reportFailure }),
				)
			: []),
	]);
	return reports.filter((report) => report !== null);
}

export async function checkAfterOptIn(scope: CheckScope): Promise<void> {
	await checkEachComponent({ ...scope, reportFailure: false });
}

export async function checkForUpdatesNow(scope: CheckScope): Promise<void> {
	const reports = await checkEachComponent({ ...scope, reportFailure: true });
	if (reports.length === 0) {
		showNotice(t("updates.checks.noAddons"));
	} else if (reports.every((report) => report === "current")) {
		showUpToDate(t("updates.checks.noUpdates"));
	}
}
