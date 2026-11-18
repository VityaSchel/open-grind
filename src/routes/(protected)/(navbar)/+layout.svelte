<script lang="ts">
	import { screenRoot } from "#lib/components/navigation/stack/screen-root.ts";
	import NavBar from "#lib/components/shared/NavBar.svelte";

	let { data, children }: import("./$types").LayoutProps = $props();
</script>

<div
	{@attach screenRoot}
	class="flex min-h-dvh flex-col pt-(--safe-area-top) px-safe pb-(--content-pb)"
>
	{@render children?.()}
</div>
<NavBar ourProfileId={data.ourProfileId} />
