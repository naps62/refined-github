import './pr-tree-mark-viewed.css';

import React from 'dom-chef';
import * as pageDetect from 'github-url-detection';
import delegate from 'delegate-it';
import {$$, $optional, elementExists} from 'select-dom';

import features from '../feature-manager.js';
import {registerHotkey} from '../github-helpers/hotkey.js';
import observe from '../helpers/selector-observer.js';
import {viewedToggleSelector} from './batch-mark-files-as-viewed.js';

const treeFileRow = 'li[class*="file-tree-row"]';
const treeRow = 'li[role="treeitem"]';
const hideViewedKey = 'rgh-tree-hide-viewed';

function getViewedToggle(row: Element): HTMLElement | undefined {
	const hash = $optional<HTMLAnchorElement>('a[href^="#diff-"]', row)?.hash;
	if (!hash) {
		return undefined;
	}

	const diff = document.getElementById(hash.slice(1));
	return diff ? $optional(viewedToggleSelector, diff) : undefined;
}

function isViewed(toggle: HTMLElement): boolean {
	return toggle instanceof HTMLInputElement
		? toggle.checked
		: elementExists('.octicon-checkbox-fill', toggle);
}

let syncTimer: number | undefined;
function scheduleSync(): void {
	clearTimeout(syncTimer);
	syncTimer = window.setTimeout(syncTree, 100);
}

function syncTree(): void {
	for (const row of $$(treeFileRow)) {
		const toggle = getViewedToggle(row);
		row.classList.toggle('rgh-tree-viewed', Boolean(toggle && isViewed(toggle)));
	}

	for (const dir of $$(treeRow)) {
		if (dir.matches(treeFileRow)) {
			continue;
		}

		const files = $$(treeFileRow, dir);
		dir.classList.toggle(
			'rgh-tree-viewed-dir',
			files.length > 0 && files.every(file => file.classList.contains('rgh-tree-viewed')),
		);
	}
}

function onToggleClick(event: MouseEvent): void {
	event.preventDefault();
	event.stopPropagation();

	const row = (event.currentTarget as HTMLElement).closest(treeRow)!;
	const fileRows = row.matches(treeFileRow) ? [row] : $$(treeFileRow, row);
	const toggles = fileRows
		.map(fileRow => getViewedToggle(fileRow))
		.filter(toggle => toggle !== undefined);

	// If anything is unviewed, mark everything viewed; otherwise unmark everything
	const marking = toggles.some(toggle => !isViewed(toggle));
	for (const toggle of toggles) {
		if (isViewed(toggle) !== marking) {
			toggle.click();
		}
	}

	scheduleSync();
}

function addButton(row: HTMLElement): void {
	if (elementExists(':scope > .rgh-tree-viewed-toggle', row)) {
		return;
	}

	const button = (
		<button
			className="rgh-tree-viewed-toggle"
			type="button"
			aria-label="Toggle viewed"
		>✓</button>
	);
	button.addEventListener('click', onToggleClick);
	row.append(button);
}

function toggleHideViewed(): void {
	const tree = $optional('[role="tree"]');
	if (!tree) {
		return;
	}

	const hide = tree.classList.toggle('rgh-tree-hide-viewed');
	localStorage.setItem(hideViewedKey, String(hide));
}

function init(signal: AbortSignal): void {
	observe(treeRow, row => {
		addButton(row);
		scheduleSync();
	}, {signal});
	observe([...viewedToggleSelector], scheduleSync, {signal});
	delegate([...viewedToggleSelector], 'click', scheduleSync, {signal});
	observe('[role="tree"]', tree => {
		if (localStorage.getItem(hideViewedKey) === 'true') {
			tree.classList.add('rgh-tree-hide-viewed');
		}
	}, {signal});
	registerHotkey('v', toggleHideViewed, {signal});
}

void features.add(import.meta.url, {
	include: [
		pageDetect.isPRFiles,
	],
	exclude: [
		pageDetect.isPRFile404,
		pageDetect.isPRCommit,
	],
	shortcuts: {
		v: 'Hide/show viewed files in the PR file tree',
	},
	init,
});

/*

Test URLs:

https://github.com/refined-github/sandbox/pull/55/files

*/
