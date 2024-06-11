import { Router } from '@tsndr/cloudflare-worker-router';

import { githubHandler, checkGitHubToken } from './github/handler';
import { Env, ExtCtx, ExtReq } from './common';

const router = new Router<Env, ExtCtx, ExtReq>();

router.debug();

router.post('/webhooks/github', githubHandler);


export default {
	async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const source = req.headers.get('X-GitHub-Event') ? 'github' :
			req.headers.get('X-Gitlab-Event') ? 'gitlab' :
				req.headers.get('X-Gitea-Event') ? 'gitea' : 'unknown';

		switch (source) {
			case 'github':
				console.log('Request is from GitHub');
				if (!await checkGitHubToken(env, req)) {
					console.log('Invalid signature');
					// NOTE: handling the missing signature headers is not required,
					// because the GitHub webhook will not process the request in any way.
					return new Response('Invalid signature', {
						status: 401, headers: {
							'Content-Type': 'application/json',
						}
					});
				}
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

		return router.handle(req, env, ctx);
	}
}