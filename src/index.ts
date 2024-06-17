import { Router } from '@tsndr/cloudflare-worker-router';

import { githubHandler } from './github/httpHandler';
import { Env, } from './common';

const router = new Router<Env, ExecutionContext, Request>();

router.debug();

router.post('/webhooks/github', githubHandler);

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const source = request.headers.get('X-GitHub-Event') ? 'github' :
			request.headers.get('X-Gitlab-Event') ? 'gitlab' :
				request.headers.get('X-Gitea-Event') ? 'gitea' : 'unknown';

		switch (source) {
			case 'github':
				console.log('Request is from GitHub');
				break;
			case 'gitlab':
				console.log('Request is from GitLab');
				return new Response('Not implemented', { status: 501, headers: { 'Content-Type': 'application/json' } });
			case 'gitea':
				console.log('Request is from Gitea');
				return new Response('Not implemented', { status: 501, headers: { 'Content-Type': 'application/json' } });
			default:
				console.log('Unknown source');
				return new Response('Unsupported webhook', { status: 400 });
		}

		return router.handle(request, env, ctx);
	}
}