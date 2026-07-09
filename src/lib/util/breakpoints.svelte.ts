import { MediaQuery } from "svelte/reactivity";

export const breakpoints = {
	md: "48rem",
	split: "560px",
	"settings-dialog": "424px",
	"selection-bar-compact": "350px",
	"selection-bar-collapse": "300px",
	cramped: "250px",
} as const;

export type Breakpoint = keyof typeof breakpoints;

export const below = (breakpoint: Breakpoint) =>
	new MediaQuery(`(width < ${breakpoints[breakpoint]})`);

export const above = (breakpoint: Breakpoint) =>
	new MediaQuery(`(width >= ${breakpoints[breakpoint]})`);
