import { basename, dirname } from "node:path";

import { $ } from "bun";

export function epochStamp(epoch: string): string {
	return new Date(Number(epoch) * 1000).toISOString().replace(".000Z", "Z");
}

export function sourceDateStamp(nixApp: string): string {
	const epoch = Bun.env.SOURCE_DATE_EPOCH;
	if (!epoch) {
		throw new Error(
			`SOURCE_DATE_EPOCH is unset, run \`nix run .#${nixApp}\``,
		);
	}
	return epochStamp(epoch);
}

export async function archive({
	root,
	zip,
	stamp,
}: {
	root: string;
	zip: string;
	stamp: string;
}): Promise<void> {
	await $`rm -f ${zip}`;
	await $`chmod -R u=rwX,go=rX ${root}`;
	await $`find ${root} -depth -exec touch -h -d ${stamp} '{}' +`;
	await $`find ${basename(root)} | sort | zip -q -X -y -9 -@ ${zip}`.cwd(
		dirname(root),
	);
}
