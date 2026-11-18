<script lang="ts">
	import {
		Button,
		type ButtonProps,
	} from "#lib/components/ui/button/index.ts";
	import { t } from "#lib/i18n/index.ts";

	let {
		active,
		label,
		drawerOpen,
		onclick,
		children,
		...restProps
	}: {
		active: boolean;
		label?: string;
		drawerOpen?: boolean;
		onclick: () => void;
		children: import("svelte").Snippet;
	} & Omit<ButtonProps, "onclick" | "children"> = $props();

	const activeDescriptionId = $props.id();

	const opensDrawer = $derived(drawerOpen !== undefined);
</script>

<Button
	variant="secondary"
	aria-label={label}
	aria-haspopup={opensDrawer ? "dialog" : undefined}
	aria-expanded={drawerOpen}
	aria-describedby={opensDrawer && active ? activeDescriptionId : undefined}
	data-active={active || undefined}
	{onclick}
	class={{
		"bg-white text-popover hover:bg-neutral-200 aria-expanded:bg-white aria-expanded:text-popover":
			active,
		"active:translate-y-px": opensDrawer,
	}}
	{...restProps}
>
	{@render children()}
</Button>
{#if opensDrawer}
	<span id={activeDescriptionId} hidden>
		{t("common.filters.a11y.applied")}
	</span>
{/if}
