import { $ } from "bun";

import { hostAssetSuffix } from "../../../scripts/lib/asset-suffix";

const tick = 100;

export type Harness = {
	origin: string;
	publicKey: string;
	asset: string;
	stop: () => Promise<void>;
};

export type Payload =
	| { file: string }
	| { bundle: string }
	| { invent: number };

export type ServerOptions = {
	payload: Payload;
	tag: string;
	home: string;
	port: number;
	suffix?: string;
	uuid?: string;
	rate?: number;
	failMode?: string;
	journal?: string;
	prerelease?: boolean;
	notes?: string;
};

function minisign({ args, input }: { args: string[]; input: string }): void {
	const { success } = Bun.spawnSync(["minisign", ...args], {
		stdin: Buffer.from(input),
		stdout: "inherit",
		stderr: "inherit",
	});
	if (!success) throw new Error(`minisign ${args[0]} failed`);
}

function passwordProtected(key: string): boolean {
	const encoded = key.split("\n")[1]?.trim();
	if (!encoded) return false;
	const kdf = Buffer.from(encoded, "base64").subarray(2, 4);
	return kdf.length === 2 && !kdf.every((byte) => byte === 0);
}

async function releaseKey(home: string): Promise<string> {
	if (!Bun.which("minisign")) {
		throw new Error("minisign not found — run this inside 'nix develop'");
	}
	const secret = `${home}/minisign.key`;
	const publicKeyPath = `${home}/minisign.pub`;
	await $`mkdir -p ${home}`;
	if (!(await Bun.file(secret).exists())) {
		minisign({
			args: ["-G", "-f", "-W", "-p", publicKeyPath, "-s", secret],
			input: "",
		});
	} else if (passwordProtected(await Bun.file(secret).text())) {
		minisign({ args: ["-C", "-W", "-s", secret], input: "\n" });
	}
	const published = (await Bun.file(publicKeyPath).text())
		.split("\n")
		.map((line) => line.trim())
		.find((line) => line.startsWith("RW") && line.length === 56);
	if (!published) throw new Error(`${publicKeyPath} holds no minisign key`);
	return published;
}

async function signedPayload({
	source,
	name,
	home,
}: {
	source: Payload;
	name: string;
	home: string;
}) {
	const secret = `${home}/minisign.key`;
	const payload = `${home}/${name}`;
	const detached = `${payload}.minisig`;
	const sign = () =>
		minisign({
			args: ["-S", "-s", secret, "-m", payload, "-x", detached],
			input: "",
		});

	if ("invent" in source) {
		const signedAlready =
			(await Bun.file(payload).exists()) &&
			Bun.file(payload).size === source.invent;
		if (!signedAlready) {
			await Bun.write(
				payload,
				new Uint8Array(source.invent).map((_, index) => index % 251),
			);
			sign();
		}
	} else {
		await $`rm -f ${payload} ${detached}`;
		if ("bundle" in source) {
			await $`ditto -c -k --sequesterRsrc --keepParent ${source.bundle} ${payload}`;
		} else {
			await Bun.write(payload, Bun.file(source.file));
		}
		sign();
	}

	return {
		body: await Bun.file(payload).bytes(),
		signature: await Bun.file(detached).bytes(),
	};
}

function corrupted(bytes: Uint8Array): Uint8Array {
	const copy = new Uint8Array(bytes);
	const last = copy.length - 1;
	copy[last] = (copy[last] ?? 0) ^ 0xff;
	return copy;
}

function paced(
	bytes: Uint8Array,
	{ rate, failMode }: { rate: number; failMode: string },
) {
	const dropAt =
		failMode === "drop" ? Math.floor(bytes.byteLength * 0.4) : -1;
	if (!rate && dropAt < 0) return bytes;
	const step = Math.max(
		1,
		Math.round((rate * tick) / 1000) || bytes.byteLength,
	);
	let sent = 0;
	return new ReadableStream<Uint8Array>({
		async pull(controller) {
			if (dropAt >= 0 && sent >= dropAt) {
				controller.error(new Error("connection dropped"));
				return;
			}
			if (sent >= bytes.byteLength) {
				controller.close();
				return;
			}
			controller.enqueue(bytes.subarray(sent, sent + step));
			sent += step;
			await Bun.sleep(tick);
		},
	});
}

export async function startServer({
	payload,
	tag,
	home,
	port,
	suffix = hostAssetSuffix(),
	uuid = "demo-payload",
	rate = 0,
	failMode = "",
	journal: journalPath,
	prerelease = false,
	notes = "Local end-to-end demo release.",
}: ServerOptions): Promise<Harness> {
	const etag = `"${uuid}"`;
	const publicKey = await releaseKey(home);
	const asset = `open-grind-${tag}${suffix}`;
	const { body, signature } = await signedPayload({
		source: payload,
		name: asset,
		home,
	});
	const origin = `http://127.0.0.1:${port}/`;
	if (journalPath) await $`rm -f ${journalPath}`;
	const journal = journalPath ? Bun.file(journalPath).writer() : null;

	const served = failMode === "signature" ? corrupted(body) : body;
	const advertised =
		failMode === "oversize" ? served.byteLength - 1024 : served.byteLength;

	const note = (request: Request) => {
		if (!journal) return;
		const url = new URL(request.url);
		journal.write(
			`${JSON.stringify({
				path: url.pathname,
				search: url.search,
				range: request.headers.get("range"),
				ifRange: request.headers.get("if-range"),
			})}\n`,
		);
		journal.flush();
	};

	const release = {
		tag_name: tag,
		draft: false,
		prerelease,
		body: notes,
		published_at: new Date(0).toISOString(),
		assets: [
			{
				name: asset,
				size: advertised,
				uuid,
				browser_download_url: `${origin}download/${asset}`,
			},
			...(failMode === "unsigned"
				? []
				: [
						{
							name: `${asset}.minisig`,
							size: signature.byteLength,
							uuid: `${uuid}-signature`,
							browser_download_url: `${origin}download/${asset}.minisig`,
						},
					]),
		],
	};

	const resumeFrom = (request: Request) => {
		const range = request.headers.get("range");
		const ifRange = request.headers.get("if-range");
		if (!range || (ifRange !== null && ifRange !== etag)) return null;
		const start = Number(/bytes=(\d+)-/.exec(range)?.[1]);
		return Number.isFinite(start) && start < served.byteLength
			? start
			: null;
	};

	const server = Bun.serve({
		port,
		hostname: "127.0.0.1",
		routes: {
			"/api/v1/repos/*": (request) => {
				note(request);
				if (failMode === "server") {
					return new Response("upstream is unwell", { status: 500 });
				}
				const stableOnly =
					new URL(request.url).searchParams.get("pre-release") ===
					"false";
				return Response.json(
					stableOnly && release.prerelease ? [] : [release],
				);
			},
			[`/download/${asset}`]: (request: Request) => {
				note(request);
				const start = resumeFrom(request);
				const chunk = start === null ? served : served.subarray(start);
				return new Response(paced(chunk, { rate, failMode }), {
					status: start === null ? 200 : 206,
					headers: {
						ETag: etag,
						"Accept-Ranges": "bytes",
						"Content-Length": String(chunk.byteLength),
						...(start !== null && {
							"Content-Range": `bytes ${start}-${served.byteLength - 1}/${served.byteLength}`,
						}),
					},
				});
			},
			[`/download/${asset}.minisig`]: (request: Request) => {
				note(request);
				return new Response(signature);
			},
		},
		fetch: (request) => {
			note(request);
			return new Response("not found", { status: 404 });
		},
	});

	return { origin, publicKey, asset, stop: () => server.stop(true) };
}
