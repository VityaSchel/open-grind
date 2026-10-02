import { render } from "@testing-library/svelte";

import { rendered } from "$lib/grid/grid-test-helpers";
import type { RenderedGridProfile } from "$lib/grid/grid";
import { ProfileState } from "../profile-state.svelte";
import { OUR_ID } from "./profile-pager-test-helpers";
import ProfilePane from "./ProfilePane.svelte";

export const PROFILE_ID = 100001;
export const ROW_HASH = "rowphoto";

export function gridRow({
	id = PROFILE_ID,
}: { id?: number } = {}): RenderedGridProfile {
	return {
		...rendered({ id }),
		displayName: "Peer",
		age: 27,
		profilePhotosHashes: [ROW_HASH],
	};
}

export function renderPane({
	active,
	row,
	leaving = false,
	position = 0,
	profileId = PROFILE_ID,
}: {
	active: boolean;
	row: RenderedGridProfile | null;
	leaving?: boolean;
	position?: number;
	profileId?: number;
}) {
	const profileState = new ProfileState({ profileId, ourProfileId: OUR_ID });
	const { container } = render(ProfilePane, {
		props: {
			profileState,
			position,
			active,
			leaving,
			row,
			heroHash: row?.profilePhotosHashes?.[0] ?? null,
		},
	});
	const section = container.querySelector<HTMLElement>(
		'[data-slot="profile-pane"]',
	)!;
	return { profileState, section };
}
