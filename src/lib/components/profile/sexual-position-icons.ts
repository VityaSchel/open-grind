import ArrowDownIcon from "phosphor-svelte/lib/ArrowDownIcon";
import ArrowDownRightIcon from "phosphor-svelte/lib/ArrowDownRightIcon";
import ArrowsDownUpIcon from "phosphor-svelte/lib/ArrowsDownUpIcon";
import ArrowsLeftRightIcon from "phosphor-svelte/lib/ArrowsLeftRightIcon";
import ArrowUpIcon from "phosphor-svelte/lib/ArrowUpIcon";
import ArrowUpRightIcon from "phosphor-svelte/lib/ArrowUpRightIcon";
import type { IconComponentProps } from "phosphor-svelte";
import type { Component } from "svelte";

import {
	SexualPosition,
	type SexualPositionId,
} from "$lib/model/users/profiles";

export const sexualPositionOrder: SexualPositionId[] = [
	SexualPosition.Top,
	SexualPosition.VersTop,
	SexualPosition.Versatile,
	SexualPosition.VersBottom,
	SexualPosition.Bottom,
	SexualPosition.Side,
];

export const sexualPositionIcons: Record<
	SexualPositionId,
	Component<IconComponentProps>
> = {
	[SexualPosition.Top]: ArrowUpIcon,
	[SexualPosition.VersTop]: ArrowUpRightIcon,
	[SexualPosition.Versatile]: ArrowsDownUpIcon,
	[SexualPosition.VersBottom]: ArrowDownRightIcon,
	[SexualPosition.Bottom]: ArrowDownIcon,
	[SexualPosition.Side]: ArrowsLeftRightIcon,
};
