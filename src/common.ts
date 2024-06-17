import { RouterHandler } from "@tsndr/cloudflare-worker-router";

export type Env = {
    GITHUB_TOKEN: string;
    GITHUB_APP_ID: string;
    GITHUB_CLIENT_ID: string;
    GITHUB_SECRET: string;
    GITHUB_WEBHOOK_SECRET: string;
    GITHUB_PRIVATE_KEY: string;
};

export type Handler = RouterHandler<Env, ExecutionContext, Request>;