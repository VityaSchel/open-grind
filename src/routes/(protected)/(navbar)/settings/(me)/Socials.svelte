<script lang="ts">
	import {
		ChatsCircleIcon,
		CodeIcon,
		GlobeIcon,
		MegaphoneIcon,
	} from "phosphor-svelte";

	import Link from "./LinkItem.svelte";
</script>

<Link destination="https://opengrind.org/" label="Open Grind Website">
	{#snippet icon()}
		<GlobeIcon weight="bold" class="size-5" />
	{/snippet}
</Link>

<Link
	destination="https://git.opengrind.org/open-grind/open-grind/"
	label="Open Grind Source Code"
>
	{#snippet icon()}
		<CodeIcon weight="bold" class="size-5" />
	{/snippet}
</Link>
<Link
	destination="https://t.me/opengrind"
	label="Open Grind Announcements"
	warning={{
		title: "Telegram channel is semiofficial",
		description:
			"You're about to visit a Telegram channel that operates as a convenient mirror of the official announcements room hosted on Matrix. ",
		primary: {
			label: "Open Telegram channel",
			destination: "https://t.me/opengrind",
		},
		secondary: {
			label: "Join official Matrix room",
			destination: "https://matrix.to/#/#announcements:opengrind.org",
		},
	}}
>
	{#snippet icon()}
		<MegaphoneIcon weight="bold" class="size-5" />
	{/snippet}
</Link>
<Link
	destination="https://matrix.to/#/#general:opengrind.org"
	label="Open Grind Discussion"
>
	{#snippet icon()}
		<ChatsCircleIcon weight="bold" class="size-5" />
	{/snippet}
</Link>
