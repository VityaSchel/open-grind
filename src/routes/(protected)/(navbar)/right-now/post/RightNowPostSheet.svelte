<script lang="ts">
	import HouseIcon from "phosphor-svelte/lib/HouseIcon";
	import WarningCircleIcon from "phosphor-svelte/lib/WarningCircleIcon";
	import { untrack } from "svelte";

	import MultilineField from "#lib/components/fields/MultilineField.svelte";
	import * as AlertDialog from "#lib/components/ui/alert-dialog/index.ts";
	import * as Alert from "#lib/components/ui/alert/index.ts";
	import { Button } from "#lib/components/ui/button/index.ts";
	import * as ResponsiveDialog from "#lib/components/ui/responsive-dialog/index.ts";
	import { Spinner } from "#lib/components/ui/spinner/index.ts";
	import SwitchField from "#lib/components/ui/switch-field/SwitchField.svelte";
	import { Switch } from "#lib/components/ui/switch/index.ts";
	import { dismissOnBackGesture } from "#lib/platform/back-gesture-event.svelte.ts";
	import type { RightNowPostState } from "../right-now-post-state.svelte";
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
	import { formatTimeLeft } from "./time-left";

	let {
		open = $bindable(),
		post,
	}: { open: boolean; post: RightNowPostState } = $props();

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
	const busy = $derived(post.saving || toggling);
	const savingEdits = $derived(post.saving && !toggling);
	const visible = $derived(pendingVisible ?? post.status === "active");
	const off = $derived(post.status === "off");
	const timeLeft = $derived(formatTimeLeft({ ms: post.timeLeftMs }));
	const rejectionTitle = $derived.by(() => {
		const { text: textRejected, photo: photoRejected } = post.rejected;
		if (textRejected && photoRejected)
			return "Your text and photo were rejected";
		if (photoRejected) return "Your photo was rejected";
		return "Your text was rejected";
	});

	$effect(() => {
		const details = post.post;
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

	dismissOnBackGesture({
		active: () => confirmingDiscard,
		dismiss: () => (confirmingDiscard = false),
	});

	async function setVisible({ next }: { next: boolean }) {
		if (busy) return;
		pendingVisible = next;
		try {
			await post.setHidden({ hidden: !next });
		} finally {
			pendingVisible = null;
		}
	}

	async function save() {
		if (busy || !dirty || over || uploading) return;
		const sent = $state.snapshot(form);
		if (!(await post.save({ changes }))) return;
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
		{@const twoColumns = desktop && post.mapAvailable}
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
					<p
						data-slot="right-now-post-sheet-status"
						class="text-sm text-muted-foreground tabular-nums"
					>
						{off ? "Off" : "Active"} · {timeLeft} left
					</p>
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
					{#if off}
						<p
							data-slot="right-now-post-sheet-off-note"
							class="text-sm text-muted-foreground"
						>
							Your timer keeps running while you're off.
						</p>
					{/if}
					{#if post.rejected.text || post.rejected.photo}
						<Alert.Root variant="destructive">
							<WarningCircleIcon weight="fill" />
							<Alert.Title>{rejectionTitle}</Alert.Title>
							<Alert.Description>
								{#if post.rejected.reasons.length > 0}
									<ul class="list-disc ps-4">
										{#each post.rejected.reasons as reason (reason)}
											<li>{reason}</li>
										{/each}
									</ul>
								{:else}
									No reason was given.
								{/if}
							</Alert.Description>
						</Alert.Root>
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
								rejected={post.rejected.photo}
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
						{#if post.mapAvailable}
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

<AlertDialog.Root bind:open={confirmingDiscard}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Discard changes?</AlertDialog.Title>
			<AlertDialog.Description>
				You have unsaved changes.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel size="lg">Keep editing</AlertDialog.Cancel>
			<AlertDialog.Action
				variant="destructive"
				size="lg"
				onclick={() => {
					confirmingDiscard = false;
					open = false;
				}}
			>
				Discard
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
