<script lang="ts">
	import {
		navBarRider,
		screenRoot,
	} from "#lib/components/navigation/stack/screen-root.ts";
	import NavBar from "#lib/components/shared/NavBar.svelte";

	let { data, children }: import("./$types").LayoutProps = $props();
</script>

<div
	{@attach screenRoot}
	class="flex min-h-dvh flex-col pt-(--safe-area-top) px-safe pb-(--content-pb) data-raised:relative data-raised:bg-background data-raised:shadow-(--stack-edge)"
>
	{@render children?.()}
</div>
<NavBar ourProfileId={data.ourProfileId} {@attach navBarRider} />
