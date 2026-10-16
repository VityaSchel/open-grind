import { invoke } from "@tauri-apps/api/core";

const openedListeners = new Set<() => void>();
let openings = 0;

export function openingPushDeeplink(): boolean {
	return openings > 0;
}

export async function pushDeeplinkAhead(): Promise<boolean> {
	if (openingPushDeeplink()) return true;
	const pending = await invoke<boolean>("push_deeplink_pending").catch(
		() => false,
	);
	return pending || openingPushDeeplink();
}

export function onPushDeeplinkOpened(listener: () => void): () => void {
	openedListeners.add(listener);
	return () => openedListeners.delete(listener);
}

export function untilPushDeeplinkOpened({ ms }: { ms: number }): Promise<void> {
	return new Promise((resolve) => {
		const finish = () => {
			clearTimeout(timer);
			stop();
			resolve();
		};
		const stop = onPushDeeplinkOpened(finish);
		const timer = setTimeout(finish, ms);
	});
}

export async function whileOpeningPushDeeplink(
	open: () => Promise<void>,
): Promise<void> {
	openings += 1;
	try {
		await open();
	} finally {
		openings -= 1;
		if (openings === 0) for (const listener of openedListeners) listener();
	}
}
