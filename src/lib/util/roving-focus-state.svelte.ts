import { tick, untrack } from "svelte";
import { SvelteMap } from "svelte/reactivity";
import type { Attachment } from "svelte/attachments";

import { currentPlatform } from "#lib/platform/os.ts";
import {
	type Band,
	fitsInBand,
	focusIsLost,
	holdFocusInPlace,
	isRendered,
	listenForScrollSettle,
	visibleBand,
	wasDisplaced,
} from "#lib/platform/reveal-keyboard-focus.ts";
import { keepOutOfSequentialFocus } from "#lib/platform/sequential-focus.ts";
import { KeyboardOpenerScope } from "#lib/util/keyboard-opener.ts";
import {
	edgeOfMove,
	extendTypedText,
	isCellMove,
	moveForKey,
	nearestIndex,
	type RovingEdge,
	type RovingGeometry,
	type RovingMove,
	type RovingOrientation,
	type RovingWrap,
	rowsPerPage,
	skipStep,
	targetIndex,
	typeaheadIndex,
	type TypedText,
} from "#lib/util/roving-move.ts";
import { consumesScrollKeys, scrollTowardEdge } from "#lib/util/scroll-keys.ts";
import {
	hasScrollableOverflowY,
	nearestScrollableAncestor,
} from "#lib/util/scroll.ts";
import { readGridMetrics } from "#lib/util/virtual-grid.svelte.ts";

export type RovingKey = string | number;

export type RovingFocusOptions = {
	keys: () => readonly RovingKey[];
	orientation: RovingOrientation;
	columns?: (container: HTMLElement) => number;
	sectionStarts?: () => readonly number[];
	wrap?: RovingWrap;
	cells?: (item: HTMLElement) => readonly HTMLElement[];
	primaryCell?: (cells: readonly HTMLElement[]) => HTMLElement;
	cellOnRowChange?: "keep" | "primary";
	restingKey?: () => RovingKey | null;
	followScroll?: "first-visible" | "last-visible";
	consumeAtEdge?: readonly RovingEdge[];
	onEdge?: (edge: RovingEdge) => boolean;
	pageRows?: () => number;
	reveal?: (index: number) => void;
	stopTabindex?: "explicit" | "native";
	typeahead?: (item: HTMLElement) => string;
	openerScope?: string;
	returnFocusTo?: (opener: RovingKey) => RovingKey;
	emptyFallback?: () => HTMLElement | null;
};

type LocatedItem = { key: RovingKey; item: HTMLElement };
type LocatedCell = LocatedItem & {
	cells: readonly HTMLElement[];
	cellIndex: number;
};
type Keys = readonly RovingKey[];
type MoveRequest = { keys: Keys; from: number; move: RovingMove };
type CellMove = { at: LocatedCell; move: "previousCell" | "nextCell" };
type Landing = { key: RovingKey; preventScroll: boolean };
type NearestQuery = { keys: Keys; index: number; band?: Band };
type Adoption = { target: EventTarget | null; focused: boolean };
type TypedKey = { event: KeyboardEvent; from: RovingKey };

const REVEAL_TIMEOUT_MS = 500;

export function gridColumns(container: HTMLElement): number {
	return readGridMetrics(container).columns;
}

export class RovingFocusState {
	activeKey = $state<RovingKey | null>(null);
	#focusWithin = $state(false);

	readonly #options: RovingFocusOptions;
	readonly #items = new SvelteMap<RovingKey, HTMLElement>();
	readonly #keyOf = new WeakMap<Element, RovingKey>();
	readonly #opener: KeyboardOpenerScope | null;
	#container: HTMLElement | null = null;
	#scroller: Element | null = null;
	#stop: HTMLElement | null = null;
	#column: { key: RovingKey; index: number } | null = null;
	#focused: { key: RovingKey; index: number; element: Element } | null = null;
	#lastKeys: Keys = [];
	#landing: symbol | null = null;
	#changingRows = false;
	#awaited: { key: RovingKey; settle: (item: HTMLElement) => void } | null =
		null;
	#typed: TypedText = { text: "", at: Number.NEGATIVE_INFINITY };

	constructor(options: RovingFocusOptions) {
		this.#options = options;
		this.#opener =
			options.openerScope === undefined
				? null
				: new KeyboardOpenerScope(options.openerScope);
	}

	get focusWithin(): boolean {
		return this.#focusWithin;
	}

	readonly container: Attachment<HTMLElement> = (node) => {
		this.#container = node;
		this.#scroller = hasScrollableOverflowY(node)
			? node
			: nearestScrollableAncestor(node);
		const listening = new AbortController();
		const { signal } = listening;
		const adopt = (focused: boolean) => (event: Event) =>
			untrack(() => this.#adopt({ target: event.target, focused }));
		signal.addEventListener("abort", keepOutOfSequentialFocus(node));
		node.addEventListener("keydown", this.#onKeydown, { signal });
		node.addEventListener("focusin", adopt(true), { signal });
		node.addEventListener("pointerdown", adopt(false), { signal });
		document.addEventListener("focusin", this.#onFocusAnywhere, { signal });
		document.addEventListener("pointerdown", this.#onDocumentPointerDown, {
			capture: true,
			signal,
		});
		listenForScrollSettle({
			scroller: this.#scroller ?? window,
			signal,
			settled: () => this.#onScrollSettled(),
		});
		const mutations = new MutationObserver((records) => {
			this.#demoteChangedCells(records);
			this.#recoverLostFocus(records);
		});
		mutations.observe(node, {
			childList: true,
			subtree: true,
			attributeFilter: ["inert"],
		});
		this.#opener?.watch({
			container: node,
			signal,
			openerAt: (target) => {
				const key = this.#itemAround(target)?.key;
				if (key === undefined) return null;
				return { key, index: this.#options.keys().indexOf(key) };
			},
		});
		const resizes = new ResizeObserver(() =>
			untrack(() => this.#syncStop()),
		);
		resizes.observe(node);
		$effect(() => {
			this.#syncStop();
		});
		return () => {
			listening.abort();
			mutations.disconnect();
			resizes.disconnect();
			if (this.#container !== node) return;
			this.#container = null;
			this.#scroller = null;
		};
	};

	item(key: RovingKey): Attachment<HTMLElement> {
		return (node) => untrack(() => this.#register({ key, node }));
	}

	async focus({
		key,
		preventScroll = false,
	}: { key?: RovingKey; preventScroll?: boolean } = {}): Promise<boolean> {
		const wanted = key ?? this.#preferredKeys()[0];
		const landed =
			wanted !== undefined &&
			this.#options.keys().includes(wanted) &&
			(await this.#land({ key: wanted, preventScroll }));
		if (landed || key !== undefined) return landed;
		const stop = this.#stop;
		if (stop === null || !stop.isConnected) return false;
		stop.focus({ preventScroll });
		return true;
	}

	async move(move: RovingMove): Promise<boolean> {
		if (isCellMove(move)) {
			const at = this.#cellAt(document.activeElement);
			return at !== null && this.#stepCell({ at, move });
		}
		const keys = this.#options.keys();
		const index = this.#plan({ keys, from: this.#moveOrigin(keys), move });
		if (index === null) return false;
		return this.#land({ key: keys[index]!, preventScroll: false });
	}

	#register({ key, node }: { key: RovingKey; node: HTMLElement }) {
		this.#items.set(key, node);
		this.#keyOf.set(node, key);
		this.#demote(node);
		if (this.#awaited?.key === key) this.#awaited.settle(node);
		return () => {
			if (this.#items.get(key) !== node) return;
			this.#items.delete(key);
			if (this.#stop && node.contains(this.#stop)) this.#stop = null;
			this.#holdIfFocusWasInside(key);
		};
	}

	#demote(item: HTMLElement): void {
		for (const unit of this.#options.cells?.(item) ?? [item])
			unit.setAttribute("tabindex", "-1");
	}

	#focusTargetOf({ item, key }: LocatedItem): HTMLElement | null {
		const cellsOf = this.#options.cells;
		if (cellsOf === undefined) return item;
		const cells = cellsOf(item);
		if (cells.length === 0) return null;
		const remembered = this.#column;
		const keepsColumn =
			remembered !== null &&
			(remembered.key === key ||
				this.#options.cellOnRowChange !== "primary");
		if (keepsColumn)
			return cells[Math.min(remembered.index, cells.length - 1)]!;
		return this.#options.primaryCell?.(cells) ?? cells[0]!;
	}

	#canTakeFocus(key: RovingKey): boolean {
		const item = this.#items.get(key);
		if (item === undefined) return this.#options.reveal !== undefined;
		return this.#focusTargetOf({ key, item }) !== null;
	}

	#repointedActiveKey(keys: Keys): RovingKey | null {
		const active = this.activeKey;
		if (active === null || keys.length === 0 || keys.includes(active))
			return active;
		const index = this.#lastKeys.indexOf(active);
		return index < 0 ? active : keys[Math.min(index, keys.length - 1)]!;
	}

	#moveOrigin(keys: Keys): number {
		const active = this.#repointedActiveKey(keys);
		const listed = active === null ? -1 : keys.indexOf(active);
		if (listed >= 0) return listed;
		const stopKey = this.#itemAround(this.#stop)?.key;
		return stopKey === undefined ? -1 : keys.indexOf(stopKey);
	}

	#preferredKeys(): RovingKey[] {
		const resting = this.#focusWithin
			? null
			: (this.#options.restingKey?.() ?? null);
		const active = this.#repointedActiveKey(this.#options.keys());
		return [resting, active].filter((key) => key !== null);
	}

	#firstFocusTarget(keys: Iterable<RovingKey>): HTMLElement | null {
		for (const key of keys) {
			const item = this.#items.get(key);
			const target = item && this.#focusTargetOf({ key, item });
			if (target && isRendered(target)) return target;
		}
		return null;
	}

	#keptStop(keys: Keys): HTMLElement | null {
		const stop = this.#stop;
		const key = stop?.isConnected ? this.#itemAround(stop)?.key : undefined;
		const holds =
			key !== undefined &&
			keys.includes(key) &&
			this.#firstFocusTarget([key]) === stop &&
			this.#isInsideBand({ key, band: visibleBand(this.#scroller) });
		return holds ? stop : null;
	}

	#syncStop(): void {
		const keys = this.#options.keys();
		this.activeKey = this.#repointedActiveKey(keys);
		this.#lastKeys = keys;
		this.#returnToOpener(keys);
		const holder =
			this.#firstFocusTarget(this.#preferredKeys()) ??
			this.#keptStop(keys) ??
			this.#firstFocusTarget(this.#visibleKeys(keys)) ??
			this.#firstFocusTarget(keys);
		if (this.#stop !== null && this.#stop !== holder)
			this.#stop.setAttribute("tabindex", "-1");
		this.#stop = holder;
		if (holder === null) return;
		if (this.#options.stopTabindex === "native")
			holder.removeAttribute("tabindex");
		else holder.setAttribute("tabindex", "0");
	}

	#isInsideBand({ key, band }: { key: RovingKey; band: Band }): boolean {
		const item = this.#items.get(key);
		return item !== undefined && fitsInBand({ element: item, band });
	}

	*#visibleKeys(keys: Iterable<RovingKey>): Generator<RovingKey> {
		const band = visibleBand(this.#scroller);
		for (const key of keys)
			if (this.#isInsideBand({ key, band })) yield key;
	}

	#nearestMounted({ keys, index, band }: NearestQuery): LocatedItem | null {
		const found = nearestIndex({
			from: index,
			count: keys.length,
			accepts: (at) => {
				const item = this.#items.get(keys[at]!);
				if (item === undefined || item.closest("[inert]") !== null)
					return false;
				return (
					band === undefined ||
					this.#isInsideBand({ key: keys[at]!, band })
				);
			},
		});
		if (found === null) return null;
		return { key: keys[found]!, item: this.#items.get(keys[found]!)! };
	}

	#itemAround(target: EventTarget | null): LocatedItem | null {
		for (
			let node = target instanceof Element ? target : null;
			node !== null && node !== this.#container;
			node = node.parentElement
		) {
			const key = this.#keyOf.get(node);
			if (key !== undefined && this.#items.get(key) === node)
				return { key, item: node as HTMLElement };
		}
		return null;
	}

	#cellAt(target: EventTarget | null): LocatedCell | null {
		const located = this.#itemAround(target);
		if (located === null) return null;
		const cells = this.#options.cells?.(located.item) ?? [located.item];
		const cellIndex = cells.findIndex((cell) => cell === target);
		return cellIndex < 0 ? null : { ...located, cells, cellIndex };
	}

	#onKeydown = (event: KeyboardEvent) => {
		const container = this.#container;
		if (
			container === null ||
			event.defaultPrevented ||
			event.isComposing ||
			consumesScrollKeys(event.target)
		)
			return;
		const at = this.#cellAt(event.target);
		if (at === null || this.#typeahead({ event, from: at.key })) return;
		const { orientation } = this.#options;
		const direction =
			getComputedStyle(container).direction === "rtl" ? "rtl" : "ltr";
		const move = moveForKey({
			event,
			orientation,
			direction,
			platform: currentPlatform(),
			hasCells: this.#options.cells !== undefined,
			cellIsLink: event.target instanceof HTMLAnchorElement,
		});
		if (move === null) return;
		const keys = this.#options.keys();
		const index = isCellMove(move)
			? null
			: this.#plan({ keys, from: keys.indexOf(at.key), move });
		if (isCellMove(move) ? this.#stepCell({ at, move }) : index !== null) {
			event.preventDefault();
			if (index !== null)
				void this.#land({ key: keys[index]!, preventScroll: false });
			return;
		}
		const edge = edgeOfMove({
			key: event.key,
			move,
			orientation,
			direction,
		});
		const handled = this.#options.onEdge?.(edge) ?? false;
		if (handled || this.#options.consumeAtEdge?.includes(edge))
			event.preventDefault();
		else scrollTowardEdge({ event, edge, scroller: this.#scroller });
	};

	#stepCell({ at, move }: CellMove): boolean {
		const index = at.cellIndex + (move === "nextCell" ? 1 : -1);
		const cell = at.cells[index];
		if (cell === undefined) return false;
		this.#column = { key: at.key, index };
		cell.focus();
		return true;
	}

	#plan({ keys, from, move }: MoveRequest): number | null {
		if (from < 0 || from >= keys.length) return null;
		const wrap = this.#options.wrap ?? "none";
		const geometry = this.#geometry({ keys, from, move });
		const skip = { move: skipStep[move], geometry, wrap };
		const visited = [from];
		let index = targetIndex({ move, from, geometry, wrap });
		while (!visited.includes(index)) {
			visited.push(index);
			if (this.#canTakeFocus(keys[index]!)) return index;
			index = targetIndex({ ...skip, from: index });
		}
		return null;
	}

	#geometry({ keys, from, move }: MoveRequest): RovingGeometry {
		const container = this.#container;
		const columns =
			this.#options.orientation === "grid" && container !== null
				? (this.#options.columns ?? gridColumns)(container)
				: 1;
		const sectionStarts = this.#options.sectionStarts?.() ?? [];
		const rows = {
			count: keys.length,
			columns,
			sectionStarts,
			pageRows: 1,
		};
		if (move !== "pageUp" && move !== "pageDown") return rows;
		const band = visibleBand(this.#scroller);
		const pageRows =
			this.#options.pageRows?.() ??
			rowsPerPage({
				from,
				geometry: rows,
				downward: move === "pageDown",
				bandHeight: band.bottom - band.top,
				topAt: (at) =>
					this.#items.get(keys[at]!)?.getBoundingClientRect().top ??
					null,
			});
		return { ...rows, pageRows };
	}

	async #land({ key, preventScroll }: Landing): Promise<boolean> {
		const landing = Symbol("landing");
		this.#landing = landing;
		try {
			const mounted = this.#items.get(key);
			const item = mounted ?? (await this.#revealed(key));
			if (item === null || this.#landing !== landing) return false;
			const target = this.#focusTargetOf({ key, item });
			if (target === null) return false;
			this.activeKey = key;
			this.#changingRows = true;
			target.focus({
				preventScroll: preventScroll || mounted === undefined,
			});
			return true;
		} finally {
			this.#changingRows = false;
			if (this.#landing === landing) this.#landing = null;
		}
	}

	async #revealed(key: RovingKey): Promise<HTMLElement | null> {
		const index = this.#options.keys().indexOf(key);
		const reveal = this.#options.reveal;
		if (index < 0 || reveal === undefined) return null;
		const registered = new Promise<HTMLElement | null>((resolve) => {
			const timer = setTimeout(() => resolve(null), REVEAL_TIMEOUT_MS);
			const settle = (item: HTMLElement) => {
				clearTimeout(timer);
				this.#awaited = null;
				resolve(item);
			};
			this.#awaited = { key, settle };
		});
		reveal(index);
		const item = await registered;
		if (item === null) return null;
		await tick();
		return item.isConnected ? item : null;
	}

	#typeahead({ event, from }: TypedKey): boolean {
		const labelOf = this.#options.typeahead;
		if (labelOf === undefined) return false;
		const typed = extendTypedText({ typed: this.#typed, event });
		if (typed === null) return false;
		this.#typed = typed;
		const keys = this.#options.keys();
		const index = typeaheadIndex({
			typed: typed.text,
			from: keys.indexOf(from),
			count: keys.length,
			labelAt: (at) => {
				const item = this.#items.get(keys[at]!);
				return item === undefined ? null : labelOf(item);
			},
		});
		if (index === null) return false;
		event.preventDefault();
		void this.#land({ key: keys[index]!, preventScroll: false });
		return true;
	}

	#adopt({ target, focused }: Adoption): void {
		const located = this.#itemAround(target);
		if (focused)
			this.#focused =
				located !== null && target instanceof Element
					? {
							key: located.key,
							index: this.#options.keys().indexOf(located.key),
							element: target,
						}
					: null;
		if (located === null) return;
		this.activeKey = located.key;
		const cells = this.#options.cells?.(located.item) ?? [];
		const cellIndex = cells.findIndex(
			(cell) => target instanceof Node && cell.contains(target),
		);
		const carriesColumn =
			this.#changingRows && this.#options.cellOnRowChange !== "primary";
		if (cellIndex < 0 || carriesColumn) return;
		this.#column = { key: located.key, index: cellIndex };
		this.#syncStop();
	}

	#onFocusAnywhere = ({ target }: FocusEvent) => {
		const inside = this.#container?.contains(target as Node) ?? false;
		this.#focusWithin = inside;
		if (!inside) this.#focused = null;
	};

	#onDocumentPointerDown = ({ target }: PointerEvent) => {
		const element = this.#focused?.element;
		if (element && !(target instanceof Node && element.contains(target)))
			this.#focused = null;
	};

	#returnToOpener(keys: Keys): void {
		const opener = this.#opener;
		if (opener === null || opener.returning === null) return;
		if (keys.length === 0) {
			const fallback = this.#options.emptyFallback?.() ?? null;
			if (fallback === null) return;
			opener.returning = null;
			if (focusIsLost()) fallback.focus();
			return;
		}
		const redirect = this.#options.returnFocusTo;
		const key = opener.returnKey({ keys, redirect });
		if (key === null || !this.#canTakeFocus(key)) return;
		opener.returning = null;
		this.activeKey = key;
		if (focusIsLost()) void this.focus({ key });
	}

	#onScrollSettled(): void {
		const container = this.#container;
		if (container === null || container.contains(document.activeElement))
			return;
		const follow = this.#options.followScroll;
		if (follow !== undefined) {
			const keys = this.#options.keys();
			const [key] = this.#visibleKeys(
				follow === "first-visible" ? keys : keys.toReversed(),
			);
			if (key !== undefined) this.activeKey = key;
		}
		untrack(() => this.#syncStop());
	}

	#demoteChangedCells(records: MutationRecord[]): void {
		if (this.#options.cells === undefined) return;
		const changed = records.flatMap(
			({ target }) => this.#itemAround(target)?.item ?? [],
		);
		for (const item of changed) this.#demote(item);
		if (changed.length > 0) untrack(() => this.#syncStop());
	}

	#recoverLostFocus(records: MutationRecord[]): void {
		const focused = this.#focused;
		if (!this.#focusWithin || focused === null || !focusIsLost()) return;
		if (!wasDisplaced({ element: focused.element, records })) return;
		const keys = this.#options.keys();
		const index = keys.indexOf(focused.key);
		const refocused = this.#nearestMounted({
			keys,
			index: index < 0 ? focused.index : index,
		});
		if (refocused !== null)
			this.#focusTargetOf(refocused)?.focus({ preventScroll: true });
	}

	#holdIfFocusWasInside(key: RovingKey): void {
		const container = this.#container;
		if (container === null || this.#focused?.key !== key || !focusIsLost())
			return;
		const index = this.#lastKeys.indexOf(key);
		const release = holdFocusInPlace(container);
		void tick().then(() => {
			if (this.#landing === null && document.activeElement === container)
				this.#refocusAfterTeardown({ key, index });
			release();
		});
	}

	#refocusAfterTeardown({ key, index }: { key: RovingKey; index: number }) {
		const keys = this.#options.keys();
		const listed = keys.indexOf(key);
		if (listed >= 0) {
			const query = { keys, index: listed };
			const nearest =
				this.#nearestMounted({
					...query,
					band: visibleBand(this.#scroller),
				}) ?? this.#nearestMounted(query);
			if (nearest !== null)
				this.#focusTargetOf(nearest)?.focus({ preventScroll: true });
			return;
		}
		if (keys.length > 0) {
			const clamped = Math.min(Math.max(index, 0), keys.length - 1);
			void this.#land({ key: keys[clamped]!, preventScroll: false });
			return;
		}
		this.#options.emptyFallback?.()?.focus();
	}
}
