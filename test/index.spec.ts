// test/index.spec.ts
import { createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

import worker from '../src/index';
import { Env } from '../src/common';

// For now, you'll need to do something like this to get a correctly-typed
// `Request` to pass to `worker.fetch()`.
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

declare global {
	var env: Env;
}

beforeAll(() => {
	// Set the environment variable for all tests
	const env: Env = {
		OSCAR_RATE_LIMITER: {
			limit: async ({ key }: { key: string; }) => {
				console.log(`Limiting ${key}`);
				return { success: true };
			},
		},
		GITHUB_APP_ID: '123',
		GITHUB_CLIENT_ID: '123',
		GITHUB_SECRET: '123',
		GITHUB_WEBHOOK_SECRET: '123',
		GITHUB_PRIVATE_KEY: '123',
		OSCAR_ACCESS_CONFIG_URI: '123',
	};

	globalThis.env = env;
});

describe('Verify invalid header', () => {
	it('should fail with Invalid signature', async () => {
		const request = new IncomingRequest('http://example.com/webhooks/github', {
			headers: {
				'X-GitHub-Event': 'push',
			},
			method: 'POST',
		});

		// Create an empty context to pass to `worker.fetch()`.
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, globalThis.env, ctx);
		await waitOnExecutionContext(ctx);
		expect(await response.status).toBe(500);
	});
});
