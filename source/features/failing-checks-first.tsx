import './failing-checks-first.css';

import React from 'dom-chef';
import * as pageDetect from 'github-url-detection';
import {$$, elementExists} from 'select-dom';

import features from '../feature-manager.js';
import observe from '../helpers/selector-observer.js';

const failingIcon = '.octicon-x, .octicon-x-circle-fill, .octicon-stop';
const passingIcon = '.octicon-check, .octicon-check-circle-fill, .octicon-skip, .octicon-square-fill';
const anyIcon = `${failingIcon}, ${passingIcon}`;

const checksList = [
	// React merge box
	'section[aria-label="Checks"]',
	// Classic view (commits, old merge box)
	'.merge-status-list',
];

function getRows(list: Element): HTMLElement[] {
	const candidates = $$('.merge-status-item, li', list)
		.filter(row => elementExists(anyIcon, row));
	// Keep only innermost matches; nested wrappers would double-count
	return candidates.filter(row => !candidates.some(other => other !== row && row.contains(other)));
}

function process(list: Element): void {
	const rows = getRows(list);
	const failing = rows.filter(row => elementExists(failingIcon, row));
	const passing = rows.filter(row => elementExists(passingIcon, row) && !failing.includes(row));

	const active = failing.length > 0 && passing.length > 0;
	list.classList.toggle('rgh-fcf', active);

	for (const row of rows) {
		row.classList.toggle('rgh-fcf-passing', active && passing.includes(row));
	}

	let toggle = list.querySelector(':scope .rgh-fcf-toggle');
	if (!active) {
		toggle?.remove();
		return;
	}

	const label = `${passing.length} passing check${passing.length === 1 ? '' : 's'} hidden — show`;
	if (!toggle) {
		toggle = (
			<button className="rgh-fcf-toggle" type="button" />
		);
		toggle.addEventListener('click', event => {
			event.preventDefault();
			event.stopPropagation();
			list.classList.toggle('rgh-fcf-show-all');
		});
		list.append(toggle);
	}

	if (toggle.textContent !== label) {
		toggle.textContent = label;
	}
}

const observers = new WeakSet<Element>();
let syncTimer: number | undefined;

function watch(list: Element, signal: AbortSignal): void {
	process(list);
	if (observers.has(list)) {
		return;
	}

	observers.add(list);
	const observer = new MutationObserver(() => {
		clearTimeout(syncTimer);
		syncTimer = window.setTimeout(() => {
			process(list);
		}, 100);
	});
	observer.observe(list, {childList: true, subtree: true});
	signal.addEventListener('abort', () => {
		observer.disconnect();
	});
}

function init(signal: AbortSignal): void {
	observe(checksList, list => {
		watch(list, signal);
	}, {signal});
}

void features.add(import.meta.url, {
	include: [
		pageDetect.isPRConversation,
		pageDetect.isCommit,
	],
	init,
});

/*

Test URLs:

https://github.com/refined-github/refined-github/pull/7166

*/
