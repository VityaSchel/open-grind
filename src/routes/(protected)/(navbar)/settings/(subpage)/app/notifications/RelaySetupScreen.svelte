<script lang="ts">
	import type { Snippet } from "svelte";

	import * as ResponsiveDialog from "#lib/components/ui/responsive-dialog/index.ts";

	let {
		icon,
		title,
		description,
		success = false,
		children,
	}: {
		icon: Snippet;
		title: Snippet;
		description: Snippet;
		success?: boolean;
		children?: Snippet;
	} = $props();
</script>

<div
	data-slot="relay-setup-screen"
	class="m-auto flex w-full max-w-sm flex-col items-center py-6 text-center"
>
	<div
		data-slot="relay-setup-icon"
		class={[
			"mb-8 flex size-24 shrink-0 items-center justify-center rounded-full text-primary",
			{ "bg-primary/20": success, "bg-secondary": !success },
		]}
	>
		{@render icon()}
	</div>
	<ResponsiveDialog.Title
		class="font-heading text-2xl font-semibold text-foreground"
	>
		{@render title()}
	</ResponsiveDialog.Title>
	<ResponsiveDialog.Description
		class="mt-3 text-base text-balance text-muted-foreground"
	>
		{@render description()}
	</ResponsiveDialog.Description>
	{@render children?.()}
</div>
