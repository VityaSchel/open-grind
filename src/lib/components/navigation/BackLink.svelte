<script lang="ts">
	import { afterNavigate } from "$app/navigation";
	import type { HTMLAnchorAttributes } from "svelte/elements";

	import { t } from "$lib/i18n";
	import { canGoBack } from "$lib/util/history";
	import { isPlainClick } from "$lib/util/plain-click";

	let {
		href,
		label,
		children,
		...rest
	}: Omit<HTMLAnchorAttributes, "href" | "onclick"> & {
		href: string;
		label?: string;
	} = $props();

	let leaving = false;

	afterNavigate(() => {
		leaving = false;
	});
</script>

<a
	{...rest}
	{href}
	aria-label={label ?? t("shell.backLink.a11y.label")}
	onclick={(event) => {
		if (!isPlainClick(event)) return;
		if (leaving) {
			event.preventDefault();
			return;
		}
		leaving = true;

		if (canGoBack()) {
			event.preventDefault();
			history.back();
		}
	}}
>
	{@render children?.()}
</a>
