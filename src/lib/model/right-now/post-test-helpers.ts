export const joinedPost = {
	activeText: null,
	boostUpsellOfferAvailableUntil: null,
	expiration: 1_793_701_817_246,
	hosting: false,
	id: 254,
	isDiscreet: "NOT_SELECTED",
	lat: null,
	locationRadius: 0,
	lon: null,
	media: [],
	moderatedText: null,
	postStatus: "ACTIVE",
	posted: 1_793_698_217_246,
	profileId: 858,
	shareLocation: "NONE",
	sharedFields: [],
};

export const unpaidPost = {
	...joinedPost,
	posted: null,
	expiration: null,
	postStatus: "AWAITING_PAYMENT",
};
