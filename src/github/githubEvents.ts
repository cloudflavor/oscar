import { App, Octokit } from 'octokit';

import { Env } from '../common';

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

    app.webhooks.on('issues.opened', async ({ id, name, payload }) => {
        try {
            await addLabels(authApp, payload.repository.owner.login, payload.repository.name, payload.issue.number, ['needs-triage']);
        } catch (error: any) {
            console.error('Error while adding labels:', error.message);
        }
    });

    app.webhooks.on('pull_request.opened', async ({ id, name, payload }) => {
        try {
            await addLabels(authApp, payload.repository.owner.login, payload.repository.name, payload.pull_request.number, ['needs-triage']);
        } catch (error: any) {
            console.error('Error while adding labels:', error.message);
        }
    });

    return app;
}

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