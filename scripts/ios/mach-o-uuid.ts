import { createHash } from "node:crypto";

const MH_MAGIC_64 = 0xfeedfacf;
const MACH_HEADER_64_SIZE = 32;
const LC_UUID = 0x1b;
const LC_CODE_SIGNATURE = 0x1d;
const UUID_SIZE = 16;

function loadCommands(binary: Uint8Array): Map<number, number> {
	const view = new DataView(
		binary.buffer,
		binary.byteOffset,
		binary.byteLength,
	);
	if (view.getUint32(0, true) !== MH_MAGIC_64) {
		throw new Error("expected a thin 64-bit little-endian Mach-O");
	}
	const offsets = new Map<number, number>();
	let offset = MACH_HEADER_64_SIZE;
	for (let index = 0; index < view.getUint32(16, true); index += 1) {
		offsets.set(view.getUint32(offset, true), offset);
		offset += view.getUint32(offset + 4, true);
	}
	return offsets;
}

function uuidOffset(binary: Uint8Array): number {
	const command = loadCommands(binary).get(LC_UUID);
	if (command === undefined) throw new Error("the Mach-O has no LC_UUID");
	return command + 8;
}

export function contentUuid(binary: Uint8Array): Uint8Array {
	if (loadCommands(binary).has(LC_CODE_SIGNATURE)) {
		throw new Error("remove the code signature before hashing the Mach-O");
	}
	const offset = uuidOffset(binary);
	const zeroed = binary.slice();
	zeroed.fill(0, offset, offset + UUID_SIZE);
	const uuid = new Uint8Array(
		createHash("sha256").update(zeroed).digest().subarray(0, UUID_SIZE),
	);
	uuid[6] = (uuid[6]! & 0x0f) | 0x80;
	uuid[8] = (uuid[8]! & 0x3f) | 0x80;
	return uuid;
}

export function withUuid({
	binary,
	uuid,
}: {
	binary: Uint8Array;
	uuid: Uint8Array;
}): Uint8Array {
	const updated = binary.slice();
	updated.set(uuid, uuidOffset(binary));
	return updated;
}
