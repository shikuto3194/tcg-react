import config from './vite.config.js';
// Existing review URL now runs the implemented local app.
export default { ...config, server: { ...config.server, host:'127.0.0.1', port:4174, strictPort:true } };
