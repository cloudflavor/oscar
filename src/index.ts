import { Router } from '@tsndr/cloudflare-worker-router';
import pino from 'pino';

import { githubHandler } from './github/httpHandler';
import { Env } from './common';

const router = new Router<Env, ExecutionContext, Request>();

const logger = pino(
	{ level: 'info' },
);

router.debug();

router.post('/webhooks/github', githubHandler);

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const { pathname } = new URL(request.url);
		const { success } = await env.OSCAR_RATE_LIMITER.limit({ key: pathname });

		if (!success) {
			return new Response(`429 Failure – rate limit exceeded for ${pathname}`, { status: 429 });
		}

		const githubEvent = request.headers.get('X-GitHub-Event') || 'unknown';
		logger.debug(`The GitHub event is: ${githubEvent}`);

		const source = request.headers.get('X-GitHub-Event') ? 'github' : 'unknown';

		switch (source) {
			case 'github':
				console.log('Request is from GitHub');
				break;
			default:
				console.log('Unknown source');
				return new Response('Unsupported webhook', { status: 400 });
		}

		return router.handle(request, env, ctx);
	}
};