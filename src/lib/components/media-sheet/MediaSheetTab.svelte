<script lang="ts">
	import type { Tabs as TabsPrimitive } from "bits-ui";

	import * as Tabs from "#lib/components/ui/tabs/index.ts";
	import { cn } from "#lib/util/utils.ts";

	let { class: className, ...restProps }: TabsPrimitive.TriggerProps =
		$props();
</script>

<Tabs.Trigger
	class={cn("h-auto flex-col gap-0.5 px-4 py-1.5", className)}
	{...restProps}
/>
