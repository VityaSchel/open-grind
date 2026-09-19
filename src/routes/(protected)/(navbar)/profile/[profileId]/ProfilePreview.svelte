<script lang="ts">
	import type { RenderedGridProfile } from "$lib/grid/grid";
	import Distance from "./Distance.svelte";
	import OnlineStatus from "./OnlineStatus.svelte";
	import ProfileHeading from "./ProfileHeading.svelte";

	let { row, ourProfile }: { row: RenderedGridProfile; ourProfile: boolean } =
		$props();
</script>

<div class="flex flex-col p-4">
	<ProfileHeading displayName={row.displayName} age={row.age} />
	<div
		data-slot="profile-preview-status"
		class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
	>
		<OnlineStatus
			onlineUntil={row.onlineUntil}
			seen={row.seen}
			self={ourProfile}
		/>
		<Distance distance={row.distance} />
	</div>
</div>
