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
		const request = new IncomingRequest('http://example.com');
		// Create an empty context to pass to `worker.fetch()`.
		const ctx = createExecutionContext();
		const env: Env = {
			"OSCAR_TOKEN": "test"
		};

		const response = await worker.fetch(request, env, ctx);
		// Wait for all `Promise`s passed to `ctx.waitUntil()` to settle before running test assertions
		await waitOnExecutionContext(ctx);
		expect(await response.status).toBe(400);
	});

	it('should fail with Invalid signature', async () => {
		const request = new IncomingRequest('http://example.com', {
			headers: {
				'X-GitHub-Event': 'push',
			}
		});
		const env = {
			"OSCAR_TOKEN": "test"
		};

		// Create an empty context to pass to `worker.fetch()`.
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(await response.status).toBe(401);
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
				headers
			});

			const env = {
				"OSCAR_TOKEN": "test"
			};

			// Create an empty context to pass to `worker.fetch()`.
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);
			expect(await response.status).toBe(501);
		}
	});
});
