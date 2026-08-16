import { listen } from "@tauri-apps/api/event";

type ScrollPhase = {
	phase: string;
	momentum: string;
	deltaX: number;
	deltaY: number;
};

// Companion to src-tauri/src/scroll_phase.rs: prints what AppKit knows about
// each wheel event that the DOM never learns — whether fingers drive it or
// momentum does. Emitted only by macOS debug builds; the DEV guard at the
// call site keeps this module out of production bundles.
export function installScrollPhaseProbe(): void {
	void listen<ScrollPhase>("debug:scroll-phase", ({ payload }) => {
		const { phase, momentum, deltaX, deltaY } = payload;
		const state =
			phase !== "none"
				? `fingers ${phase}`
				: momentum !== "none"
					? `momentum ${momentum}`
					: "legacy/no-phase";
		console.log(
			`[scroll-phase] ${state} dx=${deltaX.toFixed(1)} dy=${deltaY.toFixed(1)}`,
		);
	}).catch(console.error);
}
