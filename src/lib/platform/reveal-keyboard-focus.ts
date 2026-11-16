const TEXT_ENTRY = "input, textarea";

export function revealKeyboardFocus(): () => void {
	const listening = new AbortController();
	document.addEventListener(
		"focusin",
		({ target }) => {
			if (
				target instanceof Element &&
				target.matches(":focus-visible") &&
				!target.matches(TEXT_ENTRY)
			) {
				target.scrollIntoView({ block: "nearest", inline: "nearest" });
			}
		},
		{ signal: listening.signal },
	);
	return () => {
		listening.abort();
	};
}
