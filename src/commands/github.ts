import { Octokit } from 'octokit';

import { sleep } from '../common';


class CommandRegistry {
    private handlers: { [key: string]: (command: string, app: Octokit, payload: any) => Promise<void>; } = {};

    registerCommand(
        commandPrefix: string,
        handler: (command: string, app: Octokit, payload: any)
            => Promise<void>) {
        this.handlers[commandPrefix] = handler;
    }

    async processCommand(command: string, app: Octokit, payload: any): Promise<boolean> {
        const commands = command.split('\n').map(c => c.trim().replace(/\r/g, '')).filter(c => c !== '');

        for (const command of commands) {
            if (!command.startsWith('/')) {
                console.log('Invalid command:', command);
                continue;
            }

            const commandPrefix =
                Object.keys(this.handlers).find(prefix => command.startsWith(prefix));

            if (commandPrefix) {
                try {
                    await this.handlers[commandPrefix](command, app, payload);
                } catch (error: any) {
                    console.error(`Error while processing command: ${command}`, error.message);
                }
            } else {
                console.log(`No handler found for command: ${command}`);
            }

            await sleep(1000);
        }
        return true;
    }
}

function newCommandRegistry(): CommandRegistry {
    const commandRegistry = new CommandRegistry();

    // Command handlers for workflow actions and jobs
    commandRegistry.registerCommand('/restart-workflow', handleRestartWorkflowCommand);
    commandRegistry.registerCommand('/stop-workflow', handleStopWorkflowCommand);
    commandRegistry.registerCommand('/cancel-workflow', handleCancelWorkflowCommand);
    commandRegistry.registerCommand('/restart-job', handleRestartWorkflowJobCommand);

    // Command handlers for issues and pull requests
    commandRegistry.registerCommand('/label', handleLabelCommand);
    commandRegistry.registerCommand('/label-remove', handleLabelRemoveCommand);
    commandRegistry.registerCommand('/assign', handleAssigneesCommand);
    commandRegistry.registerCommand('/triage', handleTriageCommand);
    commandRegistry.registerCommand('/unassign', handleUnassigneesCommand);
    commandRegistry.registerCommand('/lock', handleIssueLockCommand);
    commandRegistry.registerCommand('/unlock', handleIssueUnlockCommand);
    commandRegistry.registerCommand('/milestone', handleMilestoneCommand);
    commandRegistry.registerCommand('/pin', handleIssuePin);
    commandRegistry.registerCommand('/unpin', handleIssueUnpin);

    commandRegistry.registerCommand('/close', handleCloseCommand);
    commandRegistry.registerCommand('/reviewers', handleReviewersCommand);
    commandRegistry.registerCommand('/reopen', handleReopenCommand);
    commandRegistry.registerCommand('/merge', handlePrMergeCommand);
    commandRegistry.registerCommand('/retitle', handleRetitleCommand);
    commandRegistry.registerCommand('/hold', handlePrHoldCommand);
    commandRegistry.registerCommand('/unhold', handleUnholdCommand);
    commandRegistry.registerCommand('/draft', handlePrDraftCommand);
    commandRegistry.registerCommand('/approve', handlePrApproveCommand);
    commandRegistry.registerCommand('/unapprove', handlePrUnapproveCommand);


    return commandRegistry;
}

async function handleLabelCommand(command: string, app: Octokit, payload: any): Promise<void> {
    const match = command.match(/^\/label(?:\s+(.*))?$/);
    const labelsStr = match ? (match[1] || '').trim() : '';
    const labels = labelsStr ? labelsStr.split(' ').map(label => label.trim()) : [];


    const issue_number = payload.issue?.number ? payload.issue.number : payload.pull_request?.number;

    if (labels.length > 0) {
        await app.rest.issues.addLabels({
            owner: payload.repository.owner.login,
            repo: payload.repository.name,
            issue_number,
            labels,
        });

        console.log(`Added labels "${labels.join(', ')}" to issue #${issue_number}`);
    } else {
        await app.rest.issues.removeAllLabels({
            owner: payload.repository.owner.login,
            repo: payload.repository.name,
            issue_number,
        });
        console.log(`Cleared all labels from issue #${issue_number}`);
    }
}

async function handleLabelRemoveCommand(command: string, app: Octokit, payload: any): Promise<void> {
    const match = command.match(/^\/label-remove(?:\s+(.*))?$/);
    const label = match ? (match[1] || '').trim() : '';


    const issue_number = payload.issue?.number ? payload.issue.number : payload.pull_request?.number;

    await app.rest.issues.removeLabel({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        issue_number,
        name: label,
    });
}

async function handleTriageCommand(command: string, app: Octokit, payload: any): Promise<void> {

    const issue_number = payload.issue?.number ? payload.issue.number : payload.pull_request?.number;

    await app.rest.issues.removeLabel({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        issue_number,
        name: 'needs-triage',
    });

    await app.rest.issues.addLabels({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        issue_number,
        labels: ['triage/accepted'],
    });

    console.log(`Added "needs-triage" label to issue #${issue_number}`);
}

async function handleRestartWorkflowCommand(command: string, app: Octokit, payload: any): Promise<void> {
    const actionId = command.slice('/restart-workflow'.length).trim();
    const pullNumber = payload.issue?.number ? payload.issue.number : payload.pull_request?.number;

    const pullRequest = await app.rest.pulls.get({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        pull_number: pullNumber,
    });

    const actions = await app.rest.actions.listWorkflowRunsForRepo({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        workflow_id: 'rust.yml',
        status: 'completed',
        branch: pullRequest.data.head.ref,
    });

    const lastAction = actions.data.workflow_runs[0];
    if (!lastAction) {
        console.log(`No action found for the pull request #${pullNumber}`);
        return;
    }
    await app.rest.actions.reRunWorkflow({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        run_id: lastAction.id,
    });

    await app.rest.issues.createComment({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        issue_number: pullNumber,
        body: `Restarted worflow: ["${lastAction.name}"](${lastAction.html_url})`,
    });
}

async function handleStopWorkflowCommand(command: string, app: Octokit, payload: any): Promise<void> {
    const actionId = command.slice('/stop-workflow'.length).trim();
    const pullNumber = payload.issue?.number ? payload.issue.number : payload.pull_request?.number;

    const pullRequest = await app.rest.pulls.get({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        pull_number: pullNumber,
    });

    const actions = await app.rest.actions.listWorkflowRunsForRepo({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        workflow_id: 'rust.yml',
        status: 'in_progress',
        branch: pullRequest.data.head.ref,
    });

    const lastAction = actions.data.workflow_runs[0];
    if (!lastAction) {
        console.log(`No action found for the pull request #${payload.issue.number}`);
        return;
    }
    await app.rest.actions.cancelWorkflowRun({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        run_id: lastAction.id,
    });

    await app.rest.issues.createComment({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        issue_number: pullNumber,
        body: `Stopped worflow: ["${lastAction.name}"](${lastAction.html_url})`,
    });
}


async function handleCancelWorkflowCommand(command: string, app: Octokit, payload: any): Promise<void> {
    const actionId = command.slice('/cancel-workflow'.length).trim();
    const pullNumber = payload.issue?.number ? payload.issue.number : payload.pull_request?.number;

    const pullRequest = await app.rest.pulls.get({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        pull_number: pullNumber,
    });

    const actions = await app.rest.actions.listWorkflowRunsForRepo({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        workflow_id: 'rust.yml',
        status: 'in_progress',
        branch: pullRequest.data.head.ref,
    });

    const lastAction = actions.data.workflow_runs[0];
    if (!lastAction) {
        console.log(`No action found for the pull request #${payload.issue.number}`);
        return;
    }

    await app.rest.actions.forceCancelWorkflowRun({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        run_id: lastAction.id,
    });

    await app.rest.issues.createComment({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        issue_number: pullNumber,
        body: `Force canceled workflow: ["${lastAction.name}"](${lastAction.html_url})`,
    });
}


async function handleRestartWorkflowJobCommand(command: string, app: Octokit, payload: any): Promise<void> {
    const match = command.match(/^\/restart-job(?:\s+(.*))?$/);
    const jobCommand = match ? (match[1] || '').trim() : '';
    const [workflowName, jobName] = jobCommand.split(' ');
    const pullNumber = payload.issue?.number ? payload.issue.number : payload.pull_request?.number;

    if (jobName) {
        const pullRequest = await app.rest.pulls.get({
            owner: payload.repository.owner.login,
            repo: payload.repository.name,
            pull_number: pullNumber,
        });

        const workflow = await app.rest.actions.listWorkflowRunsForRepo({
            owner: payload.repository.owner.login,
            repo: payload.repository.name,
            workflow_id: workflowName,
            branch: pullRequest.data.head.ref,
        });
        const workflowId = workflow.data.workflow_runs[0].id;

        const jobs = await app.rest.actions.listJobsForWorkflowRun({
            owner: payload.repository.owner.login,
            repo: payload.repository.name,
            run_id: workflow.data.workflow_runs[0].id,
        });

        const job = jobs.data.jobs.find(j => j.name === jobName);

        if (!job) {
            console.log(`No job found for the pull request #${pullNumber}`);
            return;
        }

        await app.rest.actions.reRunJobForWorkflowRun({
            owner: payload.repository.owner.login,
            repo: payload.repository.name,
            job_id: job.id,
        });

        await app.rest.issues.createComment({
            owner: payload.repository.owner.login,
            repo: payload.repository.name,
            issue_number: pullNumber,
            body: `Restarted job: ${job.name} for workflow: ${workflowName}`,
        });
    } else {
        console.log(`No job name specified in the command: ${command}`);
    }
}

async function handleRetitleCommand(command: string, app: Octokit, payload: any): Promise<void> {
    const match = command.match(/^\/retitle(?:\s+(.*))?$/);
    const title = match ? (match[1] || '').trim() : '';
    const issueNumber = payload.issue?.number ? payload.issue.number : payload.pull_request?.number;

    if (title) {
        await app.rest.issues.update({
            owner: payload.repository.owner.login,
            repo: payload.repository.name,
            issue_number: issueNumber,
            title,
        });

        console.log(`Retitled issue #${payload.issue.number} to "${title}"`);
    } else {
        console.log(`No title specified in the command: ${command}`);
    }
}

async function handleAssigneesCommand(command: string, app: Octokit, payload: any) {
    const match = command.match(/^\/assign(?:\s+(.*))?$/) || '';
    let assignees: string[] = [];

    if (match[1]) {
        const assigneesStr = match ? match[1].trim() : '';
        assignees = assigneesStr ? assigneesStr.split(' ').map(assignee => assignee.trim().replace(/^@/, '')) : [];
    } else {
        assignees = [payload.sender.login];
    }

    const issueNumber = payload.issue?.number ? payload.issue.number : payload.pull_request?.number;

    try {
        await app.rest.issues.addAssignees({
            owner: payload.repository.owner.login,
            repo: payload.repository.name,
            issue_number: issueNumber,
            assignees,
        });
    } catch (error: any) {
        console.log(`Failed to assign issue #${issueNumber} to ${assignees.join(', ')} due to: ${error.message}`);
    }

    console.log(`Assigning issue #${issueNumber} to ${assignees.join(', ')}`);
}

async function handleUnassigneesCommand(command: string, app: Octokit, payload: any) {
    const user = payload.comment.user.login;
    const issueNumber = payload.issue?.number ? payload.issue.number : payload.pull_request?.number;

    await app.rest.issues.removeAssignees({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        issue_number: issueNumber,
        assignees: [user],
    });

    console.log(`Unassigned issue #${issueNumber} from ${user}`);
}

async function handleReopenCommand(command: string, app: Octokit, payload: any) {
    const issueNumber = payload.issue?.number ? payload.issue.number : payload.pull_request?.number;

    await app.rest.issues.update({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        issue_number: issueNumber,
        state: 'open',
    });

    console.log(`Reopened issue #${issueNumber}`);
}

async function handleCloseCommand(command: string, app: Octokit, payload: any) {
    const issueNumber = payload.issue?.number ? payload.issue.number : payload.pull_request?.number;
    await app.rest.issues.update({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        issue_number: issueNumber,
        state: 'closed',
    });

    console.log(`Closed issue #${issueNumber}`);
}

async function handlePrHoldCommand(command: string, app: Octokit, payload: any) {
    const issueNumber = payload.issue?.number ? payload.issue.number : payload.pull_request?.number;
    await app.rest.issues.addLabels({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        issue_number: issueNumber,
        labels: ['do-not-merge'],
    });
}

async function handleUnholdCommand(command: string, app: Octokit, payload: any) {
    const issueNumber = payload.issue?.number ? payload.issue.number : payload.pull_request?.number;
    await app.rest.issues.removeLabel({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        issue_number: issueNumber,
        name: 'do-not-merge',
    });
}


async function handlePrMergeCommand(command: string, app: Octokit, payload: any) {
    const match = command.match(/^\/merge(?:\s+(.*))?$/);
    const override = match?.[1]?.trim() || '';
    const issueNumber = payload.issue?.number ? payload.issue.number : payload.pull_request?.number;

    // TODO: Force should only be allowed for specific users, admins more specifically.
    if (override === 'force') {
        console.log(`Force merging pull request #${issueNumber}`);

        await app.rest.issues.createComment({
            owner: payload.repository.owner.login,
            repo: payload.repository.name,
            issue_number: issueNumber,
            body: 'Force merging pull request',
        });

        await app.rest.pulls.merge({
            owner: payload.repository.owner.login,
            repo: payload.repository.name,
            pull_number: issueNumber,
        });
        return;
    }

    const labels = await app.rest.issues.listLabelsOnIssue({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        issue_number: issueNumber,
    });

    if (labels.data.some(label => label.name === 'do-not-merge')) {
        console.log(`Skipping merge for pull request #${issueNumber} due to "do-not-merge" label`);
        await app.rest.issues.createComment({
            owner: payload.repository.owner.login,
            repo: payload.repository.name,
            issue_number: issueNumber,
            body: 'Skipping merge due to "do-not-merge" label',
        });
        return;
    }

    if (!labels.data.some(label => label.name === 'approved')) {
        console.log(`Skipping merge for pull request #${issueNumber} due to missing "approved" label`);
        await app.rest.issues.createComment({
            owner: payload.repository.owner.login,
            repo: payload.repository.name,
            issue_number: issueNumber,
            body: 'Skipping merge due to missing "approved" label',
        });
        return;
    }

    const pullRequest = await app.rest.pulls.get({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        pull_number: issueNumber,
    });

    if (pullRequest.data.merged) {
        console.log(`Skipping merge for pull request #${payload.issue.number} due to already merged`);
        await app.rest.issues.createComment({
            owner: payload.repository.owner.login,
            repo: payload.repository.name,
            issue_number: issueNumber,
            body: 'Skipping merge due to already merged',
        });
        return;
    }

    const jobs = await app.rest.checks.listForRef({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        ref: pullRequest.data.head.sha,
    });

    for (const job of jobs.data.check_runs) {
        switch (job.status) {
            case 'queued':
            case 'pending':
            case 'requested':
            case 'waiting':
            case 'in_progress':
                console.log(`Skipping merge for pull request #${issueNumber} due to pending checks`);
                await app.rest.issues.createComment({
                    owner: payload.repository.owner.login,
                    repo: payload.repository.name,
                    issue_number: issueNumber,
                    body: 'Skipping merge due to pending checks',
                });
                return;
            case 'completed':
                if (job.conclusion === 'failure') {
                    console.log(`Skipping merge for pull request #${issueNumber} due to failed checks`);
                    await app.rest.issues.createComment({
                        owner: payload.repository.owner.login,
                        repo: payload.repository.name,
                        issue_number: issueNumber,
                        body: 'Merge not possible due to failed checks',
                    });
                    return;
                }
                break;
        }
    }

    if (pullRequest.data.draft) {
        console.log(`Skipping merge for pull request #${issueNumber} due to draft status`);
        await app.rest.issues.createComment({
            owner: payload.repository.owner.login,
            repo: payload.repository.name,
            issue_number: issueNumber,
            body: 'Skipping merge due to draft status',
        });
        return;
    }

    if (pullRequest.data.mergeable === false) {
        console.log(`Skipping merge for pull request #${issueNumber} due to conflicts`);
        await app.rest.issues.createComment({
            owner: payload.repository.owner.login,
            repo: payload.repository.name,
            issue_number: issueNumber,
            body: 'Skipping merge due to conflicts',
        });
        return;
    }

    await app.rest.pulls.merge({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        pull_number: issueNumber,
    });

    console.log(`Merged pull request #${issueNumber}`);
}

async function handlePrDraftCommand(command: string, app: Octokit, payload: any) {
    const pullNumber = payload.issue?.number ? payload.issue.number : payload.pull_request?.number;
    await app.rest.pulls.update({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        pull_number: pullNumber,
        draft: true,
    });

    console.log(`Marked pull request #${payload.issue.number} as draft`);
}

async function handlePrApproveCommand(command: string, app: Octokit, payload: any) {
    const issueNumber = payload.issue?.number ? payload.issue.number : payload.pull_request?.number;
    await app.rest.issues.addLabels({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        issue_number: issueNumber,
        labels: ['approved'],
    });

    console.log(`Approved pull request #${issueNumber}`);
}

async function handlePrUnapproveCommand(command: string, app: Octokit, payload: any) {
    const pullNumber = payload.issue?.number ? payload.issue.number : payload.pull_request?.number;
    await app.rest.pulls.createReview({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        pull_number: pullNumber,
    });

    await app.rest.issues.removeLabel({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        issue_number: pullNumber,
        name: 'approved',
    });

    console.log(`Unapproved pull request #${pullNumber}`);
}

async function handleIssueLockCommand(command: string, app: Octokit, payload: any): Promise<void> {
    // TODO: should be limited to admins
    const issueNumber = payload.issue?.number ? payload.issue.number : payload.pull_request?.number;
    await app.rest.issues.lock({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        issue_number: issueNumber,
    });

    console.log(`Locked issue #${issueNumber}`);
}

async function handleIssueUnlockCommand(command: string, app: Octokit, payload: any): Promise<void> {
    const issueNumber = payload.issue?.number ? payload.issue.number : payload.pull_request?.number;
    // TODO: should be limited to admins
    await app.rest.issues.unlock({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        issue_number: issueNumber,
    });

    console.log(`Unlocked issue #${issueNumber}`);
}

async function handleMilestoneCommand(command: string, app: Octokit, payload: any): Promise<void> {
    const match = command.match(/^\/milestone(?:\s+(.*))?$/);
    const milestone = match ? (match[1] || '').trim() : '';
    const issueNumber = payload.issue?.number ? payload.issue.number : payload.pull_request?.number;

    if (milestone === 'clear') {
        await app.rest.issues.update({
            owner: payload.repository.owner.login,
            repo: payload.repository.name,
            issue_number: issueNumber,
            milestone: null,
        });

        console.log(`Cleared milestone for issue #${payload.issue.number}`);
        return;
    }

    if (milestone) {
        const milestones = await app.rest.issues.listMilestones({
            owner: payload.repository.owner.login,
            repo: payload.repository.name,
        });

        const milestoneId = milestones.data.find(m => m.title === milestone)?.number;
        if (!milestoneId) {
            console.log(`No milestone found for the title: ${milestone}`);
            return;
        }

        await app.rest.issues.update({
            owner: payload.repository.owner.login,
            repo: payload.repository.name,
            issue_number: issueNumber,
            milestone: milestoneId,
        });
        console.log(`Set milestone for issue #${issueNumber} to ${milestone}`);
    } else {
        console.log(`No milestone specified in the command: ${command}`);
    }
}

async function handleIssuePin(command: string, app: Octokit, payload: any): Promise<void> {
    // NOTE: seems that rest does not have a valid way to update the pinned status of an issue
    const issueId = payload.issue.node_id;
    const mutation = `
      mutation($issueId: ID!) {
        pinIssue(input: { issueId: $issueId }) {
          issue {
            id
          }
        }
      }
    `;

    await app.graphql(mutation, {
        issueId: payload.issue.node_id,
    });

    console.log(`Pinned issue #${payload.issue.number}`);
}

async function handleIssueUnpin(command: string, app: Octokit, payload: any): Promise<void> {
    // NOTE: seems that rest does not have a valid way to update the pinned status of an issue
    const issueId = payload.issue.node_id;
    const mutation = `
      mutation($issueId: ID!) {
        unpinIssue(input: { issueId: $issueId }) {
          issue {
            id
          }
        }
      }
    `;

    await app.graphql(mutation, {
        issueId: payload.issue.node_id,
    });

    console.log(`Unpinned issue #${payload.issue.number}`);
}

async function handleReviewersCommand(command: string, app: Octokit, payload: any): Promise<void> {
    const match = command.match(/^\/reviewers(?:\s+(.*))?$/);
    const reviewersStr = match ? match[1].trim() : '';
    const reviewers = reviewersStr ? reviewersStr.split(' ').map(reviewer => reviewer.trim().replace(/^@/, '')) : [];
    const issueNumber = payload.issue?.number ? payload.issue.number : payload.pull_request?.number;

    await app.rest.pulls.requestReviewers({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        pull_number: issueNumber,
        reviewers,
    });

    console.log(`Request review for pull request #${issueNumber} from ${reviewers.join(', ')}`);
}

export { newCommandRegistry };