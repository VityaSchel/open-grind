<script lang="ts">
	import { goto } from "$app/navigation";

	import * as Command from "$lib/components/ui/command";
	import { commandCenterClose } from "../command-center-state.svelte";

	let {
		link,
		value,
	}: {
		link: string;
		value: string;
	} = $props();
</script>

<Command.Item
	value="/{value}"
	onSelect={() => {
		void goto(link);
		commandCenterClose();
	}}
>
	/{value}
</Command.Item>
