// Every built-in delete method takes an argument. Real shapes from the
// corpus: URLSearchParams (vercel/commerce), Set (mindtrack HabitList),
// Map (the shadcn use-toast every AI repo ships), and Next.js cookies
// (nextjs/saas-starter). None is a database delete, and the empty-parens
// discriminator in the rule's regex is what keeps them out.
export function applyEdits(params: URLSearchParams, ids: Set<string>, id: string) {
  params.delete("q");
  ids.delete(id);
  timeouts.delete(id);
  return params.toString();
}

declare const timeouts: Map<string, number>;
