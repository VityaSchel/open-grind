const ANCHOR_GAP_PX = 8;
const TOAST_HOST = '[data-slot="toast-host"]';
const BOTTOM_TOASTER = '[data-sonner-toaster][data-y-position="bottom"]';
const TOAST = "[data-sonner-toast]";
const SHEET_PANEL = '[data-slot="sheet-panel"]';

function release(toaster: HTMLElement | null) {
	toaster?.removeAttribute("data-sheet-anchored");
	toaster?.style.removeProperty("--sheet-anchor");
	toaster?.style.removeProperty("--toast-stack-height");
}

function stackHeight(toaster: HTMLElement): number {
	let height = 0;
	for (const toast of toaster.querySelectorAll<HTMLElement>(TOAST)) {
		const offset = Number.parseFloat(
			toast.style.getPropertyValue("--offset"),
		);
		height = Math.max(height, (offset || 0) + toast.offsetHeight);
	}
	return height;
}

export function anchorToastsAbove(sheet: HTMLElement): () => void {
	const host = document.querySelector<HTMLElement>(TOAST_HOST);
	if (host === null) return () => {};
	let toaster: HTMLElement | null = null;
	let written = { anchor: "", stack: "" };
	let frame: number | undefined;

	const follow = () => {
		frame = undefined;
		const current = host.querySelector<HTMLElement>(BOTTOM_TOASTER);
		if (current !== toaster) {
			release(toaster);
			toaster = current;
			written = { anchor: "", stack: "" };
		}
		if (toaster === null) return;
		const panel = sheet.querySelector<HTMLElement>(SHEET_PANEL);
		if (panel !== null) {
			const anchor = `${Math.round(innerHeight - panel.getBoundingClientRect().top + ANCHOR_GAP_PX)}px`;
			const stack = `${Math.ceil(stackHeight(toaster))}px`;
			if (anchor !== written.anchor)
				toaster.style.setProperty("--sheet-anchor", anchor);
			if (stack !== written.stack)
				toaster.style.setProperty("--toast-stack-height", stack);
			written = { anchor, stack };
			toaster.setAttribute("data-sheet-anchored", "");
		}
		frame = requestAnimationFrame(follow);
	};

	const observer = new MutationObserver(() => {
		if (frame === undefined) follow();
	});
	observer.observe(host, { childList: true, subtree: true });
	follow();
	return () => {
		observer.disconnect();
		if (frame !== undefined) cancelAnimationFrame(frame);
		release(toaster);
	};
}
