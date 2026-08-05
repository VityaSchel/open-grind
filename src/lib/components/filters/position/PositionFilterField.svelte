<script lang="ts">
	import type z from "zod";

	import PositionFilterToggle from "$lib/components/filters/position/PositionFilterToggle.svelte";
	import type { filterPositionSchema } from "$lib/model/browse/grid/filters";
	import FilterBoolean from "../FilterBoolean.svelte";

	let {
		value = $bindable(),
		checked = $bindable(),
	}: { value: z.infer<typeof filterPositionSchema>; checked: boolean } =
		$props();
</script>

<div class="flex min-w-0 flex-col gap-2">
	<FilterBoolean id="position" bind:checked>Position</FilterBoolean>
	<div class="ps-6">
		<PositionFilterToggle
			bind:value={
				() => value,
				(v: typeof value) => {
					value = v;
					checked = v.length > 0;
				}
			}
		/>
	</div>
</div>
