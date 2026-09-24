export type UploadTile = {
	key: string | number;
	src: string | null;
	video: boolean;
};

export type PreviousUploadsProps<Item> = {
	title: string;
	uploadLabel: string;
	submitLabel: string;
	max: number | null;
	load: () => Promise<Item[]>;
	describe: (item: Item) => UploadTile;
	onUpload: () => void;
	onDelete: (item: Item) => Promise<void>;
	onSubmit: (items: Item[]) => boolean | Promise<boolean>;
};
