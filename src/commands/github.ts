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
            const commandPrefix =
                Object.keys(this.handlers).find(prefix => command.startsWith(prefix));

            if (commandPrefix) {
                await this.handlers[commandPrefix](command, app, payload);
            } else {
                console.log(`No handler found for command: ${command}`);
            }

            await sleep(5000);
        }
        return true;
    }
}

function newCommandRegistry(): CommandRegistry {
    const commandRegistry = new CommandRegistry();

    commandRegistry.registerCommand('/label', handleLabelCommand);
    commandRegistry.registerCommand('/restart-action', handleRestartActionCommand);
    commandRegistry.registerCommand('/reviewers', handleReviewersCommand);
    commandRegistry.registerCommand('/assign', handleAssigneesCommand);
    commandRegistry.registerCommand('/triage', handleTriageCommand);
    commandRegistry.registerCommand('/unassign', handleUnassigneesCommand);

    return commandRegistry;
}

async function handleLabelCommand(command: string, app: Octokit, payload: any): Promise<void> {
    const match = command.match(/^\/label(?:\s+(.*))?$/);
    const labelsStr = match ? (match[1] || '').trim() : '';
    const labels = labelsStr ? labelsStr.split(' ').map(label => label.trim()) : [];

    if (labels.length > 0) {
        await app.rest.issues.addLabels({
            owner: payload.repository.owner.login,
            repo: payload.repository.name,
            issue_number: payload.issue.number,
            labels
        });

        console.log(`Added labels "${labels.join(', ')}" to issue #${payload.issue.number}`);
    } else {
        await app.rest.issues.removeAllLabels({
            owner: payload.repository.owner.login,
            repo: payload.repository.name,
            issue_number: payload.issue.number
        });
        console.log('cleared all labels');
    }
}

async function handleTriageCommand(command: string, app: Octokit, payload: any): Promise<void> {
    await app.rest.issues.removeLabel({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        issue_number: payload.issue.number,
        name: 'needs-triage',
    });

    console.log(`Added "needs-triage" label to issue #${payload.issue.number}`);
}

async function handleRestartActionCommand(command: string, app: Octokit, payload: any): Promise<void> {
    const actionId = command.slice('/restart-action'.length).trim();

    if (actionId) {
        // Logic to restart the action with the given ID
        console.log(`Restarting action with ID "${actionId}"`);
        // Insert your logic to restart the action here
    } else {
        console.log(`No action ID specified in the command: ${command}`);
    }
}

async function handleAssigneesCommand(command: string, app: Octokit, payload: any) {
    const match = command.match(/^\/assign(?:\s+(.*))?$/);
    const assigneesStr = match ? match[1].trim() : '';
    const assignees = assigneesStr ? assigneesStr.split(' ').map(assignee => assignee.trim().replace(/^@/, '')) : [];

    await app.rest.issues.addAssignees({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        issue_number: payload.issue.number,
        assignees,
    });

    console.log(`Assigning issue #${payload.issue.number} to ${assignees.join(', ')}`);
}

async function handleUnassigneesCommand(command: string, app: Octokit, payload: any) {
    const user = payload.comment.user.login;

    await app.rest.issues.removeAssignees({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        issue_number: payload.issue.number,
        assignees: [user],
    });

    console.log(`Unassigned issue #${payload.issue.number} from ${user}`);
}

async function handleReviewersCommand(command: string, app: Octokit, payload: any): Promise<void> {
    const match = command.match(/^\/reviewers(?:\s+(.*))?$/);
    const reviewersStr = match ? match[1].trim() : '';
    const reviewers = reviewersStr ? reviewersStr.split(' ').map(reviewer => reviewer.trim().replace(/^@/, '')) : [];

    await app.rest.pulls.requestReviewers({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        pull_number: payload.issue.number,
        reviewers,
    });

    console.log(`Request review for pull request #${payload.issue.number} from ${reviewers.join(', ')}`);
}

export { newCommandRegistry };