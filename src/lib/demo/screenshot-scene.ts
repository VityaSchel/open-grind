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

export type RestFault = {
	method?: string;
	path: string | { pattern: string };
} & ({ status: number; body?: unknown } | { error: NativeError });

export type MethodFault = { command: string; error: NativeError };

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
};

type UpdateToastPresenter = {
	show(stage: {
		view: { stage: string; received: number; total: number };
		kind: string;
		onActivate(): void;
		onCancel(): void;
		onDismiss(): void;
	}): void;
	dismiss(): void;
	problem(title: string): void;
	manualInstall(body: string): void;
	installed(install: { tag: string | null; kind: string }): void;
	upToDate(): void;
};

export type ScreenshotHooks = {
	scene: ScreenshotScene;
	setLocale(options: { locale: string }): Promise<void>;
	goto(path: string): Promise<void>;
	showErrorToast(options: {
		label?: string;
		error: unknown;
		onRetry?: () => void;
	}): void;
	updateToasts(component: string): UpdateToastPresenter;
	updateErrorText(
		error: unknown,
		options: { fallback: string; component?: string; kind?: string },
	): string;
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
};

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

export function sceneMethodFault(command: string): NativeError | undefined {
	if (screenshotScene.signedOut && command === "refresh_session") {
		return NOT_SIGNED_IN;
	}
	return screenshotScene.methodFaults.find(
		(fault) => fault.command === command,
	)?.error;
}
