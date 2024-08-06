import { Handler } from '../common';
import { newApp } from './githubEvents';


const githubHandler: Handler =
    async ({ env, req, ctx }): Promise<Response> => {
        try {
            const payload = await req.text();
            const { installation } = JSON.parse(payload);
            const app =
                await newApp(env, installation.id);
            if (!app) {
                console.log('Error while creating new app, undefined');
                return new Response('Internal error', { status: 500 });
            }

            const id = req.headers.get('x-github-delivery') || '';
            const event = req.headers.get('x-github-event') || '';
            const signature = req.headers.get('x-hub-signature-256') || '';

            await app.webhooks.verifyAndReceive({
                id,
                name: event as any,
                payload,
                signature,
            });
        } catch (error: any) {
            console.error('Error in GitHub handler:', error.message);
            return new Response('Error while processing the request', { status: 500 });
        }

        return new Response('OK', { status: 200 });
    };

export { githubHandler };
