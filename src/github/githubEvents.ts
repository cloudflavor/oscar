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

    const authApp = await app.getInstallationOctokit(installationId);

    app.webhooks.on('issues.opened', async ({ id, name, payload }) => {
        try {
            await checkIfLabelsExist(authApp, payload.repository.owner.login, payload.repository.name, ['needs-triage']);

            await authApp.rest.issues.addLabels({
                owner: payload.repository.owner.login,
                repo: payload.repository.name,
                issue_number: payload.issue.number,
                labels: ['needs-triage']
            });
        } catch (error: any) {
            console.error('Error:', error.message);
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