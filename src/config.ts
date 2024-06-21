import * as TOML from '@ltd/j-toml';

import { Config } from './common';

const parseTomlConfig =
    async (uri: string): Promise<Config | undefined> => {
        const response = await fetch(uri);
        const parsedToml = TOML.parse(await response.text());
        // TODO: This would need to be addressed in the new version of the 
        // permissions config file.
        if (!parsedToml.admin || !parsedToml.admin.name) {
            throw new Error('Error while parsing the config file');
        }
        const conf: Config = {
            admin: { name: parsedToml.admin.name },
            checkPermissions: (user: string) => parsedToml.admin.name === user,
        };
        return conf;
    };

export { parseTomlConfig };