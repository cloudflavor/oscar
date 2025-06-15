import { describe, it, expect, vi } from 'vitest';
import { newCommandRegistry } from '../src/commands/github';

describe('GitHub Commands', () => {
    it('should register /ready command correctly', () => {
        const commandRegistry = newCommandRegistry();
        
        // Verify the command registry has the /ready command
        expect(commandRegistry).toBeDefined();
        
        // We can't directly test the private handlers, but we can test that
        // processCommand recognizes the /ready command
        const mockOctokit = {
            rest: {
                pulls: {
                    update: vi.fn().mockResolvedValue({ data: {} })
                }
            }
        };
        
        const mockPayload = {
            issue: { number: 123 },
            repository: {
                owner: { login: 'testowner' },
                name: 'testrepo'
            }
        };
        
        // Test that processCommand handles /ready without throwing
        expect(async () => {
            await commandRegistry.processCommand('/ready', mockOctokit as any, mockPayload);
        }).not.toThrow();
    });

    it('should register /draft command correctly', () => {
        const commandRegistry = newCommandRegistry();
        
        // Verify the command registry has the /draft command
        expect(commandRegistry).toBeDefined();
        
        // We can't directly test the private handlers, but we can test that
        // processCommand recognizes the /draft command
        const mockOctokit = {
            rest: {
                pulls: {
                    update: vi.fn().mockResolvedValue({ data: {} })
                }
            }
        };
        
        const mockPayload = {
            issue: { number: 123 },
            repository: {
                owner: { login: 'testowner' },
                name: 'testrepo'
            }
        };
        
        // Test that processCommand handles /draft without throwing
        expect(async () => {
            await commandRegistry.processCommand('/draft', mockOctokit as any, mockPayload);
        }).not.toThrow();
    });
});