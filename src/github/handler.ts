import { Webhooks } from '@octokit/webhooks';
import { Handler, Env, ExtReq, ExtCtx } from '../common';

const githubHandler: Handler = async (env: Env, ctx: ExtCtx, req: ExtReq) => {
    return Response.json({ message: 'Hello, GitHub!' });
}

async function checkGitHubToken(env: Env, req: Request): Promise<Boolean> {
    const signature = req.headers.get('x-hub-signature-256');
    if (!signature) {
        return false
    }

    const webhooks = new Webhooks({ secret: env.OSCAR_TOKEN });

    try {
        const body = await req.text();
        const resp = await webhooks.verify(body, signature);
        if (!resp) {
            return false;
        }
    } catch (error) {
        console.error(`Error while reading request body: ${error}`);
        return false;
    }

    return true;
};

export { githubHandler, checkGitHubToken };
