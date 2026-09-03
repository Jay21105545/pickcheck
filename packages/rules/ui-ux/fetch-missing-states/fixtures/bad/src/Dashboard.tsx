import { useQuery } from "some-query-lib";

export function Dashboard() {
  const { data } = useQuery("stats", () => fetch("/api/stats").then((r) => r.json()));

  return (
    <section>
      <h2>Stats</h2>
      <p>{data?.total}</p>
    </section>
  );
}
