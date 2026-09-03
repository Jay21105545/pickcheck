import useSWR from "swr";

export function Widget() {
  const { data, isLoading } = useSWR("/api/widget", (url) => fetch(url).then((r) => r.json()));

  if (isLoading) return <Spinner />;

  return <div>{data.title}</div>;
}
