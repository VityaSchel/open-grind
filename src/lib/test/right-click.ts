import { fireEvent } from "@testing-library/svelte";

export async function rightClick(element: Element): Promise<void> {
	const event = new MouseEvent("contextmenu", {
		bubbles: true,
		cancelable: true,
		button: 2,
	});
	Object.defineProperty(event, "pointerType", { value: "mouse" });
	await fireEvent(element, event);
}
