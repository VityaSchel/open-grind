<script lang="ts">
	import { PencilIcon } from "phosphor-svelte";

	import { Button } from "$lib/components/ui/button";
</script>

<Button
	size="lg"
	href="/settings/profile"
	variant="default"
	aria-label="Edit profile"
	class="h-12 text-base"
>
	<PencilIcon class="size-6" />
	Edit profile
</Button>
