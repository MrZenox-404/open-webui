import { writable } from 'svelte/store';

// Tiny event bus for the few action milestones that live in local component
// state and aren't observable from a global store (file embedded, KB attached
// in chat, message sent). Instrumented components call emitTutorialSignal(name)
// with a one-liner; the tutorial controller subscribes. Keeps detection logic
// in one place instead of reaching into component internals.

export const tutorialSignal = writable<{ name: string; seq: number } | null>(null);

let seq = 0;

export const emitTutorialSignal = (name: string) => {
	seq += 1;
	tutorialSignal.set({ name, seq });
};
