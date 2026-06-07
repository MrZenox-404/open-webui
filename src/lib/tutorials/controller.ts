import { get } from 'svelte/store';
import { tutorial, settings } from '$lib/stores';
import { updateUserSettings } from '$lib/apis/users';
import { getTutorial } from './registry';
import type { Tutorial, TutorialStep } from './types';

type TutorialPrefs = { seen?: boolean; completed?: string[] };

// Best-effort persistence into user settings (settings.ui.tutorial), mirroring
// how the rest of the app saves prefs. Survives reloads + syncs across devices.
const persistTutorialPrefs = (update: TutorialPrefs) => {
	const current: any = get(settings) ?? {};
	const prev: TutorialPrefs = current.tutorial ?? {};
	const next: TutorialPrefs = {
		seen: prev.seen ?? false,
		completed: prev.completed ?? [],
		...update
	};
	settings.set({ ...current, tutorial: next });
	try {
		if (typeof localStorage !== 'undefined' && localStorage.token) {
			updateUserSettings(localStorage.token, { ui: get(settings) }).catch(() => {});
		}
	} catch {
		// non-fatal — persistence is best-effort
	}
};

export const hasSeenTutorial = (): boolean => !!(get(settings) as any)?.tutorial?.seen;

// Clears the seen/completed flags so the tour auto-launches again (testing aid).
export const resetTutorialPrefs = () => persistTutorialPrefs({ seen: false, completed: [] });

export const startTutorial = (tourId: string) => {
	const t = getTutorial(tourId);
	if (!t) {
		console.warn(`[tutorial] unknown tour: ${tourId}`);
		return;
	}
	tutorial.set({ tourId, stepIndex: 0, active: true });
	// Mark as seen so it won't auto-launch again; manual relaunch stays available.
	persistTutorialPrefs({ seen: true });
};

// Global resumable exit — closes the whole tour (no per-step skip).
export const exitTutorial = () => {
	tutorial.update((s) => ({ ...s, active: false }));
};

export const nextStep = () => {
	const s = get(tutorial);
	const t = getTutorial(s.tourId);
	if (!t) return;
	if (s.stepIndex >= t.steps.length - 1) {
		completeTutorial();
		return;
	}
	tutorial.set({ ...s, stepIndex: s.stepIndex + 1 });
};

// Jump directly to a step by id (e.g. skip an intermediate step when the user
// performs its action early). No-op if the id isn't found.
export const goToStepById = (id: string) => {
	const s = get(tutorial);
	const t = getTutorial(s.tourId);
	if (!t) return;
	const idx = t.steps.findIndex((st) => st.id === id);
	if (idx >= 0 && idx !== s.stepIndex) tutorial.set({ ...s, stepIndex: idx });
};

export const prevStep = () => {
	const s = get(tutorial);
	if (s.stepIndex <= 0) return;
	tutorial.set({ ...s, stepIndex: s.stepIndex - 1 });
};

export const completeTutorial = () => {
	const s = get(tutorial);
	if (s.tourId) {
		const completed = new Set<string>((get(settings) as any)?.tutorial?.completed ?? []);
		completed.add(s.tourId);
		persistTutorialPrefs({ seen: true, completed: [...completed] });
	}
	tutorial.set({ tourId: null, stepIndex: 0, active: false });
};

export const currentTour = (): Tutorial | null => getTutorial(get(tutorial).tourId);

export const currentStep = (): TutorialStep | null => {
	const s = get(tutorial);
	const t = getTutorial(s.tourId);
	return t?.steps[s.stepIndex] ?? null;
};
