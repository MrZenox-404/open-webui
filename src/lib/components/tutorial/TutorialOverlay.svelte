<script lang="ts">
	import { onMount, onDestroy, getContext } from 'svelte';
	import { get } from 'svelte/store';
	import { fade } from 'svelte/transition';
	import { page } from '$app/stores';

	const i18n = getContext('i18n');

	import { tutorial } from '$lib/stores';
	import { tutorialSignal } from '$lib/tutorials/signals';
	import { getTutorial } from '$lib/tutorials/registry';
	import { nextStep, prevStep, exitTutorial, goToStepById } from '$lib/tutorials/controller';
	import type { TutorialStep } from '$lib/tutorials/types';

	const GAP = 14;
	const PAD = 6;
	const CARD_WIDTH = 420; // fixed — never derive width from clientWidth (feedback loop)
	const FIND_TIMEOUT = 3000; // ms before an optional step gives up and skips

	let rect: DOMRect | null = null;
	let anchorEl: HTMLElement | null = null;
	let activeStep: TutorialStep | null = null; // fresh step captured at enterStep (avoids reactive-order staleness)
	let cardW = CARD_WIDTH; // measured (for positioning only — width itself is CSS max-content)
	let cardH = 0;

	let activeStepKey = '';
	let stepEntryPath = '';
	let baselineSeq = 0;

	let rafId: number | null = null;
	let observer: MutationObserver | null = null;
	let advanceObserver: MutationObserver | null = null; // watches for an 'element' advance target
	let findTimer: ReturnType<typeof setTimeout> | null = null;
	let onAnchorClick: (() => void) | null = null;

	let tipIndex = 0; // cycling tip for loading steps
	let tipTimer: ReturnType<typeof setInterval> | null = null;

	$: tour = getTutorial($tutorial.tourId);
	$: step = (tour?.steps?.[$tutorial.stepIndex] ?? null) as TutorialStep | null;
	$: centered = !rect; // centered card while waiting for an anchor or for 'center' steps
	$: paddedRect = expandRect(rect, step?.padding);
	$: cardStyle = computeCard(paddedRect, step?.placement, cardW, cardH);
	$: spotStyle = paddedRect
		? `left:${paddedRect.left}px; top:${paddedRect.top}px; width:${paddedRect.width}px; height:${paddedRect.height}px;`
		: '';

	// Enter a step exactly once when the (tour, index) pair changes.
	$: stepKey = $tutorial.active ? `${$tutorial.tourId}:${$tutorial.stepIndex}` : '';
	$: if (stepKey !== activeStepKey) {
		activeStepKey = stepKey;
		enterStep();
	}

	// Route-based advance: fire when the path changes into a match.
	$: if ($tutorial.active && step?.advance?.type === 'route') {
		const p = $page.url.pathname;
		if (p !== stepEntryPath && new RegExp(step.advance.match).test(p)) {
			nextStep();
		}
	}

	function normPad(padding: TutorialStep['padding']) {
		if (typeof padding === 'number') {
			return { top: padding, right: padding, bottom: padding, left: padding };
		}
		return {
			top: padding?.top ?? 0,
			right: padding?.right ?? 0,
			bottom: padding?.bottom ?? 0,
			left: padding?.left ?? 0
		};
	}

	type Box = { left: number; top: number; width: number; height: number; right: number; bottom: number };

	// The spotlight box = anchor rect grown by PAD + per-step padding. The card is
	// positioned OUTSIDE this box so it never covers the highlighted area.
	function expandRect(r: DOMRect | null, padding: TutorialStep['padding']): Box | null {
		if (!r) return null;
		const p = normPad(padding);
		const left = r.left - PAD - p.left;
		const top = r.top - PAD - p.top;
		const width = r.width + PAD * 2 + p.left + p.right;
		const height = r.height + PAD * 2 + p.top + p.bottom;
		return { left, top, width, height, right: left + width, bottom: top + height };
	}

	const selectorFor = (anchor?: string): string | null => {
		if (!anchor) return null;
		return /^[#.[]/.test(anchor) ? anchor : `[data-tutorial="${anchor}"]`;
	};

	function teardownStep() {
		if (observer) observer.disconnect();
		observer = null;
		if (advanceObserver) advanceObserver.disconnect();
		advanceObserver = null;
		if (findTimer) clearTimeout(findTimer);
		findTimer = null;
		if (anchorEl && onAnchorClick) anchorEl.removeEventListener('click', onAnchorClick);
		onAnchorClick = null;
		anchorEl = null;
		rect = null;
		stopTips();
	}

	function stopTips() {
		if (tipTimer) clearInterval(tipTimer);
		tipTimer = null;
	}

	function startTips(tips?: string[]) {
		stopTips();
		tipIndex = 0;
		if (tips && tips.length > 1) {
			tipTimer = setInterval(() => {
				tipIndex = (tipIndex + 1) % tips.length;
			}, 3200);
		}
	}

	// Advance when a given element appears (e.g. the answer's citations render).
	function watchAdvanceElement(anchor: string) {
		const sel = selectorFor(anchor);
		if (!sel) return;
		if (document.querySelector(sel)) {
			nextStep();
			return;
		}
		advanceObserver = new MutationObserver(() => {
			if (document.querySelector(sel)) {
				if (advanceObserver) advanceObserver.disconnect();
				advanceObserver = null;
				nextStep();
			}
		});
		advanceObserver.observe(document.body, { childList: true, subtree: true });
	}

	function attachAnchor(el: HTMLElement) {
		anchorEl = el;
		try {
			el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
		} catch {}
		rect = el.getBoundingClientRect();
		if (activeStep?.advance?.type === 'click') {
			onAnchorClick = () => nextStep();
			el.addEventListener('click', onAnchorClick, { once: true });
		}
	}

	function findAnchor(selector: string, optional: boolean) {
		const existing = document.querySelector<HTMLElement>(selector);
		if (existing) {
			attachAnchor(existing);
			return;
		}
		observer = new MutationObserver(() => {
			const found = document.querySelector<HTMLElement>(selector);
			if (found) {
				if (observer) observer.disconnect();
				observer = null;
				if (findTimer) clearTimeout(findTimer);
				findTimer = null;
				attachAnchor(found);
			}
		});
		observer.observe(document.body, { childList: true, subtree: true });
		if (optional) {
			// Explanatory step whose target legitimately may not exist — skip it.
			findTimer = setTimeout(() => nextStep(), FIND_TIMEOUT);
		}
	}

	function enterStep() {
		teardownStep();
		// Read the current step fresh from the store — do NOT rely on the reactive
		// `step` var, which may not have recomputed yet when this fires.
		const s = get(tutorial);
		const t = getTutorial(s.tourId);
		activeStep = t?.steps[s.stepIndex] ?? null;
		if (!s.active || !activeStep) return;
		try {
			activeStep.onEnter?.();
		} catch (e) {
			console.warn('[tutorial] onEnter failed', e);
		}
		stepEntryPath = get(page).url.pathname;
		baselineSeq = get(tutorialSignal)?.seq ?? 0;
		startTips(activeStep.tips);
		const selector = selectorFor(activeStep.anchor);
		if (selector) findAnchor(selector, activeStep.optional ?? false);
		if (activeStep.advance?.type === 'element') {
			watchAdvanceElement(activeStep.advance.anchor);
		}
	}

	function computeCard(
		r: Box | null,
		placement: string | undefined,
		w: number,
		h: number
	): string {
		if (typeof window === 'undefined') return '';
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		w = w || CARD_WIDTH;
		h = h || 160;
		let left: number;
		let top: number;
		if (!r || placement === 'center') {
			left = (vw - w) / 2;
			top = (vh - h) / 2;
		} else if (placement === 'top') {
			top = r.top - h - GAP;
			left = r.left + r.width / 2 - w / 2;
		} else if (placement === 'left') {
			left = r.left - w - GAP;
			top = r.top + r.height / 2 - h / 2;
		} else if (placement === 'right') {
			left = r.right + GAP;
			top = r.top + r.height / 2 - h / 2;
		} else {
			top = r.bottom + GAP;
			left = r.left + r.width / 2 - w / 2;
		}
		left = Math.max(GAP, Math.min(left, vw - w - GAP));
		top = Math.max(GAP, Math.min(top, vh - h - GAP));
		return `left:${left}px; top:${top}px;`;
	}

	const tick = () => {
		const s = get(tutorial);
		if (!s.active) {
			rafId = null;
			return;
		}
		if (anchorEl) {
			if (anchorEl.isConnected) {
				rect = anchorEl.getBoundingClientRect();
			} else {
				// Anchor left the DOM (e.g. the "#" command popup closed). Drop it and
				// re-acquire so the spotlight reattaches when/if it reappears.
				if (onAnchorClick) anchorEl.removeEventListener('click', onAnchorClick);
				onAnchorClick = null;
				anchorEl = null;
				rect = null;
				const sel = selectorFor(activeStep?.anchor);
				if (sel) findAnchor(sel, false);
			}
		}
		rafId = requestAnimationFrame(tick);
	};

	$: if ($tutorial.active && rafId === null) {
		rafId = requestAnimationFrame(tick);
	}

	onMount(() => {
		// Signal-based advance (file embedded, KB attached, message sent, …).
		const unsub = tutorialSignal.subscribe((sig) => {
			if (!sig) return;
			const s = get(tutorial);
			if (!s.active) return;
			const st = getTutorial(s.tourId)?.steps[s.stepIndex];
			if (!st || sig.seq <= baselineSeq) return;
			// signalSkip takes precedence: jump ahead if the user performed a later
			// step's action early (e.g. pressed Enter to send).
			if (st.signalSkip && st.signalSkip.name === sig.name) {
				goToStepById(st.signalSkip.to);
			} else if (st.advance?.type === 'signal' && st.advance.name === sig.name) {
				nextStep();
			}
		});

		// Dev/testing console helpers (auto-launch + UserMenu entry are the real
		// triggers). __tutorial.reset() then reload re-triggers the auto-launch.
		(window as any).__tutorial = {
			start: (id = 'rag') =>
				import('$lib/tutorials/controller').then((m) => m.startTutorial(id)),
			reset: () => import('$lib/tutorials/controller').then((m) => m.resetTutorialPrefs()),
			exit: exitTutorial,
			// Jump to a step for testing: by 1-based number (matches the card's
			// "n / total") or by step id, e.g. __tutorial.goto(18) / goto('send-question').
			goto: (step: number | string, id = 'rag') => {
				const tour = getTutorial(id);
				if (!tour) return console.warn('[tutorial] unknown tour', id);
				const idx =
					typeof step === 'number'
						? step - 1
						: tour.steps.findIndex((s) => s.id === step);
				if (idx < 0 || idx >= tour.steps.length)
					return console.warn('[tutorial] no such step', step);
				tutorial.set({ tourId: id, stepIndex: idx, active: true });
				return `${idx + 1}/${tour.steps.length} → ${tour.steps[idx].id}`;
			}
		};

		return unsub;
	});

	onDestroy(() => {
		teardownStep();
		if (rafId !== null) cancelAnimationFrame(rafId);
	});
</script>

{#if $tutorial.active && step}
	<div class="fixed inset-0 tutorial-root" style="z-index:10000;">
		{#if centered}
			<div class="absolute inset-0 bg-black/50 tutorial-dim"></div>
		{:else}
			<div class="tutorial-spotlight" style={spotStyle}></div>
		{/if}

		<div
			class="tutorial-card fixed bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-800 shadow-2xl p-6 flex flex-col gap-4"
			style={cardStyle}
			bind:clientWidth={cardW}
			bind:clientHeight={cardH}
		>
			<div class="flex items-start justify-between gap-3">
				<h3 class="text-xl font-semibold leading-tight">{$i18n.t(step.title)}</h3>
				<button
					class="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 shrink-0 text-lg leading-none"
					title={$i18n.t('Exit tutorial')}
					on:click={exitTutorial}
				>
					✕
				</button>
			</div>

			<p class="text-base text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-line">
				{$i18n.t(step.body)}
			</p>

			{#if step.loading}
				<div class="flex items-center gap-3 pt-0.5">
					<span class="tutorial-spinner shrink-0"></span>
					{#if step.tips && step.tips.length}
						{#key tipIndex}
							<span
								in:fade={{ duration: 350 }}
								class="text-sm text-gray-500 dark:text-gray-400 leading-snug"
							>
								{$i18n.t(step.tips[tipIndex])}
							</span>
						{/key}
					{/if}
				</div>
			{/if}

			<div class="flex items-center justify-between gap-4 pt-1 flex-nowrap">
				<span class="text-sm text-gray-400 whitespace-nowrap shrink-0">
					{$tutorial.stepIndex + 1} / {tour?.steps.length}
				</span>
				<div class="flex items-center gap-2 shrink-0">
					{#if $tutorial.stepIndex > 0}
						<button
							class="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
							on:click={prevStep}
						>
							{$i18n.t('Back')}
						</button>
					{/if}
					{#if step.advance.type === 'manual'}
						<button
							class="px-4 py-2 text-sm font-medium text-white bg-brand-500 hover:opacity-90"
							on:click={nextStep}
						>
							{$tutorial.stepIndex === (tour?.steps.length ?? 1) - 1
								? $i18n.t('Done')
								: $i18n.t('Next')}
						</button>
					{:else}
						<span class="px-1 py-2 text-sm text-gray-400 italic whitespace-nowrap">
							{step.loading
								? $i18n.t('Working…')
								: step.advance.type === 'route' || step.advance.type === 'click'
									? $i18n.t('Complete the highlighted step…')
									: $i18n.t('Continue in the app…')}
						</span>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.tutorial-root {
		pointer-events: none; /* page stays interactive for action-gated steps */
	}
	.tutorial-dim {
		pointer-events: auto; /* centered steps block the page behind */
	}
	.tutorial-spotlight {
		position: fixed;
		box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.55);
		border: 2px solid #ea1c22;
		border-radius: 0;
		pointer-events: none;
		transition:
			left 0.12s ease,
			top 0.12s ease,
			width 0.12s ease,
			height 0.12s ease;
	}
	.tutorial-card {
		pointer-events: auto;
		border-radius: 0; /* design system: square corners */
		width: max-content; /* hug children — no fixed width, no shrink loop */
		min-width: 340px;
		max-width: min(92vw, 480px);
	}
	.tutorial-spinner {
		width: 1.1rem;
		height: 1.1rem;
		border: 2px solid #ea1c22;
		border-top-color: transparent;
		border-radius: 9999px;
		display: inline-block;
		animation: tutorial-spin 0.7s linear infinite;
	}
	@keyframes tutorial-spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
