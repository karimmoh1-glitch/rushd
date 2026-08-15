// Vitest (plain Node/Vite) can't resolve the "server-only" package the way
// Next's bundler does. This stub satisfies the import for integration
// tests, which intentionally run server-only modules directly in Node.
export {};
