<script lang="ts">
	import { untrack } from "svelte";

	import { blockUser } from "$lib/api/browse/blocks";
	import { showErrorToast } from "$lib/api/error-toast";
	import { reportProfile } from "$lib/api/safety/reports";
	import { Button } from "$lib/components/ui/button";
	import * as ResponsiveDialog from "$lib/components/ui/responsive-dialog";
	import { Spinner } from "$lib/components/ui/spinner";
	import { Textarea } from "$lib/components/ui/textarea";
	import * as ToggleGroup from "$lib/components/ui/toggle-group";
	import {
		type ReportLocation,
		reportLocationSchema,
		type ReportReason,
		reportReasonSchema,
	} from "$lib/model/safety/reports";
	import type { Profile } from "$lib/model/users/profiles";
	import { showBlockFailure } from "./block-failure";
	import { buildProfileReport } from "./report-request";

	type ReportSubject = "profile" | "message";

	let {
		open = $bindable(),
		profileId,
		subject = "profile",
		locations: presetLocations,
		onBlock,
	}: {
		open: boolean;
		profileId: Profile["profileId"];
		subject?: ReportSubject;
		locations?: ReportLocation[];
		onBlock?: () => void;
	} = $props();

	const reasonLabels: Record<ReportReason, string> = {
		SPAM: "Spam",
		HARASSMENT_BULLYING: "Harassment or Bullying",
		HATE_DISCRIMINATION: "Hate Speech/Discrimination",
		NUDITY_PORNOGRAPHY: "Nudity or Pornography",
		UNDERAGE: "Underage",
		IMPERSONATION: "Impersonation",
		ILLEGAL_ACTIVITY: "Illegal Activity",
		SEXUAL_SOLICITATION: "Sexual Solicitation",
		SERIOUS_IN_PERSON_INCIDENT: "Serious In Person Incident",
	};

	const locationLabels: Record<ReportLocation, string> = {
		PROFILE_PHOTO: "Profile Photo",
		PROFILE_INFORMATION: "Profile Information",
		CHAT_MESSAGE: "Chat Message",
		ALBUM: "Album",
		RIGHT_NOW_PHOTO: "Right Now Image",
		RIGHT_NOW_TEXT: "Right Now Text",
	};

	const subjectCopy: Record<
		ReportSubject,
		{ title: string; description: string; reviewed: string }
	> = {
		profile: {
			title: "Report profile",
			description: "Send a report about this profile to Grindr.",
			reviewed: "Grindr will review this profile.",
		},
		message: {
			title: "Report message",
			description:
				"Send a report about this person's messages to Grindr.",
			reviewed: "Grindr will review your report.",
		},
	};

	const detailsLabel = "Details (optional)";

	let reason = $state<ReportReason | null>(null);
	let locations = $state<ReportLocation[]>([]);
	let comment = $state("");
	let submitting = $state(false);
	let submitted = $state(false);

	const copy = $derived(subjectCopy[subject]);
	const isSpam = $derived(reason === "SPAM");
	const reasonChosen = $derived(reason !== null);
	const wherePickerShown = $derived(
		reasonChosen && !isSpam && presetLocations === undefined,
	);
	const detailsShown = $derived(reasonChosen && !isSpam);

	$effect(() => {
		if (!open) return;
		untrack(() => {
			reason = null;
			locations = [...(presetLocations ?? [])];
			comment = "";
			submitted = false;
		});
	});

	async function submit() {
		if (submitting || reason === null) return;
		submitting = true;
		try {
			await reportProfile({
				profileId,
				report: buildProfileReport({ reason, comment, locations }),
			});
			submitted = true;
		} catch (error) {
			console.error(error);
			showErrorToast({ label: "Failed to send report", error });
		} finally {
			submitting = false;
		}
	}

	function block() {
		open = false;
		if (onBlock) onBlock();
		else void blockInBackground();
	}

	async function blockInBackground() {
		try {
			await blockUser({ profileId });
		} catch (error) {
			console.error(error);
			showBlockFailure(error);
		}
	}
</script>

<ResponsiveDialog.Root bind:open>
	<ResponsiveDialog.Content
		class="flex flex-col gap-4"
		drawerClass="mx-auto max-w-160"
		dialogProps={{ showCloseButton: true }}
	>
		<ResponsiveDialog.Header>
			<ResponsiveDialog.Title>
				{submitted ? "Report submitted" : copy.title}
			</ResponsiveDialog.Title>
			<ResponsiveDialog.Description class="sr-only">
				{copy.description}
			</ResponsiveDialog.Description>
		</ResponsiveDialog.Header>
		{#if submitted}
			<ResponsiveDialog.Body drawerClass="px-4">
				<div
					data-slot="report-submitted"
					class="flex flex-col items-center gap-2 py-4 text-center"
				>
					<p>{copy.reviewed}</p>
					<p class="text-sm text-muted-foreground">
						You can block this profile so you stop seeing it.
					</p>
				</div>
			</ResponsiveDialog.Body>
			<ResponsiveDialog.Footer>
				<Button variant="destructive" onclick={block}>
					Block profile
				</Button>
				<Button variant="secondary" onclick={() => (open = false)}>
					Done
				</Button>
			</ResponsiveDialog.Footer>
		{:else}
			<fieldset disabled={submitting} class="contents">
				<ResponsiveDialog.Body
					class="flex flex-col gap-4"
					drawerClass="px-4"
				>
					<div
						data-slot="report-reasons"
						class="flex flex-col gap-1.5"
					>
						<ToggleGroup.Root
							type="single"
							orientation="vertical"
							variant="outline"
							spacing={2}
							aria-label="Reason"
							class="w-full"
							bind:value={
								() => reason ?? "",
								(next: string) =>
									(reason =
										next === ""
											? null
											: (next as ReportReason))
							}
						>
							{#each reportReasonSchema.options as value (value)}
								<ToggleGroup.Item {value} class="justify-start">
									{reasonLabels[value]}
								</ToggleGroup.Item>
							{/each}
						</ToggleGroup.Root>
					</div>
					{#if wherePickerShown}
						<div
							data-slot="report-locations"
							class="flex flex-col gap-1.5"
						>
							<span class="px-1 text-sm leading-none font-medium">
								Where it happened
							</span>
							<ToggleGroup.Root
								type="multiple"
								variant="outline"
								spacing={2}
								aria-label="Where it happened"
								class="w-full flex-wrap gap-1"
								bind:value={
									() => locations,
									(next: string[]) =>
										(locations = next as ReportLocation[])
								}
							>
								{#each reportLocationSchema.options as value (value)}
									<ToggleGroup.Item {value}>
										{locationLabels[value]}
									</ToggleGroup.Item>
								{/each}
							</ToggleGroup.Root>
						</div>
					{/if}
					{#if detailsShown}
						<Textarea
							bind:value={comment}
							aria-label={detailsLabel}
							placeholder={detailsLabel}
							class="min-h-24"
						/>
					{/if}
				</ResponsiveDialog.Body>
				<ResponsiveDialog.Footer>
					<Button
						disabled={submitting || reason === null}
						aria-busy={submitting}
						onclick={() => void submit()}
					>
						{#if submitting}
							<Spinner aria-hidden="true" />
						{/if}
						Submit report
					</Button>
				</ResponsiveDialog.Footer>
			</fieldset>
		{/if}
	</ResponsiveDialog.Content>
</ResponsiveDialog.Root>
