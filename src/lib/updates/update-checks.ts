import { addonFlow } from "./addon.svelte";
import { ADDON_KEYS, type AddonKey } from "./components";
import { problemBody, updateErrorText } from "./error-copy";
import type { CheckReport } from "./flow";
import { getInstalledVersion } from "./index";
import { showNotice, showProblem, showUpToDate } from "./toasts";
import { checkForUpdateNow } from "./updates-manager";

export type UpdatesScope = {
	selfManaged: boolean;
	unsupportedReason: string | null;
	addonAvailable: boolean;
};

type CheckScope = Pick<UpdatesScope, "selfManaged" | "addonAvailable">;

const privacyNote =
	"No personally identifiable information is sent, no requests are stored or analyzed.";
const addonCheck =
	"Periodically ask git.opengrind.org whether newer versions of your installed add-ons are published.";

function describeChecks({
	selfManaged,
	unsupportedReason,
	addonAvailable,
}: UpdatesScope): string {
	if (selfManaged || !addonAvailable) {
		const subject = addonAvailable
			? "Open Grind and its add-ons"
			: "Open Grind";
		return (
			unsupportedReason ??
			`Periodically request updates for ${subject} from git.opengrind.org. ${privacyNote}`
		);
	}
	if (unsupportedReason !== null) {
		return `${unsupportedReason}. ${addonCheck} ${privacyNote}`;
	}
	return `${addonCheck} Open Grind itself isn't updated from here. ${privacyNote}`;
}

export function automaticChecksSetting(scope: UpdatesScope): {
	title: string;
	description: string;
	blocked: boolean;
} {
	const addonsOnly = scope.addonAvailable && !scope.selfManaged;
	return {
		title: addonsOnly
			? "Check add-on updates automatically"
			: "Check updates automatically",
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
				fallback: "Couldn't check for updates",
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
		showNotice("No add-ons installed");
	} else if (reports.every((report) => report === "current")) {
		showUpToDate("No updates available");
	}
}
