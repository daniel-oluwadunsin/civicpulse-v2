import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Icon } from "../../app/icons";
import { api, apiEnvelope } from "../../lib/api";
type Item = {
  id: string;
  type: string;
  payload: Record<string, string>;
  read_at: string | null;
  created_at: string;
};
const label = (type: string) =>
  type
    .split("_")
    .map((x) => x[0] + x.slice(1).toLowerCase())
    .join(" ");
export default function ActivityPage() {
  const qc = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: ["activity"],
    initialPageParam: "",
    queryFn: ({ pageParam }) =>
      apiEnvelope<Item[]>(
        `/users/me/activity${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ""}`,
      ),
    getNextPageParam: (p) => p.page?.nextCursor ?? undefined,
    retry: false,
  });
  const readAll = useMutation({
    mutationFn: () =>
      api<void>("/users/me/activity/read-all", { method: "POST", body: "{}" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["activity"] }),
  });
  const items = query.data?.pages.flatMap((p) => p.data) ?? [];
  return (
    <main className="page-container">
      <div className="page-heading">
        <div>
          <p className="kicker">Your CivicPulse</p>
          <h1>Activity</h1>
          <p>
            Mentions, followed-incident updates and workflow actions that need
            your attention.
          </p>
        </div>
        <button
          className="button button--quiet"
          onClick={() => readAll.mutate()}
          disabled={!items.some((x) => !x.read_at)}
        >
          Mark all as read
        </button>
      </div>
      {query.isLoading && <div className="skeleton-card" />}
      {query.error && (
        <div className="form-message" role="alert">
          Sign in to view your activity.
        </div>
      )}{" "}
      {!query.isLoading && !query.error && !items.length && (
        <div className="empty-state">
          <Icon name="notification" size={32} />
          <h2>You’re all caught up.</h2>
          <p>
            Follow incidents or mention verified organizations to keep
            meaningful civic updates here.
          </p>
          <Link className="text-link" to="/incidents">
            Explore incidents <Icon name="arrow" />
          </Link>
        </div>
      )}
      <div className="activity-list">
        {items.map((item) => (
          <article className={item.read_at ? "" : "is-unread"} key={item.id}>
            <span className="activity-icon">
              <Icon
                name={
                  item.type.includes("MENTION") ? "message" : "notification"
                }
              />
            </span>
            <div>
              <p className="kicker">{label(item.type)}</p>
              <h2>
                {item.payload.title ??
                  item.payload.preview ??
                  "Civic activity update"}
              </h2>
              <time>{new Date(item.created_at).toLocaleString()}</time>
            </div>
            {item.payload.incidentId && (
              <Link
                className="button button--quiet"
                to={`/incidents/${item.payload.incidentId}`}
              >
                View
              </Link>
            )}
          </article>
        ))}
      </div>
      {query.hasNextPage && (
        <button
          className="button"
          onClick={() => query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
        >
          Load older activity
        </button>
      )}
    </main>
  );
}
