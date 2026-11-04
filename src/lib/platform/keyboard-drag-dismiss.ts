import { invoke } from "@tauri-apps/api/core";
import type { Attachment } from "svelte/attachments";

import { currentPlatform } from "#lib/platform/os.ts";
import { type PagePoint, uncoveredCenter } from "#lib/util/uncovered-center.ts";

function letDragDismiss(target: PagePoint | null) {
	invoke("set_keyboard_drag_dismiss", { target }).catch((error: unknown) => {
		console.error("Failed to let a drag close the keyboard", error);
	});
}

function dismissIosKeyboardByDrag(scroller: HTMLElement): () => void {
	let sent: PagePoint | undefined;
	const aim = () => {
		const target = uncoveredCenter(scroller);
		if (!target || (target.x === sent?.x && target.y === sent.y)) return;
		sent = target;
		letDragDismiss(target);
	};
	const observer = new ResizeObserver(aim);
	observer.observe(scroller);
	document.addEventListener("focusin", aim);
	aim();
	return () => {
		observer.disconnect();
		document.removeEventListener("focusin", aim);
		letDragDismiss(null);
	};
}

export const keyboardDragDismiss: Attachment<HTMLElement> = (scroller) => {
	switch (currentPlatform()) {
		case "ios":
			return dismissIosKeyboardByDrag(scroller);
		case "android":
		case "linux":
		case "macos":
		case "windows":
			return;
	}
};
