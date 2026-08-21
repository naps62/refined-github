import * as pageDetect from 'github-url-detection';
import {$optional, elementExists} from 'select-dom';

import features from '../feature-manager.js';
import delay from '../helpers/delay.js';
import observe from '../helpers/selector-observer.js';
import {viewedToggleSelector} from './batch-mark-files-as-viewed.js';

function isPureRename(file: HTMLElement): boolean {
	// The phrase alone could appear inside diffed code; a pure rename renders no diff lines
	return /renamed without changes/i.test(file.textContent ?? '')
		&& !elementExists('table, [class*="DiffLines"], .blob-code', file);
}

async function process(file: HTMLElement): Promise<void> {
	if (!isPureRename(file)) {
		// The diff body may render after the container appears
		await delay(1000);
		if (!isPureRename(file)) {
			return;
		}
	}

	const viewedToggle = $optional(viewedToggleSelector, file);
	if (viewedToggle) {
		const checked = viewedToggle instanceof HTMLInputElement
			? viewedToggle.checked
			: elementExists('.octicon-checkbox-fill', viewedToggle);
		if (!checked) {
			viewedToggle.click();
		}

		return;
	}

	$optional([
		'button[aria-expanded="true"]:has(.octicon-chevron-down)',
		'button.js-details-target[aria-expanded="true"]',
	], file)?.click();
}

function init(signal: AbortSignal): void {
	observe([
		// React view
		'[class^="Diff-module__diffTargetable"]',
		// Classic view
		'.js-file',
	], process, {signal});
}

void features.add(import.meta.url, {
	include: [
		pageDetect.isPRFiles,
	],
	exclude: [
		pageDetect.isPRFile404,
		pageDetect.isPRCommit,
	],
	init,
});

/*

Test URLs:

https://github.com/refined-github/sandbox/pull/55/files

*/
