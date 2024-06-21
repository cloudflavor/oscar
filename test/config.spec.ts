import { describe, it, expect, vi } from 'vitest';

import { parseTomlConfig } from '../src/common';


describe('parseTomlConfig', () => {
    it('should parse the TOML config file correctly', async () => {
        // Mock the fetch function to return a response with the TOML content
        const mockFetch = vi.fn().mockResolvedValue({
            text: vi.fn().mockResolvedValue(`
        [admin]
        name = "John Doe"
      `),
        });
        global.fetch = mockFetch;

        // Call the parseTomlConfig function with a mock URI
        const config = await parseTomlConfig('http://example.com/config.toml');

        // Assert that the config is parsed correctly
        expect(config).toEqual({
            admin: { name: 'John Doe' },
            checkPermissions: expect.any(Function),
        });

        // Assert that the checkPermissions function works correctly
        expect(config?.checkPermissions('John Doe')).toBe(true);
        expect(config?.checkPermissions('Jane Smith')).toBe(false);

        // Assert that the fetch function is called with the correct URI
        expect(mockFetch).toHaveBeenCalledWith('http://example.com/config.toml');
    });

    it('should throw an error if the config file is invalid', async () => {
        // Mock the fetch function to return a response with an invalid TOML content
        const mockFetch = vi.fn().mockResolvedValue({
            text: vi.fn().mockResolvedValue(`
        [admin]
        // Missing name property
      `),
        });
        global.fetch = mockFetch;

        // Call the parseTomlConfig function with a mock URI
        await expect(parseTomlConfig('http://example.com/config.toml')).rejects.toThrow();

        // Assert that the fetch function is called with the correct URI
        expect(mockFetch).toHaveBeenCalledWith('http://example.com/config.toml');
    });
});