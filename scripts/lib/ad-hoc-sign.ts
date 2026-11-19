import { $ } from "bun";

export async function signAdHoc({
	bundle,
	executable,
	hardenedRuntime,
}: {
	bundle: string;
	executable: string;
	hardenedRuntime: boolean;
}): Promise<void> {
	const binary = `${bundle}/${executable}`;
	const flags = hardenedRuntime ? ["--code-signature-flags", "runtime"] : [];
	await $`codesign_allocate -i ${binary} -r -o ${binary}.unsigned`;
	await $`mv ${binary}.unsigned ${binary}`;
	await $`rcodesign sign -C /dev/null ${flags} ${bundle}`;
}
