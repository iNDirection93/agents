/**
 * `elk-worker.min.js` is GWT output with no usable typings. It exports elk's
 * in-process worker shim as both `default` and `Worker`, but only from inside a
 * UMD wrapper — so it is imported as a default and unwrapped at runtime.
 */
declare module 'elkjs/lib/elk-worker.min.js' {
  const mod: unknown;
  export default mod;
}
