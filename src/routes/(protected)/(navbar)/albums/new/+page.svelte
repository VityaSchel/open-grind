<script lang="ts">
	import ImagesIcon from "phosphor-svelte/lib/ImagesIcon";

	import * as Empty from "$lib/components/ui/empty";
	import { Input } from "$lib/components/ui/input";
</script>

<svelte:head>
	<title>New album</title>
</svelte:head>

<div class="flex gap-4">
	<div
		class="aspect-3/4 w-30 shrink-0 rounded-xl bg-card-foreground/10"
	></div>
	<div class="flex min-w-0 flex-1 flex-col gap-1.5">
		<Input placeholder="Album Name" aria-label="Album name" disabled />
		<p class="px-1 text-xs text-muted-foreground">
			Only you see the album name
		</p>
	</div>
</div>
<Empty.Root>
	<Empty.Header>
		<Empty.Media variant="icon">
			<ImagesIcon weight="fill" />
		</Empty.Media>
		<Empty.Title>Add a photo to start your album</Empty.Title>
		<Empty.Description>
			The album is created once you add its first photo or video.
		</Empty.Description>
	</Empty.Header>
</Empty.Root>
