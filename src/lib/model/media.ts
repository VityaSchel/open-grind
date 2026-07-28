import z from "zod";

export const mediaUrlSchema = z.url({ protocol: /^(https|blob)$/ });

export const mediaHashPublicSchema = z.hex().length(40);
export const mediaHashPrivateSchema = z.hex().length(64);
export const mediaHashSchema = {
	private: mediaHashPrivateSchema,
	public: mediaHashPublicSchema,
};
