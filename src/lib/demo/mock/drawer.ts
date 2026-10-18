import { HOUR, NOW } from "../config";
import { hashFromSeed } from "./avatars";

type DemoDrawerMedia = {
	id: number;
	url: string;
	contentType: string;
	createdTs: number;
	used: boolean;
	takenOnGrindr: boolean;
};

let uploadedDrawerMediaId = 920_000;
const uploadedDrawerMedia: DemoDrawerMedia[] = [];

export function demoUploadChatMedia({
	bytes,
	contentType,
}: {
	bytes: Uint8Array<ArrayBuffer>;
	contentType: string;
}): { mediaId: number; url: string; mediaHash: string } {
	const item: DemoDrawerMedia = {
		id: uploadedDrawerMediaId++,
		url: URL.createObjectURL(new Blob([bytes], { type: contentType })),
		contentType,
		createdTs: Date.now(),
		used: false,
		takenOnGrindr: false,
	};
	uploadedDrawerMedia.unshift(item);
	return {
		mediaId: item.id,
		url: item.url,
		mediaHash: hashFromSeed(`drawer-${item.id}`),
	};
}

const deletedDrawerMedia = new Set<number>();

export function demoDrawerMedia(): DemoDrawerMedia[] {
	return [
		...uploadedDrawerMedia,
		...Array.from({ length: 10 }, (_, index) => ({
			id: 910_000 + index,
			url: `https://picsum.photos/seed/opengrind-drawer-${index}/600/800`,
			contentType: "image/jpeg",
			createdTs: NOW - (index + 1) * HOUR,
			used: index % 3 === 0,
			takenOnGrindr: false,
		})),
	].filter(({ id }) => !deletedDrawerMedia.has(id));
}

export function demoDeleteDrawerMedia(mediaId: number): void {
	deletedDrawerMedia.add(mediaId);
}
