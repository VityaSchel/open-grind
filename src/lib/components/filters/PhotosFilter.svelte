<script lang="ts">
	import FolderLockIcon from "phosphor-svelte/lib/FolderLockIcon";
	import ImageIcon from "phosphor-svelte/lib/ImageIcon";
	import SmileyWinkIcon from "phosphor-svelte/lib/SmileyWinkIcon";
	import type z from "zod";

	import * as ToggleGroup from "#lib/components/ui/toggle-group/index.ts";
	import { t } from "#lib/i18n/index.ts";
	import { RovingFocusState } from "#lib/util/roving-focus-state.svelte.ts";
	import type { filterPhotosSchema } from "#lib/model/browse/grid/filters.ts";
	import FilterBoolean from "./FilterBoolean.svelte";

	let {
		checked = $bindable(),
		value = $bindable(),
	}: { checked: boolean; value: z.infer<typeof filterPhotosSchema> } =
		$props();

	const PHOTO_FILTERS = [
		"has-photos",
		"has-face-pics",
		"has-albums",
	] as const;

	const chips = new RovingFocusState({
		keys: () => PHOTO_FILTERS,
		orientation: "horizontal",
		wrap: "loop",
	});
</script>

<div class="flex min-w-0 flex-col gap-2">
	<FilterBoolean id="photos" bind:checked>
		{t("common.filters.photos.label")}
	</FilterBoolean>
	<div class="ps-6">
		<ToggleGroup.Root
			type="multiple"
			variant="outline"
			spacing={2}
			class="w-full flex-wrap gap-1"
			rovingFocus={false}
			aria-label={t("common.filters.photos.label")}
			{@attach chips.container}
			bind:value={
				() => value,
				(v: typeof value) => ((checked = v.length > 0), (value = v))
			}
		>
			<ToggleGroup.Item
				value="has-photos"
				{@attach chips.item("has-photos")}
			>
				<ImageIcon />
				{t("common.filters.photos.hasPhotos")}
			</ToggleGroup.Item>
			<ToggleGroup.Item
				value="has-face-pics"
				{@attach chips.item("has-face-pics")}
			>
				<SmileyWinkIcon />
				{t("common.filters.photos.hasFacePics")}
			</ToggleGroup.Item>
			<ToggleGroup.Item
				value="has-albums"
				{@attach chips.item("has-albums")}
			>
				<FolderLockIcon />
				{t("common.filters.photos.hasAlbums")}
			</ToggleGroup.Item>
		</ToggleGroup.Root>
	</div>
</div>
