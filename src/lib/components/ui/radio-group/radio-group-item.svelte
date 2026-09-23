<script lang="ts">
	import { RadioGroup as RadioGroupPrimitive } from "bits-ui";

	import { cn } from "$lib/util/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: RadioGroupPrimitive.ItemProps = $props();
</script>

<RadioGroupPrimitive.Item
	bind:ref
	data-slot="radio-group-item"
	class={cn(className)}
	{...restProps}
/>
