import { RouterHandler } from "@tsndr/cloudflare-worker-router";
import * as TOML from '@ltd/j-toml';

export type Env = {
    GITHUB_APP_ID: string;
    GITHUB_CLIENT_ID: string;
    GITHUB_SECRET: string;
    GITHUB_WEBHOOK_SECRET: string;
    GITHUB_PRIVATE_KEY: string;

    OSCAR_ACCESS_CONFIG_URI: string;
    OSCAR_RATE_LIMITER: any;
    OSCAR_PERMISSIONS_CONFIG: Config;
};

export type Handler = RouterHandler<Env, ExecutionContext, Request>;

export type Admin = {
    name: string;
};

export type Label = {
    name: string;
    description: string;
    color: string;
};

export type Config = {
    admin: Admin;
    labels: Label[];
    checkPermissions(user: string): boolean;
    checkLabels(labels: Label): boolean;
};

// NOTE: can't find this union type in the codebase for octokit
export type ReactionContent = '+1' | '-1' | 'laugh' | 'confused' | 'heart' | 'hooray' | 'rocket' | 'eyes';

const parseTomlConfig =
    async (uri: string): Promise<Config> => {
        try {
            const response = await fetch(uri);
            const parsedToml = TOML.parse(await response.text());
            if (parsedToml.admin === undefined) {
                throw new Error('undefined admin in toml file');
            }
            const admin = parsedToml.admin as Admin;
            if (!admin.name) {
                throw new Error('admin name is undefined in toml file');
            }
            const tomlLabels = parsedToml.Labels;
            if (!tomlLabels) {
                throw new Error('labels are not defined');
            }

            let labels: Label[] = [];

            for (const label of tomlLabels) {
                if (!label.name || !label.description || !label.color) {
                    console.log(`${label.name} is missing a field`);
                    continue;
                }
                if (label.color.length !== 7) {
                    console.log('label color is not valid');
                    continue;
                }

                labels.push(label as Label);
            }

            return {
                admin: { name: admin.name },
                labels,
                checkPermissions: (user: string) => admin.name === user,
                checkLabels: (label: Label) => tomlLabels.some(label => labels.includes(label)),
            };
        } catch (error: any) {
            throw new Error(`Error while parsing the config file: ${error.message}`);
        }
    };

const checkLabels = (labels: Label[], tomlLabels: string[]) => {
    return labels.some(label => labels.includes(label));
};

export { parseTomlConfig };

export const sleep = (ms: number) => {
    return new Promise(resolve => setTimeout(resolve, ms));
};
