import type { Tutorial } from './types';
import { ragTour } from './tours/rag';

// id -> tour. Add secondary tours (model, chat, notes) here as they land.
export const tutorials: Record<string, Tutorial> = {
	[ragTour.id]: ragTour
};

export const getTutorial = (id: string | null): Tutorial | null =>
	id ? (tutorials[id] ?? null) : null;
