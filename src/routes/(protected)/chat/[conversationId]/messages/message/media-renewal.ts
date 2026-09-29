import { createContext } from "svelte";

const [getMediaRenewal, setMediaRenewal, hasMediaRenewal] =
	createContext<() => Promise<void>>();

export { setMediaRenewal };

export function mediaRenewal(): (() => Promise<void>) | undefined {
	return hasMediaRenewal() ? getMediaRenewal() : undefined;
}
