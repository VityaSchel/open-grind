import type { BrowserContext } from "@playwright/test";

export type NetworkGuard = { takeBlocked: () => string[] };

export async function guardNetwork({
	context,
	origin,
}: {
	context: BrowserContext;
	origin: string;
}): Promise<NetworkGuard> {
	const blocked: string[] = [];
	await context.route(
		(url) => url.origin !== origin,
		async (route) => {
			blocked.push(route.request().url());
			await route.abort("blockedbyclient");
		},
	);
	await context.routeWebSocket(/.*/, async (socket) => {
		blocked.push(socket.url());
		await socket.close();
	});
	return { takeBlocked: () => blocked.splice(0) };
}
