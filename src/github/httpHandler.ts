import { Handler } from '../common';
import githubEvents from './githubEvents';


const githubHandler: Handler =
    async ({ env, req, ctx }): Promise<Response> => {
        try {
            const payload = await req.text();
            const { installation } = JSON.parse(payload);
            const app =
                await githubEvents(env, installation.id);

            const id = req.headers.get('x-github-delivery') || '';
            const event = req.headers.get('x-github-event') || '';
            const sig = req.headers.get('x-hub-signature-256') || '';

            await app.webhooks.verifyAndReceive({
                id,
                name: event as any,
                payload,
                signature: sig,
            });
        } catch (error: any) {
            console.error('Error:', error.message);
            return new Response('Error while processing the request', { status: 500 });
        }

        return new Response('OK', { status: 200 });
    };

export { githubHandler };
