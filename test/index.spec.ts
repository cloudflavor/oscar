// test/index.spec.ts
import { createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

import worker from '../src/index';
import { Env } from '../src/common';

// For now, you'll need to do something like this to get a correctly-typed
// `Request` to pass to `worker.fetch()`.
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

beforeAll(() => {
	// Set the environment variable for all tests
	process.env.OSCAR_TOKEN = "test";
});

describe('Verify invalid header', () => {
	it('should fail with Unsupported webhook', async () => {
		const request = new IncomingRequest('http://example.com', {
			method: 'POST',
		});
		// Create an empty context to pass to `worker.fetch()`.
		const ctx = createExecutionContext();

		const response = await worker.fetch(request, {}, ctx);
		// Wait for all `Promise`s passed to `ctx.waitUntil()` to settle before running test assertions
		await waitOnExecutionContext(ctx);
		expect(await response.status).toBe(400);
	});

	it('should fail with Invalid signature', async () => {
		const request = new IncomingRequest('http://example.com/webhooks/github', {
			headers: {
				'X-GitHub-Event': 'push',
			},
			method: 'POST',
		});

		// Create an empty context to pass to `worker.fetch()`.
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, {}, ctx);
		await waitOnExecutionContext(ctx);
		expect(await response.status).toBe(500);
	});

	it('should fail with Not implemented', async () => {
		const headerValues = [
			'X-Gitlab-Event',
			'X-Gitea-Event',
		];

		for (const headerEntry of headerValues) {
			const headers = {
				[headerEntry]: 'test',
			};

			const request = new IncomingRequest('http://example.com', {
				headers,
				method: 'POST',
			});

			// Create an empty context to pass to `worker.fetch()`.
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, {}, ctx);
			await waitOnExecutionContext(ctx);
			expect(await response.status).toBe(501);
		}
	});
});
