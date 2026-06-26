import { MediaQuery } from "svelte/reactivity";

const token = (name: string) =>
	getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export const below = (breakpoint: string) =>
	new MediaQuery(`(width < ${token(`--breakpoint-${breakpoint}`)})`);

export const above = (breakpoint: string) =>
	new MediaQuery(`(width >= ${token(`--breakpoint-${breakpoint}`)})`);
