import * as pageDetect from 'github-url-detection';

import features from '../feature-manager.js';
import observe from '../helpers/selector-observer.js';

function rewrite(link: HTMLAnchorElement): void {
	if (/\/pull\/\d+$/.test(link.pathname) && !link.hash) {
		link.pathname += '/files';
	}
}

function init(signal: AbortSignal): void {
	observe('a[href*="/pull/"]', rewrite, {signal});
}

void features.add(import.meta.url, {
	include: [
		pageDetect.isIssueOrPRList,
		pageDetect.isGlobalIssueOrPRList,
		pageDetect.isNotifications,
		pageDetect.isFeed,
	],
	init,
});

/*

Test URLs:

https://github.com/refined-github/refined-github/pulls

*/
