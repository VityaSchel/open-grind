<script lang="ts">
	import { Button, buttonVariants } from "$lib/components/ui/button";
	import * as Drawer from "$lib/components/ui/drawer";
	import { Switch } from "$lib/components/ui/switch";
	import { dismissOnBackGesture } from "$lib/platform/back-gesture-event.svelte";

	let {
		open = $bindable(),
		enabled = $bindable(),
		title,
		switchLabel,
		onreset,
		onapply,
		children,
	}: {
		open: boolean;
		enabled: boolean;
		title: string;
		switchLabel: string;
		onreset: () => void;
		onapply: () => void;
		children: import("svelte").Snippet;
	} = $props();

	dismissOnBackGesture({
		active: () => open,
		dismiss: () => {
			open = false;
		},
	});
</script>

<Drawer.Root bind:open>
	<Drawer.Content class="mx-auto max-w-160">
		<Drawer.Header class="flex flex-row items-center justify-between">
			<div class="flex flex-1 justify-start">
				<Button variant="link" class="cursor-pointer" onclick={onreset}>
					Reset
				</Button>
			</div>
			<Drawer.Title>{title}</Drawer.Title>
			<div class="flex flex-1 justify-end">
				<Switch aria-label={switchLabel} bind:checked={enabled} />
			</div>
		</Drawer.Header>
		<Drawer.Body class="mb-2 flex flex-col gap-1.5 px-4">
			{@render children()}
		</Drawer.Body>
		<Drawer.Footer>
			<Drawer.Close
				class={buttonVariants({ variant: "default" })}
				onclick={() => {
					onapply();
					open = false;
				}}
			>
				Apply
			</Drawer.Close>
		</Drawer.Footer>
	</Drawer.Content>
</Drawer.Root>
