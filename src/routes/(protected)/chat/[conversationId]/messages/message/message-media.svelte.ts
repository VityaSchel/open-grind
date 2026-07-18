import type { ClassValue } from "svelte/elements";

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

	get cornerClass(): ClassValue {
		return {
			"rounded-es-[6px]": this.lastInStack && !this.isOut,
			"rounded-ee-[6px]": this.lastInStack && this.isOut,
		};
	}

	constructor() {
		$effect(() => {
			this.#meta.setRef(this.el ?? null);
		});
	}
}
