import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/svelte";
import { expect, vi } from "vitest";

import { slot } from "$lib/i18n/fixtures/dom";
import { commandCenterState } from "./command-center-state.svelte";
import CommandCenter from "./CommandCenter.svelte";

Element.prototype.scrollIntoView = () => {};

export function options(): HTMLElement[] {
	return screen.queryAllByRole("option");
}

export function option(value: string): HTMLElement | undefined {
	return options().find((item) => item.dataset.value === value);
}

export function textOf(node: Node): string {
	return node.textContent?.trim() ?? "";
}

export function resetCommandCenter() {
	cleanup();
	commandCenterState.open = false;
	commandCenterState.query = "";
	commandCenterState.value = "";
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

export function expectCommandGroup({
	name,
	value,
}: {
	name: string | RegExp;
	value: string;
}) {
	const group = slot("command-group");
	expect(screen.getByRole("group", { name })).toBe(
		within(group).getByRole("group"),
	);
	expect(group.dataset.value).toBe(value);
}
