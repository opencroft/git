/**
 * Minimal stand-in for TanStack's createServerFn().inputValidator().handler()
 * chain so the git-client server functions port verbatim: validate first,
 * then run the handler with `{ data }`.
 */
export function action<I, R>(validate: (input: I) => I, handler: (ctx: { data: I }) => R | Promise<R>) {
  return async (input: I): Promise<R> => handler({ data: validate(input) })
}
