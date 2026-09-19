import type { Attachment } from "svelte/attachments";

export function fieldSizingFallback(
	value: () => unknown,
): Attachment<HTMLTextAreaElement> {
	return (textarea) => {
		if (CSS.supports("field-sizing", "content")) return;
		const fit = () => {
			const { borderTopWidth, borderBottomWidth } =
				getComputedStyle(textarea);
			textarea.style.setProperty("overflow-y", "hidden", "important");
			textarea.style.setProperty("height", "0px", "important");
			const borderBoxHeight =
				textarea.scrollHeight +
				parseFloat(borderTopWidth) +
				parseFloat(borderBottomWidth);
			textarea.style.setProperty(
				"height",
				`${borderBoxHeight}px`,
				"important",
			);
			textarea.style.removeProperty("overflow-y");
		};
		let width = textarea.offsetWidth;
		let nextFrameFit = 0;
		const refitOnWidthChange = new ResizeObserver(() => {
			if (textarea.offsetWidth === width) return;
			width = textarea.offsetWidth;
			cancelAnimationFrame(nextFrameFit);
			nextFrameFit = requestAnimationFrame(fit);
		});
		refitOnWidthChange.observe(textarea);
		document.fonts.addEventListener("loadingdone", fit);
		$effect(() => {
			value();
			fit();
		});
		return () => {
			refitOnWidthChange.disconnect();
			cancelAnimationFrame(nextFrameFit);
			document.fonts.removeEventListener("loadingdone", fit);
			textarea.style.removeProperty("height");
		};
	};
}
