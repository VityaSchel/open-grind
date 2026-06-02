<script lang="ts">
	import {
		FacebookLogoIcon,
		InstagramLogoIcon,
		XLogoIcon,
	} from "phosphor-svelte";

	import Link from "$lib/components/ui/link/Link.svelte";
	import { type SocialNetworks } from "$lib/model/profile";
	import ProfileField from "./ProfileField.svelte";

	let {
		socials,
	}: {
		socials: SocialNetworks | null;
	} = $props();
</script>

{#if socials !== null}
	{#each ["instagram", "twitter", "facebook"] as platform}
		{@const social = socials[platform as keyof SocialNetworks]}
		{#if social}
			<ProfileField>
				{#if platform === "instagram"}
					<InstagramLogoIcon class="shrink-0" />
					<Link href="https://instagram.com/{social.userId}">
						{social.userId}
					</Link>
				{:else if platform === "twitter"}
					<XLogoIcon class="shrink-0" />
					<Link href="https://x.com/{social.userId}">
						{social.userId}
					</Link>
				{:else if platform === "facebook"}
					<FacebookLogoIcon class="shrink-0" />
					<Link href="https://facebook.com/profile.php?id={social.userId}">
						{social.userId}
					</Link>
				{/if}
			</ProfileField>
		{/if}
	{/each}
{/if}
