import { ADDON_NAME, APP_COMPONENT, type ComponentKey } from "./components";
import { problemBody } from "./error-copy";
import type { StagePresenter } from "./flow";
import {
	dismissStage,
	showAddonInstalled,
	showInstalled,
	showManualInstall,
	showProblem,
	showStage,
	showUpToDate,
} from "./toasts";

export function toastPresenter(component: ComponentKey): StagePresenter {
	const subject =
		component === APP_COMPONENT
			? "Open Grind"
			: `The ${ADDON_NAME[component]}`;
	return {
		show: (stage) => showStage({ component, ...stage }),
		dismiss: () => dismissStage(component),
		problem: (title) =>
			showProblem({ title, body: problemBody({ component, title }) }),
		manualInstall: (body) => showManualInstall(body),
		installed: ({ tag, kind }) => {
			if (component === APP_COMPONENT) void showInstalled();
			else showAddonInstalled({ component, tag, kind });
		},
		upToDate: () => showUpToDate(`${subject} is up to date`),
	};
}
