<script lang="ts">
	import HouseIcon from "phosphor-svelte/lib/HouseIcon";
	import { untrack } from "svelte";

	import MultilineField from "#lib/components/fields/MultilineField.svelte";
	import { Button } from "#lib/components/ui/button/index.ts";
	import * as ResponsiveDialog from "#lib/components/ui/responsive-dialog/index.ts";
	import { Spinner } from "#lib/components/ui/spinner/index.ts";
	import SwitchField from "#lib/components/ui/switch-field/SwitchField.svelte";
	import { Switch } from "#lib/components/ui/switch/index.ts";
	import { rejectedParts } from "../right-now-post-fields";
	import type { RightNowPostState } from "../right-now-post-state.svelte";
	import DiscardChangesDialog from "./DiscardChangesDialog.svelte";
	import {
		LEAST_PRECISE_RADIUS,
		POST_TEXT_MAX_LENGTH,
		postChangesOf,
		type PostForm,
		postFormOf,
		singleLinePostText,
	} from "./post-form";
	import PostLocationField from "./PostLocationField.svelte";
	import PostPhotoField from "./PostPhotoField.svelte";
	import PostRejectionAlert from "./PostRejectionAlert.svelte";
	import { formatTimeLeft } from "./time-left";

	let {
		open = $bindable(),
		ownPost,
	}: { open: boolean; ownPost: RightNowPostState } = $props();

	const EMPTY_FORM: PostForm = {
		text: "",
		photo: null,
		hosting: false,
		shareLocation: "NONE",
		locationRadius: LEAST_PRECISE_RADIUS,
	};

	let baseline = $state.raw<PostForm>(EMPTY_FORM);
	let form = $state<PostForm>({ ...EMPTY_FORM });
	let uploading = $state(false);
	let pendingVisible = $state<boolean | null>(null);
	let confirmingDiscard = $state(false);
	let wasOpen = false;

	const changes = $derived(
		postChangesOf({ initial: baseline, current: form }),
	);
	const dirty = $derived(Object.keys(changes).length > 0);
	const over = $derived(
		changes.text !== undefined && form.text.length > POST_TEXT_MAX_LENGTH,
	);
	const toggling = $derived(pendingVisible !== null);
	const busy = $derived(ownPost.saving || toggling);
	const savingEdits = $derived(ownPost.saving && !toggling);
	const visible = $derived(pendingVisible ?? ownPost.status === "active");
	const off = $derived(ownPost.status === "off");
	const timeLeft = $derived(formatTimeLeft({ ms: ownPost.timeLeftMs }));
	const rejectedMediaIds = $derived(
		rejectedParts(ownPost.post).photos.map(({ mediaId }) => mediaId),
	);

	$effect(() => {
		const details = ownPost.post;
		const opening = open && !wasOpen;
		wasOpen = open;
		if (!open) return;
		if (details === null) {
			open = false;
			return;
		}
		untrack(() => {
			if (opening || !dirty) {
				const next = postFormOf({ post: details });
				baseline = next;
				form = { ...next };
			}
		});
	});

	function askToDiscard() {
		if (!busy && dirty) confirmingDiscard = true;
	}

	async function setVisible({ next }: { next: boolean }) {
		if (busy) return;
		pendingVisible = next;
		try {
			await ownPost.setHidden({ hidden: !next });
		} finally {
			pendingVisible = null;
		}
	}

	async function save() {
		if (busy || !dirty || over || uploading) return;
		const sent = $state.snapshot(form);
		if (!(await ownPost.save({ changes }))) return;
		baseline = sent;
		open = false;
	}
</script>

<ResponsiveDialog.Root
	bind:open
	dismissible={!busy && !dirty}
	onDismissBlocked={askToDiscard}
>
	{#snippet children({ desktop })}
		{@const twoColumns = desktop && ownPost.mapAvailable}
		<ResponsiveDialog.Content
			class="flex flex-col"
			drawerClass="mx-auto max-w-160"
			dialogClass={{
				"sm:max-w-4xl": twoColumns,
				"sm:max-w-lg": !twoColumns,
			}}
			dialogProps={{ showCloseButton: true }}
		>
			<ResponsiveDialog.Header
				class="flex-row items-center justify-between gap-3 text-start"
				drawerClass="group-data-[vaul-drawer-direction=bottom]/drawer-content:text-start"
				dialogClass="pe-12"
			>
				<div class="flex min-w-0 flex-col gap-0.5">
					<ResponsiveDialog.Title>Right Now</ResponsiveDialog.Title>
					<ResponsiveDialog.Description class="tabular-nums">
						<span data-slot="right-now-post-sheet-status">
							{off ? "Off" : "Active"} · {timeLeft} left
						</span>
					</ResponsiveDialog.Description>
				</div>
				<div class="flex shrink-0 items-center gap-2">
					{#if toggling}
						<Spinner
							class="text-muted-foreground"
							aria-hidden="true"
						/>
					{/if}
					<Switch
						aria-label="Show my post"
						aria-busy={toggling}
						disabled={busy}
						bind:checked={
							() => visible,
							(next: boolean) => void setVisible({ next })
						}
					/>
				</div>
			</ResponsiveDialog.Header>
			<fieldset disabled={busy} class="contents">
				<ResponsiveDialog.Body
					class="flex flex-col gap-4"
					drawerClass="px-4 pb-2"
				>
					{#if ownPost.rejected.text || ownPost.rejected.photo}
						<PostRejectionAlert rejected={ownPost.rejected} />
					{/if}
					<div
						data-slot="right-now-post-sheet-columns"
						class={{
							"grid grid-cols-2 items-start gap-6": twoColumns,
							"flex flex-col gap-4": !twoColumns,
						}}
					>
						<div class="flex flex-col gap-4">
							<MultilineField
								label="Text"
								placeholder="What are you looking for?"
								maxLength={POST_TEXT_MAX_LENGTH}
								bind:value={
									() => form.text,
									(next: string) =>
										(form.text = singleLinePostText({
											text: next,
										}))
								}
							/>
							<PostPhotoField
								bind:photo={form.photo}
								bind:uploading
								disabled={busy}
								{rejectedMediaIds}
							/>
							<SwitchField
								title="Hosting"
								bind:checked={form.hosting}
								disabled={busy}
							>
								{#snippet icon()}
									<HouseIcon
										weight="fill"
										class="size-5"
										aria-hidden="true"
									/>
								{/snippet}
							</SwitchField>
						</div>
						{#if ownPost.mapAvailable}
							<PostLocationField
								bind:shareLocation={form.shareLocation}
								bind:locationRadius={form.locationRadius}
								disabled={busy}
							/>
						{/if}
					</div>
				</ResponsiveDialog.Body>
				<ResponsiveDialog.Footer>
					<Button
						disabled={!dirty || over || uploading}
						aria-busy={savingEdits}
						onclick={() => void save()}
					>
						{#if savingEdits}
							<Spinner aria-hidden="true" />
						{/if}
						Save
					</Button>
				</ResponsiveDialog.Footer>
			</fieldset>
		</ResponsiveDialog.Content>
	{/snippet}
</ResponsiveDialog.Root>

<DiscardChangesDialog
	bind:open={confirmingDiscard}
	ondiscard={() => (open = false)}
/>
