import { RouterHandler } from "@tsndr/cloudflare-worker-router";

export type ExtReq = {};

export type ExtCtx = {};

export type Env = {
    OSCAR_TOKEN: string;
};

export type Handler = RouterHandler<Env, ExtCtx, ExtReq>;