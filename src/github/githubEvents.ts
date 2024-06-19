import { App, Octokit } from 'octokit';

import { Env } from '../common';
import { newCommandRegistry } from '../commands/github';


export default async (env: Env, installationId: number): Promise<App> => {
    const app = new App({
        appId: env.GITHUB_APP_ID,
        privateKey: atob(env.GITHUB_PRIVATE_KEY),
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_SECRET,
        webhooks: {
            secret: env.GITHUB_WEBHOOK_SECRET,
        },
    });

    let authApp: Octokit;

    try {
        authApp = await app.getInstallationOctokit(installationId);
    } catch (error: any) {
        console.error('Error while authenticating:', error.message);
    }

    const commandRegistry = newCommandRegistry();

    app.webhooks.on('issues.opened', async ({ payload }) => {
        try {
            await addLabels(authApp, payload.repository.owner.login, payload.repository.name, payload.issue.number, ['needs-triage']);
        } catch (error: any) {
            console.error('Error while adding labels:', error.message);
        }
    });

    app.webhooks.on('pull_request.opened', async ({ payload }) => {
        try {
            await addLabels(authApp, payload.repository.owner.login, payload.repository.name, payload.pull_request.number, ['needs-triage']);
            authApp.rest.reactions.createForIssueComment({
                owner: payload.repository.owner.login,
                repo: payload.repository.name,
                comment_id: payload.pull_request.id,
                content: '+1',
            });
        } catch (error: any) {
            console.error('Error while adding labels:', error.message);
        }
    });

    app.webhooks.on('issue_comment', async ({ payload }) => {
        if (!payload.comment.body.startsWith('/')) {
            return;
        }

        try {
            const resp =
                await commandRegistry.processCommand(
                    payload.comment.body,
                    authApp,
                    payload,
                );

            if (!resp) {
                await authApp.rest.issues.createComment({
                    owner: payload.repository.owner.login,
                    repo: payload.repository.name,
                    issue_number: payload.issue.number,
                    body: "Can't say I understand that command. 🤔",
                });
            }

        } catch (error: any) {
            console.error('Error while processing command on issue_comment:', error.message);
        }
    });

    app.webhooks.on('workflow_run', async ({ payload }) => {
        const repo = authApp.rest.repos.get({
            owner: payload.repository.owner.login,
            repo: payload.repository.name,
        });

        if (payload.workflow_run.conclusion === 'failure' && payload.workflow_run.head_branch === 'main') {
            // TODO: need to just update the issues instead of creating a new one every
            // time.
            // Otherwise it will create an issue for all of the failed runs.
            try {
                const resp = await authApp.rest.issues.create({
                    owner: payload.repository.owner.login,
                    repo: payload.repository.name,
                    title: 'Workflow failed',
                    body: `The main branch workflow failed. Please check the logs and fix the issue. ${payload.workflow_run.html_url}`,
                });
                await addLabels(authApp, payload.repository.owner.login, payload.repository.name, resp.data.number, ['ci-failure']);
            } catch (error: any) {
                console.error('Error while creating issue:', error.message);
            }
        }
    });


    return app;
};


async function checkIfLabelsExist(authApp: Octokit, owner: string, repo: string, labels: string[]): Promise<void> {
    const existingLabels = await authApp.rest.issues.listLabelsForRepo({
        owner,
        repo,
    });

    for (const label of labels) {
        if (!existingLabels.data.some(l => l.name === label)) {
            await authApp.rest.issues.createLabel({
                owner,
                repo,
                name: label,
                color: '000000',
            });
        }
    }
}

async function addLabels(app: Octokit, owner: string, repo: string, issue_number: number, labels: string[]) {
    await checkIfLabelsExist(app, owner, repo, labels);

    await app.rest.issues.addLabels({
        owner,
        repo,
        issue_number,
        labels,
    });
}
