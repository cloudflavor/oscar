import { RouterHandler } from "@tsndr/cloudflare-worker-router";

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

export const sleep = (ms: number) => {
    return new Promise(resolve => setTimeout(resolve, ms));
};
