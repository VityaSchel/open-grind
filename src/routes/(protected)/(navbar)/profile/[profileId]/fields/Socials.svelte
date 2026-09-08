<script lang="ts">
	import SiFacebook from "@icons-pack/svelte-simple-icons/icons/SiFacebook";
	import SiInstagram from "@icons-pack/svelte-simple-icons/icons/SiInstagram";
	import SiX from "@icons-pack/svelte-simple-icons/icons/SiX";

	import Link from "$lib/components/ui/link/Link.svelte";
	import { type SocialNetworks } from "$lib/model/users/profiles";
	import ProfileField from "./ProfileField.svelte";

	let { socials }: { socials: SocialNetworks | null } = $props();
</script>

{#if socials !== null}
	{#each ["instagram", "twitter", "facebook"] as platform (platform)}
		{@const social = socials[platform as keyof SocialNetworks]}
		{#if social}
			<ProfileField>
				{#if platform === "instagram"}
					<SiInstagram class="size-3.5 shrink-0" aria-hidden="true" />
					<Link href="https://instagram.com/{social.userId}">
						{social.userId}
					</Link>
				{:else if platform === "twitter"}
					<SiX class="size-3.5 shrink-0" aria-hidden="true" />
					<Link href="https://x.com/{social.userId}">
						{social.userId}
					</Link>
				{:else if platform === "facebook"}
					<SiFacebook class="size-3.5 shrink-0" aria-hidden="true" />
					<Link
						href="https://facebook.com/profile.php?id={social.userId}"
					>
						{social.userId}
					</Link>
				{/if}
			</ProfileField>
		{/if}
	{/each}
{/if}
