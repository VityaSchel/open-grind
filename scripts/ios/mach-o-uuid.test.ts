import { describe, expect, it } from "vitest";

import { contentUuid, withUuid } from "./mach-o-uuid";

const LC_SEGMENT_64 = 0x19;
const LC_UUID = 0x1b;
const LC_CODE_SIGNATURE = 0x1d;
const UUID_AT = 32 + 72 + 8;

function machO({
	uuidFill,
	content,
	signed = false,
}: {
	uuidFill: number;
	content: number;
	signed?: boolean;
}): Uint8Array {
	const commands: [number, number][] = [
		[LC_SEGMENT_64, 72],
		[LC_UUID, 24],
		...(signed ? ([[LC_CODE_SIGNATURE, 16]] as [number, number][]) : []),
	];
	const size = commands.reduce((sum, [, length]) => sum + length, 0);
	const binary = new Uint8Array(32 + size + 64);
	const view = new DataView(binary.buffer);
	view.setUint32(0, 0xfeedfacf, true);
	view.setUint32(16, commands.length, true);
	view.setUint32(20, size, true);
	let offset = 32;
	for (const [command, length] of commands) {
		view.setUint32(offset, command, true);
		view.setUint32(offset + 4, length, true);
		offset += length;
	}
	binary.fill(uuidFill, UUID_AT, UUID_AT + 16);
	binary.fill(content, 32 + size);
	return binary;
}

describe("contentUuid", () => {
	it("is the same for binaries that differ only in their linker UUID", () => {
		expect(contentUuid(machO({ uuidFill: 1, content: 7 }))).toEqual(
			contentUuid(machO({ uuidFill: 2, content: 7 })),
		);
	});

	it("changes when the code changes", () => {
		expect(contentUuid(machO({ uuidFill: 1, content: 7 }))).not.toEqual(
			contentUuid(machO({ uuidFill: 1, content: 8 })),
		);
	});

	it("is a version 8 RFC 9562 UUID", () => {
		const uuid = contentUuid(machO({ uuidFill: 1, content: 7 }));
		expect(uuid).toHaveLength(16);
		expect(uuid[6]! >> 4).toBe(8);
		expect(uuid[8]! >> 6).toBe(0b10);
	});

	it("refuses a signed binary, whose signature hashes the old UUID", () => {
		expect(() =>
			contentUuid(machO({ uuidFill: 1, content: 7, signed: true })),
		).toThrow("remove the code signature");
	});

	it("refuses a universal binary", () => {
		const fat = machO({ uuidFill: 1, content: 7 });
		new DataView(fat.buffer).setUint32(0, 0xbebafeca, true);
		expect(() => contentUuid(fat)).toThrow("thin 64-bit");
	});
});

describe("withUuid", () => {
	it("replaces only the LC_UUID bytes", () => {
		const binary = machO({ uuidFill: 1, content: 7 });
		const uuid = new Uint8Array(16).fill(9);
		const updated = withUuid({ binary, uuid });
		expect(updated.subarray(UUID_AT, UUID_AT + 16)).toEqual(uuid);
		expect(updated.subarray(0, UUID_AT)).toEqual(
			binary.subarray(0, UUID_AT),
		);
		expect(updated.subarray(UUID_AT + 16)).toEqual(
			binary.subarray(UUID_AT + 16),
		);
	});
});
