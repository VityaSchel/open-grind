<script lang="ts">
	import TerminalIcon from "phosphor-svelte/lib/TerminalIcon";

	import { Button } from "$lib/components/ui/button";
	import * as Kbd from "$lib/components/ui/kbd";
	import { t } from "$lib/i18n";
	import {
		commandCenterKeybinding,
		parseShortcut,
	} from "$lib/platform/keybindings";
	import { isMobilePlatform } from "$lib/platform/os";
	import { commandCenterState } from "./command-center-state.svelte";

	const isMobile = isMobilePlatform();
	const shortcut = parseShortcut(commandCenterKeybinding);
	const modifierKey = $derived(
		shortcut.modifier === "meta" ? "⌘" : t("commands.trigger.controlKey"),
	);
</script>

<Button
	variant="outline"
	aria-label={t("common.commandDialog.a11y.title")}
	onclick={() => (commandCenterState.open = true)}
	class={{ "pe-1.5": !isMobile }}
>
	<TerminalIcon />
	{#if !isMobile}
		<Kbd.Root translate="no">{modifierKey} + {shortcut.key}</Kbd.Root>
	{/if}
</Button>
