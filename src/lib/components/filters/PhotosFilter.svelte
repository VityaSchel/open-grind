<script lang="ts">
	import FolderLockIcon from "phosphor-svelte/lib/FolderLockIcon";
	import ImageIcon from "phosphor-svelte/lib/ImageIcon";
	import SmileyWinkIcon from "phosphor-svelte/lib/SmileyWinkIcon";
	import type z from "zod";

	import * as ToggleGroup from "$lib/components/ui/toggle-group";
	import { t } from "$lib/i18n";
	import type { filterPhotosSchema } from "$lib/model/browse/grid/filters";
	import FilterBoolean from "./FilterBoolean.svelte";

	let {
		checked = $bindable(),
		value = $bindable(),
	}: { checked: boolean; value: z.infer<typeof filterPhotosSchema> } =
		$props();
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
			bind:value={
				() => value,
				(v: typeof value) => ((checked = v.length > 0), (value = v))
			}
		>
			<ToggleGroup.Item value="has-photos">
				<ImageIcon />
				{t("common.filters.photos.hasPhotos")}
			</ToggleGroup.Item>
			<ToggleGroup.Item value="has-face-pics">
				<SmileyWinkIcon />
				{t("common.filters.photos.hasFacePics")}
			</ToggleGroup.Item>
			<ToggleGroup.Item value="has-albums">
				<FolderLockIcon />
				{t("common.filters.photos.hasAlbums")}
			</ToggleGroup.Item>
		</ToggleGroup.Root>
	</div>
</div>
