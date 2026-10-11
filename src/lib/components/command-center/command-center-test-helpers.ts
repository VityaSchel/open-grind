import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, vi } from "vitest";

import { commandCenterState } from "./command-center-state.svelte";
import CommandCenter from "./CommandCenter.svelte";

Element.prototype.scrollIntoView = () => {};

export function options(): HTMLElement[] {
	return screen.queryAllByRole("option");
}

export function option(value: string): HTMLElement | undefined {
	return options().find((item) => item.dataset.value === value);
}

export async function enterQuery(query: string) {
	await fireEvent.input(screen.getByRole("combobox"), {
		target: { value: query },
	});
}

export async function type(query: string) {
	await enterQuery(query);
	await vi.waitFor(() => expect(options().length).toBeGreaterThan(0));
}

export function openCommandCenter() {
	commandCenterState.open = true;
	render(CommandCenter);
}

export async function openWith(query: string) {
	openCommandCenter();
	await type(query);
}
