<script lang="ts">
	import { Label } from "#lib/components/ui/label/index.ts";
	import { Switch } from "#lib/components/ui/switch/index.ts";

	let { label, checked = $bindable() }: { label: string; checked: boolean } =
		$props();
</script>

<Label
	class="flex items-center justify-between gap-3 rounded-xl px-1 py-2.5 transition-colors"
>
	<span class="text-sm font-medium">{label}</span>
	<Switch bind:checked />
</Label>
