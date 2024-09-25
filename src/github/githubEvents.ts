import { App, Octokit } from 'octokit';

import { Config, Env, parseTomlConfig, ReactionContent, Label } from '../common';
import { newCommandRegistry } from '../commands/github';



export const newApp = async (env: Env, installationId: number): Promise<App> => {
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
        throw new Error(`Error while authenticating: ${error.message}`);
    }

    const commandRegistry = newCommandRegistry();

    let config: Config;

    try {
        const resp = await parseTomlConfig(env.OSCAR_ACCESS_CONFIG_URI);
        config = resp;
    } catch (error: any) {
        throw new Error(`Error while parsing the config file: ${error.message}`);
    }

    app.webhooks.on('issues.opened', async ({ payload }) => {
        try {
            await addLabels(
                authApp,
                payload.repository.owner.login,
                payload.repository.name,
                payload.issue.number,
                ['needs-triage'],
                config.labels
            );

            if (payload.issue.body) {
                await commandRegistry.processCommand(
                    payload.issue.body,
                    authApp,
                    payload,
                    config,
                );
            }

            await authApp.rest.reactions.createForIssue({
                owner: payload.repository.owner.login,
                repo: payload.repository.name,
                issue_number: payload.issue.number,
                content: 'eyes',
            });
        } catch (error: any) {
            throw new Error(`Error while executing commands for issues.opened: ${error.message}`);
        }
    });



    // TODO: retrieve the ongoing check, update the status of it with the workflow_run status
    app.webhooks.on(['workflow_run.completed', 'workflow_run.in_progress', 'workflow_run.requested'], async ({ payload }) => {
        const owner = payload.repository.owner.login;
        const repo = payload.repository.name;
        const { workflow_run } = payload;

        await authApp.rest.repos.createCommitStatus({
            owner,
            repo,
            sha: workflow_run.head_sha,
            state: convertConclusionToState(workflow_run.conclusion as WorkflowRunStatus),
            target_url: workflow_run.html_url,
            description: workflow_run.status,
            context: workflow_run.name || 'Unknown workflow',
        });
    });

    app.webhooks.on(['pull_request.opened', 'pull_request.reopened'], async ({ payload }) => {
        let labels = ['needs-triage'];

        if (payload.pull_request.user.login === config.admin.name) {
            labels.push('ok-to-test');
        } else {
            labels.push('needs-ok-to-test');
        }

        try {
            await addLabels(
                authApp,
                payload.repository.owner.login,
                payload.repository.name,
                payload.pull_request.number,
                labels,
                config.labels
            );

            const reactions: ReactionContent[] = ['+1', 'rocket', 'heart'];

            for (const reaction of reactions) {
                await authApp.rest.reactions.createForIssue({
                    owner: payload.repository.owner.login,
                    repo: payload.repository.name,
                    issue_number: payload.pull_request.number,
                    content: reaction,
                });
            }

            if (payload.pull_request.body) {
                await commandRegistry.processCommand(
                    payload.pull_request.body,
                    authApp,
                    payload,
                    config
                );
            }

            const { data: { workflows } } = await authApp.rest.actions.listRepoWorkflows({
                owner: payload.repository.owner.login,
                repo: payload.repository.name,
            });

            for (const workflow of workflows) {
                try {
                    await authApp.rest.actions.createWorkflowDispatch({
                        owner: payload.repository.owner.login,
                        repo: payload.repository.name,
                        workflow_id: workflow.id,
                        ref: payload.pull_request.head.ref,
                    });

                    const { data: { workflow_runs } } = await authApp.rest.actions.listWorkflowRuns({
                        owner: payload.repository.owner.login,
                        status: 'in_progress',
                        repo: payload.repository.name,
                        workflow_id: workflow.id,
                        branch: payload.pull_request.head.ref,
                    });

                    for (const runningWorkflow of workflow_runs) {
                        await authApp.rest.repos.createCommitStatus({
                            owner: payload.repository.owner.login,
                            repo: payload.repository.name,
                            sha: payload.pull_request.head.sha,
                            state: convertConclusionToState(runningWorkflow.conclusion as WorkflowRunStatus),
                            target_url: runningWorkflow.html_url,
                            description: runningWorkflow.status,
                            context: workflow.name,
                        });
                    }
                } catch (error: any) {
                    console.log(`Error while rerunning workflow: ${error.message}`);
                }
            }
        } catch (error: any) {
            throw new Error(`Error while executing commands for pull_request.opened: ${error.message}`);
        }
    });


    app.webhooks.on(['issue_comment.created', 'issue_comment.edited'], async ({ payload }) => {
        const user = payload.comment.user?.login;
        if (!user) throw new Error('User is undefined');

        if (!config.checkPermissions(user)) {
            console.log('User does not have permission to run commands');
            return;
        }

        try {
            await commandRegistry.processCommand(
                payload.comment.body,
                authApp,
                payload,
                config
            );
        } catch (error: any) {
            throw new Error(`Error while processing command on issue_comment: ${error.message}`);
        }
    });

    app.webhooks.on('workflow_run.completed', async ({ payload }) => {
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
                    body: `The main branch workflow failed.Please check the logs and fix the issue. ${payload.workflow_run.html_url}`,
                });
                await addLabels(authApp, owner, repo, resp.data.number, ['kind/failing-test'], config.labels);
            } catch (error: any) {
                throw new Error(`Error while creating issue: ${error.message}`);
            }
        }
    });

    app.webhooks.on('pull_request.labeled', async ({ payload }) => {
        if (payload.label?.name === 'ok-to-test') {
            try {
                await authApp.rest.issues.removeLabel({
                    owner: payload.repository.owner.login,
                    repo: payload.repository.name,
                    issue_number: payload.pull_request.number,
                    name: 'needs-ok-to-test',
                });

            } catch (error: any) {
                console.log(`Error while removing label: ${error.message}`);
            }
        }
    });

    app.webhooks.on('pull_request.synchronize', async ({ payload }) => {
        console.log('Push event received:', payload);
    });

    return app;
};


async function addLabels(app: Octokit, owner: string, repo: string, issueNumber: number, labels: string[], configLabels: Label[]) {
    const validLabels = configLabels.filter(configLabel => labels.includes(configLabel.name));
    console.log(validLabels);

    if (validLabels.length === 0) {
        return;
    }

    const repoLabels = await app.rest.issues.listLabelsForRepo({ owner, repo });
    const existingRepoLabels = validLabels.filter(label =>
        repoLabels.data.some(repoLabel => repoLabel.name === label.name)
    );

    if (existingRepoLabels.length > 0) {
        for (const existingLabel of existingRepoLabels) {
            const label = configLabels.find(label => label.name === existingLabel.name);
            if (!label) {
                continue;
            }
            try {
                await app.rest.issues.updateLabel({
                    owner,
                    repo,
                    name: label.name,
                    color: label.color.replace(/^#/, ''),
                    description: label.description,
                });
            } catch (error: any) {
                throw new Error(`Error while updating labels: ${error.message}`);
            }
        }
    }

    const newLabels = validLabels.filter(label =>
        !existingRepoLabels.some(existingLabel => existingLabel.name === label.name)
    );
    console.log(newLabels);

    for (const label of newLabels) {
        try {
            await app.rest.issues.createLabel({
                owner,
                repo,
                name: label.name,
                color: label.color.replace(/^#/, ''),
                description: label.description,
            });
        } catch (error: any) {
            throw new Error(`Error while adding labels: ${error.message}`);
        }
    }

    try {
        await app.rest.issues.addLabels({
            owner,
            repo,
            issue_number: issueNumber,
            labels: validLabels.map(label => label.name),
        });
    } catch (error: any) {
        throw new Error(`Error while adding labels to issue: ${error.message}`);
    }
}

type WorkflowRunStatus = 'success' | 'failure' | 'cancelled' | 'action_required' | 'neutral' | 'skipped' | 'stale' | 'timed_out' | 'startup_failure' | null;

function convertConclusionToState(status: WorkflowRunStatus): "success" | "error" | "failure" | "pending" {
    switch (status) {
        case "success":
            return "success";
        case "failure":
            return "failure";
        case "cancelled":
        case "action_required":
        case "neutral":
        case "stale":
        case "timed_out":
        case "startup_failure":
            return "error";
        case "skipped":
            return "success";
        default:
            return "pending";
    }
}
export type { WorkflowRunStatus };

export { addLabels, convertConclusionToState };