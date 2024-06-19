import { RouterHandler } from "@tsndr/cloudflare-worker-router";

export type Env = {
    GITHUB_APP_ID: string;
    GITHUB_CLIENT_ID: string;
    GITHUB_SECRET: string;
    GITHUB_WEBHOOK_SECRET: string;
    GITHUB_PRIVATE_KEY: string;

    OSCAR_ACCESS_CONFIG_URI: string;

    OSCAR_RATE_LIMITER: any;
};

export type Handler = RouterHandler<Env, ExecutionContext, Request>;

export const sleep = (ms: number) => {
    return new Promise(resolve => setTimeout(resolve, ms));
};