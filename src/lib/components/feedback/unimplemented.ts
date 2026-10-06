import type { RichKey } from "$lib/i18n";
import type { RichMessages, RichTags } from "$lib/i18n/generated";

type IssueParams = { issue: string };

export type UnimplementedMessageKey = {
	[K in RichKey]: [RichTags[K], RichMessages[K]] extends ["link", IssueParams]
		? [IssueParams] extends [RichMessages[K]]
			? K
			: never
		: never;
}[RichKey];
