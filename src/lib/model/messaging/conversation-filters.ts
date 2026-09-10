import type { FilterPositionId } from "$lib/model/browse/grid/filters";

export type ConversationFilterValues = {
	favorites: boolean;
	unread: boolean;
	online: boolean;
	rightNow: boolean;
	distanceMetres: number | null;
	positions: FilterPositionId[];
};

export const defaultConversationFilters: ConversationFilterValues = {
	favorites: false,
	unread: false,
	online: false,
	rightNow: false,
	distanceMetres: null,
	positions: [],
};
