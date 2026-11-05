<script lang="ts">
	import { refreshAnnouncer } from "./refresh-announcer.svelte";

	let {
		busy,
		updating = false,
		failed,
		list,
	}: {
		busy: boolean;
		updating?: boolean;
		failed: boolean;
		list: HTMLElement;
	} = $props();

	$effect(() => {
		const tracked = refreshAnnouncer.track(list);
		$effect(() => tracked.follow({ busy, updating, failed }));
		return () => tracked.stop();
	});
</script>
