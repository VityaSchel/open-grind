import { $ } from "bun";

const CRATES = [
	{
		name: "http2",
		version: "0.4.21",
		sha256: "a6e23815f8ec982e1452e1d0fda921ec20a9187fb610ad003c90cc5abd65b2c4",
		keep: ["Cargo.toml", "LICENSE", "src"],
	},
	{
		name: "wry",
		version: "0.55.1",
		sha256: "186f9871daa55fd9c016578b810d149de58367113db7fb72b462d2323ce19514",
		keep: [
			"Cargo.toml",
			"LICENSE-APACHE",
			"LICENSE-MIT",
			"build.rs",
			"src",
		],
	},
	{
		name: "tauri-plugin-geolocation",
		version: "2.3.2",
		sha256: "0366e51823ad001ff1a47f116cd34ddfea3d94ebeb2309caf42e290dec27e0a6",
		keep: [
			"Cargo.toml",
			"LICENSE_APACHE-2.0",
			"LICENSE_MIT",
			"android",
			"api-iife.js",
			"build.rs",
			"ios",
			"permissions",
			"src",
		],
	},
	{
		name: "tauri-codegen",
		version: "2.6.1",
		sha256: "6bd11644962add2549a60b7e7c6800f17d7020156e02f516021d8103e80cc528",
		keep: ["Cargo.toml", "LICENSE_MIT", "LICENSE_APACHE-2.0", "src"],
	},
];

const repoRoot = `${import.meta.dir}/..`;
const patchesDir = `${repoRoot}/src-tauri/patches`;
const OUT_REL = "src-tauri/.patched";
const outDir = `${repoRoot}/${OUT_REL}`;

type Crate = (typeof CRATES)[number];

const patchOf = ({ name, version }: Crate) =>
	`${patchesDir}/${name}@${version}.patch`;

async function stampOf(crate: Crate) {
	return new Bun.CryptoHasher("sha256")
		.update(crate.sha256)
		.update(await Bun.file(patchOf(crate)).bytes())
		.digest("hex");
}

async function download({ name, version, sha256 }: Crate, into: string) {
	const url = `https://static.crates.io/crates/${name}/${name}-${version}.crate`;
	const response = await fetch(url);
	if (!response.ok) throw new Error(`${url}: ${response.status}`);
	const crate = new Uint8Array(await response.arrayBuffer());

	const digest = new Bun.CryptoHasher("sha256").update(crate).digest("hex");
	if (digest !== sha256)
		throw new Error(`${name}: expected sha256 ${sha256}, got ${digest}`);

	await Bun.write(`${into}/crate.tar.gz`, crate);
	await $`tar -xzf crate.tar.gz`.cwd(into);
	return `${into}/${name}-${version}`;
}

async function pristine(crate: Crate, work: string) {
	const extracted = await download(crate, work);
	await $`mkdir -p ${work}/a`;
	for (const entry of crate.keep)
		await $`cp -R ${extracted}/${entry} ${work}/a/${entry}`;
	return `${work}/a`;
}

async function apply(crate: Crate) {
	const dest = `${outDir}/${crate.name}`;
	const stamp = await stampOf(crate);
	const current = await Bun.file(`${dest}/.stamp`)
		.text()
		.catch(() => null);
	if (current === stamp) return `${crate.name} up to date`;

	const work = (await $`mktemp -d`.text()).trim();
	try {
		const source = await pristine(crate, work);
		await $`rm -rf ${dest}`;
		await $`mkdir -p ${outDir}`;
		await $`cp -R ${source} ${dest}`;
		await $`git apply -p1 --directory=${`${OUT_REL}/${crate.name}`} ${patchOf(crate)}`.cwd(
			repoRoot,
		);
		await Bun.write(`${dest}/.stamp`, stamp);
		return `${crate.name} ${crate.version} patched`;
	} finally {
		await $`rm -rf ${work}`;
	}
}

async function rediff(crate: Crate) {
	const work = (await $`mktemp -d`.text()).trim();
	try {
		await pristine(crate, work);
		await $`cp -R ${outDir}/${crate.name} ${work}/b`;
		await $`rm -f ${work}/b/.stamp`;
		const diff = await $`git diff --no-index --no-color --no-prefix a b`
			.cwd(work)
			.nothrow()
			.text();
		await Bun.write(patchOf(crate), diff);
		return `${crate.name}@${crate.version}.patch rewritten`;
	} finally {
		await $`rm -rf ${work}`;
	}
}

const rewrite = Bun.argv.includes("--diff");
const only = Bun.argv.find((a) => CRATES.some((c) => c.name === a));
const selected = only ? CRATES.filter((c) => c.name === only) : CRATES;

for (const crate of selected)
	console.log(rewrite ? await rediff(crate) : await apply(crate));
