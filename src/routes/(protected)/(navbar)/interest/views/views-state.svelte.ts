import { showErrorToast } from "$lib/api/error";
import { getViews } from "$lib/api/interest/views";
import { reconciler } from "$lib/reconcile";
import { viewedMeV1NewViewReceivedEventSchema, ws } from "$lib/ws.svelte";
import type { ViewerProfile, ViewPreview } from "$lib/model/interest/views";

const PAGE_SIZE = 24;

export type ViewGridEntry =
	| { type: "profile"; key: string; profile: ViewerProfile }
	| { type: "preview"; key: string; preview: ViewPreview };

export class ViewsState {
	loading = $state(true);
	error: Error | null = $state(null);
	visibleCount = $state(PAGE_SIZE);

	#profiles: ViewerProfile[] = $state([]);
	#previews: ViewPreview[] = $state([]);

	get views(): ViewGridEntry[] {
		const entries: ViewGridEntry[] = [
			...this.#profiles.map(
				(profile): ViewGridEntry => ({
					type: "profile",
					key: `profile:${profile.profileId}`,
					profile,
				}),
			),
			...this.#previews.map(
				(preview, index): ViewGridEntry => ({
					type: "preview",
					key: `preview:${index}`,
					preview,
				}),
			),
		];
		return entries.slice(0, this.visibleCount);
	}

	get hasMore(): boolean {
		return this.visibleCount < this.#profiles.length + this.#previews.length;
	}

	#initial: Promise<void>;
	#destroyed = false;
	#unsubscribeReconcile: () => void;
	#unlistenView: Promise<() => void>;

	constructor() {
		this.#initial = this.#initialLoad();

		this.#unsubscribeReconcile = reconciler.subscribe(() => this.#reconcile());

		this.#unlistenView = ws.on(
			"viewed_me.v1.new_view_received",
			viewedMeV1NewViewReceivedEventSchema,
			(event) => {
				if (this.#destroyed) return;
				const recent = event.payload.mostRecent;
				if (!recent) return;
				this.#upsert({
					profileId: recent.profileId,
					displayName: null,
					profileImageMediaHash: recent.photoHash ?? null,
					distance: null,
					lastViewed: recent.timestamp,
					isSecretAdmirer: false,
				});
			},
		);
	}

	destroy(): void {
		if (this.#destroyed) return;
		this.#destroyed = true;
		this.#unsubscribeReconcile();
		this.#unlistenView.then((unlisten) => unlisten()).catch(console.error);
	}

	loadMore(): void {
		if (!this.hasMore) return;
		this.visibleCount += PAGE_SIZE;
	}

	#upsert(view: ViewerProfile): void {
		const existing = this.#profiles.findIndex(
			(v) => v.profileId === view.profileId,
		);
		if (existing !== -1) this.#profiles.splice(existing, 1);
		this.#profiles = [view, ...this.#profiles];
	}

	async #initialLoad(): Promise<void> {
		this.loading = true;
		this.error = null;
		try {
			const { profiles, previews } = await getViews();
			if (this.#destroyed) return;
			this.#profiles = profiles;
			this.#previews = previews;
		} catch (err) {
			if (this.#destroyed) return;
			this.error = err instanceof Error ? err : new Error(String(err));
		} finally {
			this.loading = false;
		}
	}

	async #reconcile(): Promise<void> {
		await this.#initial.catch(() => {});
		if (this.#destroyed) return;
		try {
			const { profiles, previews } = await getViews();
			if (this.#destroyed) return;
			this.#profiles = profiles;
			this.#previews = previews;
			this.error = null;
		} catch (error) {
			console.error(error);
			showErrorToast({
				label: "Failed to refresh views",
				error,
			});
		}
	}
}
