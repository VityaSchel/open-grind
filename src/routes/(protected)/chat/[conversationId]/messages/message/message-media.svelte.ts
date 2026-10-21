import type { Attachment } from "svelte/attachments";
import type { ClassValue } from "svelte/elements";

import type { MediaDimensions } from "$lib/util/media-dimensions";
import { getMessageContext, getMessageMetaContext } from "./context";

export class MessageMediaState {
	#msgCtx = $derived(getMessageContext()());
	#meta = $derived(getMessageMetaContext()());

	el: HTMLElement | null = $state(null);

	get lastInStack() {
		return this.#msgCtx.lastInStack;
	}
	get isOut() {
		return this.#msgCtx.isOut;
	}
	get clone() {
		return this.#meta.clone;
	}
	get adornments() {
		return this.#meta.adornments;
	}

	get widthClass(): ClassValue {
		return { "w-2/5 max-w-60 min-w-35": !this.clone };
	}

	get cornerClass(): ClassValue {
		return {
			"rounded-es-[6px]": this.lastInStack && !this.isOut,
			"rounded-ee-[6px]": this.lastInStack && this.isOut,
		};
	}

	readonly attach: Attachment<HTMLElement> = (node) => {
		this.el = node;
		this.#meta.setRef(node);
		return () => {
			if (this.el !== node) return;
			this.el = null;
			this.#meta.setRef(null);
		};
	};
}

type KnownDimensions = { width: number | null; height: number | null };

export class MeasuredSize {
	#src: () => string | null;
	#fallback: () => KnownDimensions;
	#ratioAllowsZero: boolean;
	#measured = $state<({ src: string | null } & MediaDimensions) | null>(null);
	#size: KnownDimensions = $derived.by(() =>
		this.#measured !== null && this.#measured.src === this.#src()
			? this.#measured
			: this.#fallback(),
	);

	constructor({
		src,
		fallback,
		ratioAllowsZero = false,
	}: {
		src: () => string | null;
		fallback: () => KnownDimensions;
		ratioAllowsZero?: boolean;
	}) {
		this.#src = src;
		this.#fallback = fallback;
		this.#ratioAllowsZero = ratioAllowsZero;
	}

	get width(): number | null {
		return this.#size.width;
	}
	get height(): number | null {
		return this.#size.height;
	}

	get aspectRatio(): string | undefined {
		const { width, height } = this.#size;
		if (width === null || height === null) return undefined;
		if (!this.#ratioAllowsZero && (width <= 0 || height <= 0))
			return undefined;
		return `${width} / ${height}`;
	}

	measure(image: HTMLImageElement): void {
		this.#measured = {
			src: this.#src(),
			width: image.naturalWidth,
			height: image.naturalHeight,
		};
	}
}
