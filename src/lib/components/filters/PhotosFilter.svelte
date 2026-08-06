<script lang="ts">
	import { FolderLockIcon, ImageIcon, SmileyWinkIcon } from "phosphor-svelte";
	import type z from "zod";

	import * as ToggleGroup from "$lib/components/ui/toggle-group";
	import type { filterPhotosSchema } from "$lib/model/browse/grid/filters";
	import FilterBoolean from "./FilterBoolean.svelte";

	let {
		checked = $bindable(),
		value = $bindable(),
	}: { checked: boolean; value: z.infer<typeof filterPhotosSchema> } =
		$props();
</script>

<div class="flex min-w-0 flex-col gap-2">
	<FilterBoolean id="photos" bind:checked>Photos</FilterBoolean>
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
				Has Photos
			</ToggleGroup.Item>
			<ToggleGroup.Item value="has-face-pics">
				<SmileyWinkIcon />
				Has Face Pics
			</ToggleGroup.Item>
			<ToggleGroup.Item value="has-albums">
				<FolderLockIcon />
				Has Album(s)
			</ToggleGroup.Item>
		</ToggleGroup.Root>
	</div>
</div>
