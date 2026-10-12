import { resolve, sep } from "node:path";
import { parseArgs } from "node:util";

export const SERVER_PORT = 5396;
export const BUILD_DIR = Bun.fileURLToPath(
	new URL("../../build", import.meta.url),
);

const ASSETS_PREFIX = "/_app/";

export type StaticServer = { origin: string; stop: () => Promise<void> };

function decodedPathname(pathname: string): string | null {
	try {
		return decodeURIComponent(pathname);
	} catch {
		return null;
	}
}

function fileWithin({ root, pathname }: { root: string; pathname: string }) {
	const decoded = decodedPathname(pathname);
	if (decoded === null) return null;
	const path = resolve(root, `.${decoded}`);
	return path.startsWith(`${root}${sep}`) ? Bun.file(path) : null;
}

export function serveBuild({
	root = BUILD_DIR,
	port = SERVER_PORT,
}: { root?: string; port?: number } = {}): StaticServer {
	const directory = resolve(root);
	const fallback = Bun.file(`${directory}${sep}index.html`);
	const server = Bun.serve({
		hostname: "localhost",
		port,
		async fetch(request) {
			if (request.method !== "GET" && request.method !== "HEAD") {
				return new Response(null, { status: 405 });
			}
			const { pathname } = new URL(request.url);
			const file = fileWithin({ root: directory, pathname });
			if (file && (await file.exists())) return new Response(file);
			if (pathname.startsWith(ASSETS_PREFIX)) {
				return new Response(null, { status: 404 });
			}
			return new Response(fallback, {
				headers: { "Content-Type": "text/html;charset=utf-8" },
			});
		},
	});
	return { origin: server.url.origin, stop: () => server.stop(true) };
}

export async function waitUntilServing(origin: string): Promise<void> {
	const response = await fetch(origin);
	if (!response.ok) {
		throw new Error(`${origin} answered ${response.status}`);
	}
	await response.arrayBuffer();
}

if (import.meta.main) {
	const { values } = parseArgs({
		options: {
			root: { type: "string", default: BUILD_DIR },
			port: { type: "string", default: String(SERVER_PORT) },
		},
	});
	const startedAt = performance.now();
	const server = serveBuild({ root: values.root, port: Number(values.port) });
	await waitUntilServing(server.origin);
	console.log(
		`Serving ${values.root} on ${server.origin} after ${Math.round(performance.now() - startedAt)} ms`,
	);
}
