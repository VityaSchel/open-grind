<script>
	import { TerminalIcon } from "phosphor-svelte";

	import { Button } from "$lib/components/ui/button";
	import * as Kbd from "$lib/components/ui/kbd";
	import { modifierKeyLabel } from "$lib/platform/keybindings";
	import { isMobilePlatform } from "$lib/platform/os";
	import { commandCenterState } from "./command-center-state.svelte";

	const isMobile = isMobilePlatform();
	const modifierKey = modifierKeyLabel();
</script>

<Button
	variant="outline"
	onclick={() => (commandCenterState.open = true)}
	class={{ "pe-1.5": !isMobile }}
>
	<TerminalIcon />
	{#if !isMobile}
		<Kbd.Root>{modifierKey} + K</Kbd.Root>
	{/if}
</Button>
