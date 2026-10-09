<script lang="ts">
	import { StarIcon } from "phosphor-svelte";

	import { t } from "$lib/i18n";
</script>

<StarIcon
	weight="fill"
	data-slot="favorite-star"
	class="size-3.5 shrink-0 -translate-y-px text-yellow-500"
/>
<span class="sr-only">{t("profile.favoriteStar.a11y.label")}</span>
