// Declarative tutorial model. Tours are pure data; one renderer
// (TutorialOverlay.svelte) and one controller (controller.ts) interpret them.

export type Placement = 'top' | 'bottom' | 'left' | 'right' | 'center';

// How a step is considered complete and the tour advances.
export type AdvanceOn =
	| { type: 'manual' } // user clicks "Next" in the popover
	| { type: 'click' } // user clicks the anchored element
	| { type: 'route'; match: string } // $page.url.pathname matches (regex, tested via RegExp)
	| { type: 'signal'; name: string } // a tutorialSignal(name) is emitted
	| { type: 'element'; anchor: string }; // advance once a matching element appears in the DOM

export interface TutorialStep {
	id: string;
	// data-tutorial value, or a raw CSS selector if it starts with # . or [.
	// Omit for a centered modal with no spotlight.
	anchor?: string;
	placement?: Placement;
	title: string;
	body: string;
	advance: AdvanceOn;
	// Explanatory steps that auto-skip if their anchor never appears.
	// Never set this on action-gated steps — that is what would "trap" a user.
	optional?: boolean;
	// Side effect run when the step is entered, e.g. open the sidebar so its
	// anchor is visible. Keep these idempotent and cheap.
	onEnter?: () => void;
	// Expand the spotlight beyond the anchor (px). Useful when an associated
	// popup (e.g. the "#" command list) appears next to the anchor and should
	// also sit inside the highlighted area.
	padding?: number | { top?: number; right?: number; bottom?: number; left?: number };
	// Show an animated spinner in the card to convey "we're waiting".
	loading?: boolean;
	// Tips cycled one-at-a-time beneath the spinner (loading steps only).
	tips?: string[];
}

export interface Tutorial {
	id: string;
	title: string;
	steps: TutorialStep[];
}
