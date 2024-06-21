import { App, Octokit } from 'octokit';

import { Config, Env, parseTomlConfig } from '../common';
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

    let config: Config;

    try {
        const resp = await parseTomlConfig(env.OSCAR_ACCESS_CONFIG_URI);
        if (!resp) {
            throw new Error('Error while parsing the config file');
        }
        config = resp;
    } catch (error: any) {
        console.error('Error while parsing the config file:', error.message);
    }


    app.webhooks.on('issues.opened', async ({ payload }) => {
        try {
            await addLabels(
                authApp,
                payload.repository.owner.login,
                payload.repository.name,
                payload.issue.number,
                ['needs-triage'],
            );
        } catch (error: any) {
            console.error('Error while adding labels:', error.message);
        }
    });

    app.webhooks.on('pull_request.opened', async ({ payload }) => {
        try {
            await addLabels(
                authApp,
                payload.repository.owner.login,
                payload.repository.name,
                payload.pull_request.number,
                ['needs-triage']
            );
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

    const handleComment = async (payload: any) => {
        // NOTE: This should be an error if there's no user.
        const user = payload.comment.user?.login;
        if (!user) {
            return;
        }

        if (!config.checkPermissions(user)) {
            console.log('User does not have permissions:', user);
            return;
        }

        try {
            await commandRegistry.processCommand(
                payload.comment.body,
                authApp,
                payload,
            );
        } catch (error: any) {
            console.error('Error while processing command on issue_comment:', error.message);
        }
    };

    app.webhooks.on('issue_comment.created', async ({ payload }) => {
        await handleComment(payload);
    });

    app.webhooks.on('issue_comment.edited', async ({ payload }) => {
        await handleComment(payload);
    });

    app.webhooks.on('workflow_run', async ({ payload }) => {
        const owner = payload.repository.owner.login;
        const repo = payload.repository.name;
        const mainBranch = payload.repository.default_branch;
        const workflowRun = payload.workflow_run;

        if (
            workflowRun.conclusion === 'failure' &&
            workflowRun.head_branch === mainBranch
        ) {
            // TODO: need to just update the issues instead of creating a new one every
            // time.
            // Otherwise it will create an issue for all of the failed runs.
            try {
                const resp = await authApp.rest.issues.create({
                    owner,
                    repo,
                    title: 'Workflow failed',
                    body: `The main branch workflow failed. Please check the logs and fix the issue. ${payload.workflow_run.html_url}`,
                });
                await addLabels(authApp, owner, repo, resp.data.number, ['ci-failure']);
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
