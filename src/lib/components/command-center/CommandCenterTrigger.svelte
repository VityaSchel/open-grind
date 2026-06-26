<script>
	import { TerminalIcon } from "phosphor-svelte";

	import { Button } from "$lib/components/ui/button";
	import * as Kbd from "$lib/components/ui/kbd";
	import { commandCenterState } from "./command-center-state.svelte";
</script>

<Button variant="outline" onclick={() => (commandCenterState.open = true)}>
	<TerminalIcon />
	<Kbd.Root>⌘ + K</Kbd.Root>
</Button>
