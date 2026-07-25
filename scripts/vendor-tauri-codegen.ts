import { $ } from "bun";
import { mkdtemp, rm, mkdir, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const VERSION = "2.6.1";
const SHA256 =
	"6bd11644962add2549a60b7e7c6800f17d7020156e02f516021d8103e80cc528";
const KEEP = ["Cargo.toml", "LICENSE_MIT", "LICENSE_APACHE-2.0", "src"];

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const vendorDir = path.join(repoRoot, "src-tauri", "patches", "tauri-codegen");
const patchFile = path.join(
	repoRoot,
	"src-tauri",
	"patches",
	`tauri-codegen@${VERSION}.patch`,
);

const url = `https://static.crates.io/crates/tauri-codegen/tauri-codegen-${VERSION}.crate`;
const response = await fetch(url);
if (!response.ok) throw new Error(`${url}: ${response.status}`);
const crate = new Uint8Array(await response.arrayBuffer());

const digest = new Bun.CryptoHasher("sha256").update(crate).digest("hex");
if (digest !== SHA256)
	throw new Error(`checksum mismatch: expected ${SHA256}, got ${digest}`);

const workDir = await mkdtemp(path.join(tmpdir(), "tauri-codegen-vendor-"));
try {
	await Bun.write(path.join(workDir, "crate.tar.gz"), crate);
	await $`tar -xzf crate.tar.gz`.cwd(workDir);
	const extracted = path.join(workDir, `tauri-codegen-${VERSION}`);

	await rm(vendorDir, { recursive: true, force: true });
	await mkdir(vendorDir, { recursive: true });
	for (const entry of KEEP)
		await cp(path.join(extracted, entry), path.join(vendorDir, entry), {
			recursive: true,
		});

	await $`git apply -p1 --directory=${path.relative(repoRoot, vendorDir)} ${patchFile}`.cwd(
		repoRoot,
	);
} finally {
	await rm(workDir, { recursive: true, force: true });
}

console.log(
	`vendored tauri-codegen ${VERSION} + ${path.basename(patchFile)} -> ${path.relative(repoRoot, vendorDir)}`,
);
