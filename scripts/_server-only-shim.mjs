// Loader hook that aliases "server-only" to an empty module so Node-side
// scripts can import lib/pdf/generate.ts without bundling Next.js.
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return {
      url: "data:text/javascript,export {};",
      shortCircuit: true,
      format: "module",
    };
  }
  return nextResolve(specifier, context);
}
