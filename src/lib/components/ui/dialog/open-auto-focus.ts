const AUTOFOCUS = "[data-autofocus]";
const POINTER_AUTOFOCUS = '[data-autofocus]:not([data-autofocus="keyboard"])';
const KEYBOARD_FOCUS = ":focus-visible:not(input, textarea, [contenteditable])";
const TABBABLE = "a[href], button, input, select, textarea, [tabindex]";

type OpenAutoFocusHandler = (event: Event) => void;

function focusFirstTabbable(marked: HTMLElement): boolean {
	const candidates =
		marked.tabIndex >= 0
			? [marked]
			: marked.querySelectorAll<HTMLElement>(TABBABLE);
	for (const candidate of candidates) {
		if (candidate.tabIndex < 0) continue;
		candidate.focus({ preventScroll: true });
		if (candidate.ownerDocument.activeElement === candidate) return true;
	}
	return false;
}

function focusInitialTarget({
	content,
	targets,
}: {
	content: HTMLElement;
	targets: string;
}) {
	if (!content.isConnected) return;
	if (content.contains(content.ownerDocument.activeElement)) return;
	for (const marked of content.querySelectorAll<HTMLElement>(targets)) {
		if (focusFirstTabbable(marked)) return;
	}
	content.focus({ preventScroll: true });
}

function hasAutofocusTarget(content: HTMLElement | null): boolean {
	return Boolean(
		content?.matches(AUTOFOCUS) || content?.querySelector(AUTOFOCUS),
	);
}

export function focusOnOpen({
	content,
	fallback,
	onOpenAutoFocus,
}: {
	content: () => HTMLElement | null;
	fallback: "content" | "library";
	onOpenAutoFocus?: OpenAutoFocusHandler;
}): OpenAutoFocusHandler {
	return (event) => {
		onOpenAutoFocus?.(event);
		if (event.defaultPrevented) return;
		if (fallback === "library" && !hasAutofocusTarget(content())) return;
		event.preventDefault();
		const targets = document.activeElement?.matches(KEYBOARD_FOCUS)
			? AUTOFOCUS
			: POINTER_AUTOFOCUS;
		requestAnimationFrame(() => {
			const opened = content();
			if (opened) focusInitialTarget({ content: opened, targets });
		});
	};
}
