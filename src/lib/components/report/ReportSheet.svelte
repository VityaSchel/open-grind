<script lang="ts">
	import ArrowUpRightIcon from "phosphor-svelte/lib/ArrowUpRightIcon";
	import { untrack } from "svelte";

	import { blockUser } from "$lib/api/browse/blocks";
	import { showErrorToast } from "$lib/api/error-toast";
	import { reportProfile } from "$lib/api/safety/reports";
	import { Button, buttonVariants } from "$lib/components/ui/button";
	import Link from "$lib/components/ui/link/Link.svelte";
	import * as ResponsiveDialog from "$lib/components/ui/responsive-dialog";
	import { Spinner } from "$lib/components/ui/spinner";
	import { Textarea } from "$lib/components/ui/textarea";
	import * as ToggleGroup from "$lib/components/ui/toggle-group";
	import { type MessageKey, t } from "$lib/i18n";
	import {
		type ReportLocation,
		reportLocationSchema,
		type ReportReason,
		reportReasonSchema,
	} from "$lib/model/safety/reports";
	import { grindrHelpUrl } from "$lib/util/grindr-help";
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

	const reasonKeys = {
		SPAM: "profile.report.reason.spam",
		HARASSMENT_BULLYING: "profile.report.reason.harassmentBullying",
		HATE_DISCRIMINATION: "profile.report.reason.hateDiscrimination",
		NUDITY_PORNOGRAPHY: "profile.report.reason.nudityPornography",
		UNDERAGE: "profile.report.reason.underage",
		IMPERSONATION: "profile.report.reason.impersonation",
		ILLEGAL_ACTIVITY: "profile.report.reason.illegalActivity",
		SEXUAL_SOLICITATION: "profile.report.reason.sexualSolicitation",
		SERIOUS_IN_PERSON_INCIDENT:
			"profile.report.reason.seriousInPersonIncident",
	} as const satisfies Record<ReportReason, MessageKey>;

	const locationKeys = {
		PROFILE_PHOTO: "profile.report.location.profilePhoto",
		PROFILE_INFORMATION: "profile.report.location.profileInformation",
		CHAT_MESSAGE: "profile.report.location.chatMessage",
		ALBUM: "profile.report.location.album",
		RIGHT_NOW_PHOTO: "profile.report.location.rightNowPhoto",
		RIGHT_NOW_TEXT: "profile.report.location.rightNowText",
	} as const satisfies Record<ReportLocation, MessageKey>;

	const subjectKeys = {
		profile: {
			title: "profile.report.profile.title",
			description: "profile.report.profile.a11y.description",
		},
		message: {
			title: "profile.report.message.title",
			description: "profile.report.message.a11y.description",
		},
	} as const satisfies Record<
		ReportSubject,
		Record<"title" | "description", MessageKey>
	>;

	let reason = $state<ReportReason | null>(null);
	let locations = $state<ReportLocation[]>([]);
	let comment = $state("");
	let submitting = $state(false);
	let submitted = $state(false);

	const subjectKey = $derived(subjectKeys[subject]);
	const isInPersonIncident = $derived(
		reason === "SERIOUS_IN_PERSON_INCIDENT",
	);
	const detailsShown = $derived(
		reason !== null && reason !== "SPAM" && !isInPersonIncident,
	);
	const wherePickerShown = $derived(
		detailsShown && presetLocations === undefined,
	);

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
			showErrorToast({
				label: t("profile.report.errors.sendFailed"),
				error,
			});
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
				{submitted
					? t("profile.report.submitted")
					: t(subjectKey.title)}
			</ResponsiveDialog.Title>
			<ResponsiveDialog.Description class="sr-only">
				{t(subjectKey.description)}
			</ResponsiveDialog.Description>
		</ResponsiveDialog.Header>
		{#if submitted}
			<ResponsiveDialog.Body drawerClass="px-4">
				<div
					data-slot="report-submitted"
					class="flex flex-col items-center gap-2 py-4 text-center"
				>
					<p>{t("profile.report.reviewed")}</p>
					<p class="text-sm text-muted-foreground">
						{t("profile.report.blockHint")}
					</p>
				</div>
			</ResponsiveDialog.Body>
			<ResponsiveDialog.Footer>
				<Button variant="destructive" onclick={block}>
					{t("profile.topNav.actionsMenu.block")}
				</Button>
				<Button variant="secondary" onclick={() => (open = false)}>
					{t("profile.report.done")}
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
							aria-label={t("profile.report.a11y.reason")}
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
									{t(reasonKeys[value])}
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
								{t("profile.report.whereItHappened")}
							</span>
							<ToggleGroup.Root
								type="multiple"
								variant="outline"
								spacing={2}
								aria-label={t("profile.report.whereItHappened")}
								class="w-full flex-wrap gap-1"
								bind:value={
									() => locations,
									(next: string[]) =>
										(locations = next as ReportLocation[])
								}
							>
								{#each reportLocationSchema.options as value (value)}
									<ToggleGroup.Item {value}>
										{t(locationKeys[value])}
									</ToggleGroup.Item>
								{/each}
							</ToggleGroup.Root>
						</div>
					{/if}
					{#if detailsShown}
						<Textarea
							bind:value={comment}
							aria-label={t("profile.report.details")}
							placeholder={t("profile.report.details")}
							class="min-h-24"
						/>
					{/if}
					{#if isInPersonIncident}
						<p
							data-slot="report-incident-note"
							class="px-1 text-sm text-muted-foreground"
						>
							{t("profile.report.inPersonIncident.note")}
						</p>
					{/if}
				</ResponsiveDialog.Body>
				<ResponsiveDialog.Footer>
					{#if isInPersonIncident}
						<Link
							href={grindrHelpUrl("inPersonIncidentForm")}
							class={buttonVariants()}
						>
							{t("profile.report.inPersonIncident.openHelpForm")}
							<ArrowUpRightIcon />
						</Link>
					{:else}
						<Button
							disabled={submitting || reason === null}
							aria-busy={submitting}
							onclick={() => void submit()}
						>
							{#if submitting}
								<Spinner aria-hidden="true" />
							{/if}
							{t("profile.report.submit")}
						</Button>
					{/if}
				</ResponsiveDialog.Footer>
			</fieldset>
		{/if}
	</ResponsiveDialog.Content>
</ResponsiveDialog.Root>
