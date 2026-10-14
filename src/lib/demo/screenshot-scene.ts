import type { PlainMessageKey } from "../i18n/types";
import type { DemoInbox } from "./mock/conversation-seeds";
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

export type NativeError = { kind: string; message?: unknown } | string;

export type Pending = { pending: true };

export type RestFault = {
	method?: string;
	path: string | { pattern: string };
} & ({ status: number; body?: unknown } | { error: NativeError } | Pending);

export type MethodFault = { command: string } & (
	| { error: NativeError }
	| Pending
);

export type DemoProfilePatch = {
	isNew?: boolean;
	isVisiting?: boolean;
	onlineUntil?: number | null;
	seen?: number | null;
	unreadCount?: number;
	height?: number | null;
	nsfw?: number | null;
	meetAt?: number[];
	hivStatus?: number | null;
	sexualHealth?: number[];
	genders?: number[] | null;
	pronouns?: number[] | null;
	tapType?: 0 | 1 | 2 | null;
};

export type MethodOutcome =
	| { error: NativeError }
	| Pending
	| { answer: unknown };

export type ScreenshotScene = {
	signedOut: boolean;
	onboarding: boolean;
	updates: boolean;
	playBuild: boolean;
	emptyLists: DemoList[];
	inbox: DemoInbox | null;
	profiles: Record<number, DemoProfilePatch>;
	maskedProfiles: number[];
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
	recordSourceLayout: () => void;
	matchSourceLayout: () => boolean;
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
	playBuild: false,
	emptyLists: [],
	inbox: null,
	profiles: {},
	maskedProfiles: [],
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

export function sceneProfile(profileId: number): DemoProfilePatch {
	return screenshotScene.profiles[profileId] ?? {};
}

export function sceneMasksProfile(profileId: number): boolean {
	return screenshotScene.maskedProfiles.includes(profileId);
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
