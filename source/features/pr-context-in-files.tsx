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
			mergeCommitAllowed
			squashMergeAllowed
			rebaseMergeAllowed
			pullRequest(number: $number) {
				bodyHTML
				author { login }
				state
				isDraft
				mergeable
				reviewDecision
				comments(last: 30) {
					totalCount
					nodes {
						bodyHTML
						createdAt
						author { login avatarUrl }
					}
				}
				commits(last: 1) {
					nodes {
						commit {
							statusCheckRollup {
								state
								contexts(first: 100) {
									nodes {
										__typename
										... on CheckRun { name status conclusion detailsUrl }
										... on StatusContext { context state targetUrl }
									}
								}
							}
						}
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
	return (await request).repository;
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

type Check = {
	name?: string;
	context?: string;
	status?: string;
	conclusion?: string;
	state?: string;
	detailsUrl?: string;
	targetUrl?: string;
};

function checkState(check: Check): 'passing' | 'pending' | 'failing' {
	const state = (check.conclusion ?? (check.status === 'COMPLETED' ? '' : check.status) ?? check.state ?? '').toUpperCase()
		|| (check.state ?? '').toUpperCase();
	if (['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(state)) {
		return 'passing';
	}

	if (['QUEUED', 'IN_PROGRESS', 'PENDING', 'EXPECTED', 'WAITING', ''].includes(state)) {
		return 'pending';
	}

	return 'failing';
}

function checkRow(check: Check): JSX.Element {
	const state = checkState(check);
	const glyph = state === 'passing' ? '✓' : (state === 'pending' ? '●' : '✗');
	return (
		<div className={`rgh-pr-context-check rgh-pr-context-check-${state}`}>
			<span>{glyph}</span>
			<a href={check.detailsUrl ?? check.targetUrl}>{check.name ?? check.context}</a>
		</div>
	);
}

async function merge(method: string, section: HTMLElement): Promise<void> {
	const number = getConversationNumber()!;
	// eslint-disable-next-line no-alert
	if (!confirm(`${method}-merge PR #${number}?`)) {
		return;
	}

	try {
		await api.v3uncached(`pulls/${number}/merge`, {
			method: 'PUT',
			body: {merge_method: method},
		});
		section.replaceChildren(<strong className="rgh-pr-context-merged">Merged ✓</strong>);
	} catch (error) {
		section.append(<div className="rgh-pr-context-check-failing">{String(error)}</div>);
	}
}

function mergeBox(repository: any): JSX.Element {
	const pr = repository.pullRequest;
	const checks: Check[] = pr.commits.nodes[0]?.commit.statusCheckRollup?.contexts.nodes ?? [];
	const failing = checks.filter(check => checkState(check) === 'failing');
	const pending = checks.filter(check => checkState(check) === 'pending');
	const passingCount = checks.length - failing.length - pending.length;

	const methods = [
		repository.squashMergeAllowed && 'squash',
		repository.mergeCommitAllowed && 'merge',
		repository.rebaseMergeAllowed && 'rebase',
	].filter(Boolean) as string[];

	const mergeSection = (
		<div className="rgh-pr-context-merge-actions">
			{pr.state === 'MERGED'
				? <strong className="rgh-pr-context-merged">Merged ✓</strong>
				: (pr.state === 'CLOSED'
					? <strong>Closed</strong>
					: (pr.isDraft
						? <strong>Draft — not mergeable yet</strong>
						: methods.map(method => (
							<button type="button" className="btn btn-sm">{method}</button>
						))))}
		</div>
	);

	if (pr.state === 'OPEN' && !pr.isDraft) {
		for (const [index, button] of [...mergeSection.querySelectorAll('button')].entries()) {
			button.addEventListener('click', () => {
				void merge(methods[index], mergeSection);
			});
		}
	}

	return (
		<div className="rgh-pr-context rgh-pr-context-mergebox">
			<div className="rgh-pr-context-comment-header">
				<strong>Merge box</strong>
				<span>
					{pr.reviewDecision === 'APPROVED' && 'Approved'}
					{pr.reviewDecision === 'CHANGES_REQUESTED' && 'Changes requested'}
					{pr.reviewDecision === 'REVIEW_REQUIRED' && 'Review required'}
				</span>
				<span>{pr.mergeable === 'CONFLICTING' ? 'Has conflicts' : ''}</span>
			</div>
			{failing.map(check => checkRow(check))}
			{pending.map(check => checkRow(check))}
			{checks.length > 0 && (
				<div className="rgh-pr-context-check rgh-pr-context-check-passing">
					<span>✓</span>
					<span>
						{failing.length === 0 && pending.length === 0
							? `All ${passingCount} checks passed`
							: `${passingCount} passing checks`}
					</span>
				</div>
			)}
			{mergeSection}
		</div>
	);
}

let bottomCard: HTMLElement | undefined;
let mergeCard: HTMLElement | undefined;

async function processDiff(diff: HTMLElement): Promise<void> {
	const parent = diff.parentElement;
	if (!parent) {
		return;
	}

	let repository;
	try {
		repository = await getContext();
	} catch {
		return; // Missing/invalid API token
	}

	const pr = repository.pullRequest;

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

	mergeCard ??= mergeBox(repository);
	parent.append(mergeCard);
}

function init(signal: AbortSignal): void {
	request = undefined;
	bottomCard = undefined;
	mergeCard = undefined;
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
