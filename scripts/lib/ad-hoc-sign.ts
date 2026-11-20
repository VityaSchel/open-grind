import { $ } from "bun";

export async function removeSignature(binary: string): Promise<void> {
	await $`codesign_allocate -i ${binary} -r -o ${binary}.unsigned`;
	await $`mv ${binary}.unsigned ${binary}`;
}

export async function signAdHoc({
	bundle,
	executable,
	hardenedRuntime,
}: {
	bundle: string;
	executable: string;
	hardenedRuntime: boolean;
}): Promise<void> {
	const flags = hardenedRuntime ? ["--code-signature-flags", "runtime"] : [];
	await removeSignature(`${bundle}/${executable}`);
	await $`rcodesign sign -C /dev/null ${flags} ${bundle}`;
}
