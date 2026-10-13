import type * as DemoRuntime from "./runtime";

export { demoEnabled, screenshotsEnabled } from "./config";

let runtime: typeof DemoRuntime | undefined;

export async function loadDemo(): Promise<void> {
	runtime ??= await import("./runtime");
}

export function demo(): typeof DemoRuntime {
	if (runtime === undefined) throw new Error("The demo is not loaded yet");
	return runtime;
}
