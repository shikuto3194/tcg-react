import config from './vite.config.js';

// A separate origin keeps review interactions out of the usual local library.
export default {
  ...config,
  server: { ...config.server, host: '127.0.0.1', port: 4175, strictPort: true },
};
