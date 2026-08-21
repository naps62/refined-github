import './pr-context-in-files.css';

import React from 'dom-chef';
import * as pageDetect from 'github-url-detection';

import api from '../github-helpers/api.js';
import {getConversationNumber} from '../github-helpers/index.js';
import features from '../feature-manager.js';
import observe from '../helpers/selector-observer.js';

const prContextQuery = `
	query GetPRContext($owner: String!, $name: String!, $number: Int!) {
		repository(owner: $owner, name: $name) {
			pullRequest(number: $number) {
				bodyHTML
				author { login }
				comments(last: 30) {
					totalCount
					nodes {
						bodyHTML
						createdAt
						author { login avatarUrl }
					}
				}
			}
		}
	}
`;

type Comment = {
	bodyHTML: string;
	createdAt: string;
	author: {login: string; avatarUrl: string} | null;
};

let request: Promise<any> | undefined;

async function getContext(): Promise<any> {
	request ??= api.v4(prContextQuery, {
		variables: {number: getConversationNumber()!},
	});
	const {repository} = await request;
	return repository.pullRequest;
}

function commentCard(comment: Comment): JSX.Element {
	return (
		<div className="rgh-pr-context-comment">
			<div className="rgh-pr-context-comment-header">
				{comment.author && <img src={comment.author.avatarUrl} width={20} height={20} alt="" />}
				<strong>{comment.author?.login ?? 'ghost'}</strong>
				<span>{new Date(comment.createdAt).toLocaleDateString()}</span>
			</div>
			<div className="markdown-body" dangerouslySetInnerHTML={{__html: comment.bodyHTML}} />
		</div>
	);
}

let bottomCard: HTMLElement | undefined;

async function processDiff(diff: HTMLElement): Promise<void> {
	const parent = diff.parentElement;
	if (!parent) {
		return;
	}

	let pr;
	try {
		pr = await getContext();
	} catch {
		return; // Missing/invalid API token
	}

	if (pr.bodyHTML && !document.querySelector('.rgh-pr-context-top')) {
		parent.prepend(
			<div className="rgh-pr-context rgh-pr-context-top">
				<div className="rgh-pr-context-comment-header">
					<strong>{pr.author?.login ?? 'ghost'}</strong>
					<span>Description</span>
				</div>
				<div className="markdown-body" dangerouslySetInnerHTML={{__html: pr.bodyHTML}} />
			</div>,
		);
	}

	const comments = pr.comments.nodes as Comment[];
	if (comments.length > 0) {
		bottomCard ??= (
			<div className="rgh-pr-context rgh-pr-context-bottom">
				<div className="rgh-pr-context-comment-header">
					<strong>
						{pr.comments.totalCount > comments.length
							? `Last ${comments.length} of ${pr.comments.totalCount} comments`
							: `Comments (${comments.length})`}
					</strong>
				</div>
				{comments.map(comment => commentCard(comment))}
			</div>
		);
		// Re-append so it stays below progressively-loaded diffs
		parent.append(bottomCard);
	}
}

function init(signal: AbortSignal): void {
	request = undefined;
	bottomCard = undefined;
	observe([
		// React view
		'[class^="Diff-module__diffTargetable"]',
		// Classic view
		'.js-file',
	], processDiff, {signal});
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
