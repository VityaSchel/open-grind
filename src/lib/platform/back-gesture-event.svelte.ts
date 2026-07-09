import { SvelteSet } from "svelte/reactivity";

export const backGestureEventHandlers = new SvelteSet<() => boolean>();
