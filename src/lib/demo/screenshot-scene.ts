import type { PlainMessageKey } from "../i18n/types";
import type { ViewScan } from "./screenshot-scan";

export const demoLists = [
	"albums",
	"blocks",
	"drawer",
	"grid",
	"inbox",
	"photos",
	"taps",
	"views",
] as const;

export type DemoList = (typeof demoLists)[number];

export type NativeError = { kind: string; message?: unknown };

export type Pending = { pending: true };

export type RestFault = {
	method?: string;
	path: string | { pattern: string };
} & ({ status: number; body?: unknown } | { error: NativeError } | Pending);

export type MethodFault = { command: string } & (
	| { error: NativeError }
	| Pending
);

export type MethodOutcome =
	| { error: NativeError }
	| Pending
	| { answer: unknown };

export type ScreenshotScene = {
	signedOut: boolean;
	onboarding: boolean;
	updates: boolean;
	emptyLists: DemoList[];
	restriction: {
		kind: string;
		region?: string | null;
		reason?: string | null;
	} | null;
	restFaults: RestFault[];
	methodFaults: MethodFault[];
	methodAnswers: Record<string, unknown>;
};

export type UpdateComponent = "app" | "google-oauth" | "recaptcha" | "fcm";

export type InstallKind = "install" | "update";

export type UpdateStagePresenter = {
	show: (stage: {
		view: {
			stage:
				| "available"
				| "downloading"
				| "verifying"
				| "paused"
				| "ready"
				| "installing";
			received: number;
			total: number;
		};
		kind: InstallKind;
		onActivate: () => void;
		onCancel: () => void;
		onDismiss: () => void;
	}) => void;
	dismiss: () => void;
	problem: (title: string) => void;
	manualInstall: (body: string) => void;
	installed: (install: { tag: string | null; kind: InstallKind }) => void;
	upToDate: () => void;
};

export type ScreenshotHooks = {
	setLocale: (options: { locale: string }) => Promise<void>;
	setScene: (scene: Partial<ScreenshotScene>) => void;
	showErrorToast: (options: {
		label?: string;
		error: unknown;
		onRetry?: () => void;
	}) => void;
	updateToasts: (component: UpdateComponent) => UpdateStagePresenter;
	updateProblem: (problem: {
		component: UpdateComponent;
		key: PlainMessageKey;
	}) => void;
	scan: () => ViewScan;
};

declare global {
	interface Window {
		__openGrindScreenshots?: ScreenshotHooks;
		__openGrindScreenshotScene?: Partial<ScreenshotScene>;
	}
}

const NOT_SIGNED_IN: NativeError = { kind: "NotSignedIn" };

export const screenshotScene: ScreenshotScene = {
	signedOut: false,
	onboarding: false,
	updates: false,
	emptyLists: [],
	restriction: null,
	restFaults: [],
	methodFaults: [],
	methodAnswers: {},
};

export function neverSettles(): Promise<never> {
	return new Promise(() => {});
}

function pathMatches({
	match,
	path,
}: {
	match: RestFault["path"];
	path: string;
}): boolean {
	if (typeof match === "string") return match === path.split("?")[0];
	return new RegExp(match.pattern).test(path);
}

export function sceneRestFault({
	path,
	method,
}: {
	path: string;
	method: string;
}): RestFault | undefined {
	return screenshotScene.restFaults.find(
		(fault) =>
			(fault.method ?? method) === method &&
			pathMatches({ match: fault.path, path }),
	);
}

export function sceneMethodOutcome(command: string): MethodOutcome | undefined {
	if (screenshotScene.signedOut && command === "refresh_session") {
		return { error: NOT_SIGNED_IN };
	}
	const fault = screenshotScene.methodFaults.find(
		(candidate) => candidate.command === command,
	);
	if (fault !== undefined) return fault;
	return Object.hasOwn(screenshotScene.methodAnswers, command)
		? { answer: screenshotScene.methodAnswers[command] }
		: undefined;
}
