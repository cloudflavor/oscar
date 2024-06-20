import { parse } from 'smol-toml';
import axios from 'axios';

import { Config } from './common';

const parseTomlConfig =
    async (uri: string): Promise<Config | undefined> => {
        const response = await axios.get(uri);
        const config = parse(response.data);
        return config as Config;
    };

export { parseTomlConfig };