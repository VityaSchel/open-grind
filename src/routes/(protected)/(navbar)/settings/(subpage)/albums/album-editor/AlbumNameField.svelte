<script lang="ts">
	import { Input } from "$lib/components/ui/input";
	import { t } from "$lib/i18n";

	let {
		value = $bindable(),
		disabled = false,
		class: className,
	}: { value: string; disabled?: boolean; class?: string } = $props();

	const hintId = $props.id();
</script>

<div class={["flex flex-col gap-1.5", className]}>
	<Input
		bind:value
		placeholder={t("media.albums.editor.name.label")}
		aria-label={t("media.albums.editor.name.label")}
		aria-describedby={hintId}
		maxlength={255}
		{disabled}
	/>
	<p id={hintId} class="px-1 text-xs text-muted-foreground">
		{t("media.albums.editor.name.hint")}
	</p>
</div>
