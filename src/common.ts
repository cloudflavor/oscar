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

export type Config = {
    admin: {
        name: string;
    },

    checkPermissions(user: string): boolean;
};

// NOTE: can't find this union type in the codebase for octokit
export type ReactionContent = '+1' | '-1' | 'laugh' | 'confused' | 'heart' | 'hooray' | 'rocket' | 'eyes';

const parseTomlConfig =
    async (uri: string): Promise<Config | undefined> => {
        const response = await fetch(uri);
        const parsedToml = TOML.parse(await response.text());
        // TODO: This would need to be addressed in the new version of the 
        // permissions config file.
        const admin = parsedToml.admin;
        if (!admin || !admin.name) {
            throw new Error('Error while parsing the config file, config file is invalid');
        }
        return {
            admin: { name: admin.name },
            checkPermissions: (user: string) => admin.name === user,
        };
    };

export { parseTomlConfig };

export const sleep = (ms: number) => {
    return new Promise(resolve => setTimeout(resolve, ms));
};
