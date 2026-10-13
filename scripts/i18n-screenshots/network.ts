import type {
	BrowserContext,
	Request,
	Response,
	Route,
} from "@playwright/test";
import { createHash } from "node:crypto";

export type RouteHandler = (route: Route) => Promise<void>;

export type NetworkGuard = {
	catching: (handler: RouteHandler) => RouteHandler;
	takeBlocked: () => Promise<string[]>;
	takeRouteErrors: () => string[];
	takeUnlicensed: () => Promise<string[]>;
};

export type EscapeSink = {
	proxy: { server: string; bypass: string };
	take: () => string[];
	stop: () => void;
};

const UNLICENSED_ASSETS = [
	new URL("../../src/lib/assets/clippy.avif", import.meta.url),
];
const UNLICENSED_PATH = /\/clippy[^/]*\.avif$/;
const PLACEHOLDER_HEADER = "x-i18n-screenshots-placeholder";
const PLACEHOLDER_SIDE = 96;
const REMOTE_PROTOCOLS = new Set(["http:", "https:", "ws:", "wss:"]);
const CANCELLED_BY_PAGE = "net::ERR_ABORTED";
const LOOPBACK = "127.0.0.1";

function sha256Hex(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

async function unlicensedHashes(): Promise<Set<string>> {
	const files = await Promise.all(
		UNLICENSED_ASSETS.map((url) => Bun.file(url).bytes()),
	);
	return new Set(files.map(sha256Hex));
}

function placeholderFace(): string {
	const side = PLACEHOLDER_SIDE;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}" viewBox="0 0 ${side} ${side}"><rect width="${side}" height="${side}" fill="#d4d4d4"/><circle cx="${side / 2}" cy="${side / 2}" r="${side * 0.3}" fill="#a3a3a3"/></svg>`;
}

async function servedUnlicensed({
	response,
	hashes,
}: {
	response: Response;
	hashes: Set<string>;
}): Promise<boolean> {
	if (response.request().resourceType() !== "image") return false;
	if (PLACEHOLDER_HEADER in response.headers()) return false;
	const body = await response.body().catch(() => null);
	return body !== null && hashes.has(sha256Hex(body));
}

async function answeringServer(request: Request): Promise<string | null> {
	const response = await request.response().catch(() => null);
	const address = await response?.serverAddr().catch(() => null);
	return address ? `${address.ipAddress}:${address.port}` : null;
}

export function openEscapeSink(): EscapeSink {
	const escaped: string[] = [];
	const listener = Bun.listen({
		hostname: LOOPBACK,
		port: 0,
		socket: {
			data(socket, data) {
				escaped.push(data.toString("latin1").split("\r\n", 1)[0] ?? "");
				socket.terminate();
			},
		},
	});
	return {
		proxy: {
			server: `http://${LOOPBACK}:${listener.port}`,
			bypass: "localhost",
		},
		take: () => escaped.splice(0),
		stop: () => listener.stop(true),
	};
}

export async function guardNetwork({
	context,
	origin,
	escapes,
}: {
	context: BrowserContext;
	origin: string;
	escapes: EscapeSink;
}): Promise<NetworkGuard> {
	const blocked: string[] = [];
	const routeErrors: string[] = [];
	const unlicensed: string[] = [];
	const aborted = new WeakSet<Request>();
	const checks = new Set<Promise<void>>();
	const hashes = await unlicensedHashes();
	const track = (check: Promise<void>) => {
		checks.add(check);
		void check.finally(() => checks.delete(check));
	};
	const isRemote = (address: string) => {
		const url = new URL(address);
		return REMOTE_PROTOCOLS.has(url.protocol) && url.origin !== origin;
	};
	const catching =
		(handler: RouteHandler): RouteHandler =>
		async (route) => {
			try {
				await handler(route);
			} catch (error) {
				routeErrors.push(`${route.request().url()}: ${String(error)}`);
			}
		};
	await context.route(
		(url) => url.origin !== origin,
		catching(async (route) => {
			blocked.push(route.request().url());
			aborted.add(route.request());
			await route.abort("blockedbyclient");
		}),
	);
	await context.route(
		(url) => url.origin === origin && UNLICENSED_PATH.test(url.pathname),
		catching((route) =>
			route.fulfill({
				contentType: "image/svg+xml",
				headers: { [PLACEHOLDER_HEADER]: "1" },
				body: placeholderFace(),
			}),
		),
	);
	context.on("response", (response) => {
		track(
			servedUnlicensed({ response, hashes }).then((served) => {
				if (served) unlicensed.push(response.url());
			}),
		);
	});
	context.on("requestfinished", (request) => {
		if (!isRemote(request.url())) return;
		track(
			answeringServer(request).then((server) => {
				if (server) blocked.push(`${request.url()} (from ${server})`);
			}),
		);
	});
	context.on("requestfailed", (request) => {
		const error = request.failure()?.errorText;
		if (!isRemote(request.url()) || aborted.has(request)) return;
		if (error === CANCELLED_BY_PAGE) return;
		blocked.push(`${request.url()} (${error})`);
	});
	context.on("close", escapes.stop);
	await context.routeWebSocket(/.*/, async (socket) => {
		blocked.push(socket.url());
		await socket.close();
	});
	return {
		catching,
		takeBlocked: async () => {
			await Promise.all(checks);
			const proxied = escapes.take().map((line) => `proxy got ${line}`);
			return [...blocked.splice(0), ...proxied];
		},
		takeRouteErrors: () => routeErrors.splice(0),
		takeUnlicensed: async () => {
			await Promise.all(checks);
			return unlicensed.splice(0);
		},
	};
}
