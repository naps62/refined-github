import {writable} from 'svelte/store';

export const categories = {
	events: 'Events',
	commits: 'Commits',
	bots: 'Bot comments',
	resolved: 'Resolved & hidden comments',
} as const;

export type Category = keyof typeof categories;
export type State = ReadonlySet<Category>;

export function serializeState(state: State): string {
	return [...state].sort().join(' ');
}

export function parseState(serialized: string): Set<Category> {
	const valid = new Set(Object.keys(categories));
	return new Set(
		serialized
			.split(' ')
			.filter((token): token is Category => valid.has(token)),
	);
}

export const activityFilterState = writable<State>(new Set());
