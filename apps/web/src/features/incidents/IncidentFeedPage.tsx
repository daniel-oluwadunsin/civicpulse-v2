import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../app/icons";
import { api, apiEnvelope } from "../../lib/api";
type Incident = {
  id: string;
  public_reference: string;
  title: string;
  summary: string;
  category: string;
  official_status: string;
  community_verification_status: string;
  report_count: number;
  affected_count: number;
  comment_count: number;
  reaction_score: number;
  lga_name?: string;
  state_name?: string;
  distance_m?: number;
  first_reported_at: string;
  viewer_follows?: boolean;
  latest_update?: { title: string; createdAt: string };
  organizations?: Array<{
    id: string;
    name: string;
    kind: string;
    verified: boolean;
    role: string;
  }>;
};
const categories = [
  "",
  "ROADS",
  "DRAINAGE",
  "WATER",
  "WASTE",
  "POWER",
  "EDUCATION",
  "HEALTH",
  "PUBLIC_BUILDING",
  "OTHER",
];
const feedTabs = [
  ["for-you", "For you"],
  ["following", "Following"],
  ["nearby", "Nearby"],
] as const;
const pretty = (value: string) =>
  value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^./, (char) => char.toUpperCase());
export default function IncidentFeedPage() {
  const qc = useQueryClient();
  const [feed, setFeed] = useState("for-you"),
    [category, setCategory] = useState(""),
    [officialStatus, setOfficialStatus] = useState(""),
    [communityStatus, setCommunityStatus] = useState(""),
    [area, setArea] = useState(""),
    [organization, setOrganization] = useState("");
  const [location, setLocation] = useState<{
      latitude: number;
      longitude: number;
    }>(),
    [filterOpen, setFilterOpen] = useState(false);
  const query = useInfiniteQuery({
    queryKey: [
      "incidents",
      feed,
      category,
      officialStatus,
      communityStatus,
      area,
      organization,
      location,
    ],
    initialPageParam: "",
    queryFn: ({ pageParam }) =>
      apiEnvelope<Incident[]>(
        `/incidents?feed=${feed}&limit=20${category ? `&category=${category}` : ""}${officialStatus ? `&officialStatus=${officialStatus}` : ""}${communityStatus ? `&communityStatus=${communityStatus}` : ""}${area ? `&${area.split(":")[0]}Id=${area.split(":")[1]}` : ""}${organization ? `&organizationId=${organization}` : ""}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}${location ? `&latitude=${location.latitude}&longitude=${location.longitude}` : ""}`,
      ),
    getNextPageParam: (page) => page.page?.nextCursor ?? undefined,
    retry: false,
  });
  const options = useQuery({
    queryKey: ["incident-filter-options"],
    queryFn: () =>
      api<{
        areas: Array<{ id: string; name: string; type: "STATE" | "LGA" }>;
        organizations: Array<{ id: string; name: string; kind: string }>;
      }>("/incidents/filter-options"),
  });
  const action = useMutation({
    mutationFn: ({
      id,
      path,
      method,
    }: {
      id: string;
      path: string;
      method: "PUT" | "DELETE";
    }) => api<void>(`/incidents/${id}/${path}`, { method }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["incidents"] }),
  });
  const selectFeed = (value: string) => {
    if (value !== "nearby") return setFeed(value);
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((position) => {
      setLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      setFeed("nearby");
    });
  };
  const activeFilters = [
    officialStatus,
    communityStatus,
    area,
    organization,
  ].filter(Boolean).length;
  const incidents = query.data?.pages.flatMap((page) => page.data) ?? [];
  return (
    <main className="feed-page">
      <header className="feed-heading">
        <div>
          <p className="kicker">Public accountability</p>
          <h1>Your civic feed</h1>
          <p>
            Real incidents, verified responsibility and visible action near you.
          </p>
        </div>
        <Link className="button button--primary feed-report" to="/report">
          <Icon name="report" />
          Report a problem
        </Link>
      </header>
      <div className="feed-toolbar">
        <div
          className="feed-tabs"
          role="tablist"
          aria-label="Choose incident feed"
        >
          {feedTabs.map(([value, label]) => (
            <button
              role="tab"
              aria-selected={feed === value}
              className={feed === value ? "active" : ""}
              key={value}
              onClick={() => selectFeed(value)}
            >
              {value === "nearby" && <Icon name="location" size={17} />} {label}
            </button>
          ))}
        </div>
        <button
          className={`filter-trigger ${filterOpen ? "active" : ""}`}
          aria-expanded={filterOpen}
          aria-controls="feed-filters"
          onClick={() => setFilterOpen((value) => !value)}
        >
          <Icon name="category" size={19} />
          Filters{activeFilters > 0 && <span>{activeFilters}</span>}
        </button>
      </div>
      <div className="category-scroller" aria-label="Filter by category">
        {categories.map((value) => (
          <button
            className={category === value ? "active" : ""}
            key={value || "all"}
            onClick={() => setCategory(value)}
          >
            {value ? pretty(value) : "All"}
          </button>
        ))}
      </div>
      {filterOpen && (
        <section id="feed-filters" className="filter-panel">
          <div className="filter-panel__head">
            <div>
              <p className="kicker">Refine the record</p>
              <h2>Filters</h2>
            </div>
            <button
              className="icon-button"
              aria-label="Close filters"
              onClick={() => setFilterOpen(false)}
            >
              <Icon name="close" />
            </button>
          </div>
          <div className="filter-grid">
            <label>
              Official status
              <select
                value={officialStatus}
                onChange={(event) => setOfficialStatus(event.target.value)}
              >
                <option value="">Any official status</option>
                {[
                  "OPEN",
                  "ACKNOWLEDGED",
                  "UNDER_REVIEW",
                  "IN_PROGRESS",
                  "BLOCKED",
                  "RESOLUTION_SUBMITTED",
                  "RESOLVED",
                ].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              Community verification
              <select
                value={communityStatus}
                onChange={(event) => setCommunityStatus(event.target.value)}
              >
                <option value="">Any community status</option>
                {[
                  "UNVERIFIED",
                  "COMMUNITY_CONFIRMED",
                  "COMMUNITY_DISPUTED",
                  "REVIEW_REQUIRED",
                ].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              Area
              <select
                value={area}
                onChange={(event) => setArea(event.target.value)}
              >
                <option value="">All areas</option>
                {options.data?.areas.map((item) => (
                  <option
                    key={item.id}
                    value={`${item.type === "STATE" ? "state" : "lga"}:${item.id}`}
                  >
                    {item.name} · {item.type}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Assigned organization
              <select
                value={organization}
                onChange={(event) => setOrganization(event.target.value)}
              >
                <option value="">All organizations</option>
                {options.data?.organizations.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.kind}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="filter-actions">
            <button
              className="button button--quiet"
              onClick={() => {
                setOfficialStatus("");
                setCommunityStatus("");
                setArea("");
                setOrganization("");
              }}
            >
              Clear filters
            </button>
            <button
              className="button button--primary"
              onClick={() => setFilterOpen(false)}
            >
              Show incidents
            </button>
          </div>
        </section>
      )}
      {query.isLoading && (
        <div className="feed-skeleton">
          <div className="skeleton-card" />
          <div className="skeleton-card" />
        </div>
      )}
      {query.error && (
        <div className="form-message" role="alert">
          {query.error.message}
        </div>
      )}
      <section className="incident-feed">
        {incidents.map((incident) => (
          <article className="incident-card" key={incident.id}>
            <div className="incident-card__meta">
              <span>{incident.public_reference}</span>
              <span className="category-tag">{pretty(incident.category)}</span>
            </div>
            <Link
              className="incident-card__title"
              to={`/incidents/${incident.id}`}
            >
              <h2>{incident.title}</h2>
            </Link>
            <p className="incident-summary">{incident.summary}</p>
            <div className="location-row">
              <span className="shape-icon">
                <Icon name="location" size={18} />
              </span>
              <div>
                <strong>
                  {incident.lga_name ??
                    incident.state_name ??
                    "Location under review"}
                </strong>
                <small>
                  {incident.distance_m != null
                    ? `${(incident.distance_m / 1000).toFixed(1)} km away`
                    : `Reported ${new Date(incident.first_reported_at).toLocaleDateString()}`}
                </small>
              </div>
            </div>
            <div className="status-pair">
              <span className="official-state">
                <Icon name="building" size={16} />
                Official · {pretty(incident.official_status)}
              </span>
              <span className="community-state">
                <Icon name="people" size={16} />
                Community · {pretty(incident.community_verification_status)}
              </span>
            </div>
            {incident.organizations?.length ? (
              <div className="organization-row">
                {incident.organizations.slice(0, 2).map((item) => (
                  <span key={item.id}>
                    <Icon
                      name={item.kind === "GOVERNMENT" ? "building" : "people"}
                      size={15}
                    />
                    {item.name}
                    {item.verified && <Icon name="shield" size={14} />}
                  </span>
                ))}
              </div>
            ) : (
              <p className="routing-note">Responsibility is under review.</p>
            )}
            {incident.latest_update && (
              <div className="latest-update">
                <i />
                <span>
                  <small>Latest public update</small>
                  <strong>{incident.latest_update.title}</strong>
                </span>
              </div>
            )}
            <div className="incident-card__counts">
              <span>
                <Icon name="document" />
                {incident.report_count}
                <small>reports</small>
              </span>
              <span>
                <Icon name="heart" />
                {incident.affected_count}
                <small>affected</small>
              </span>
              <span>
                <Icon name="message" />
                {incident.comment_count}
                <small>comments</small>
              </span>
            </div>
            <footer className="incident-card__actions">
              <button
                onClick={() =>
                  action.mutate({
                    id: incident.id,
                    path: "affected",
                    method: "PUT",
                  })
                }
              >
                <Icon name="heart" size={19} />
                I’m affected
              </button>
              <Link to={`/incidents/${incident.id}#discussion`}>
                <Icon name="message" size={19} />
                Comment
              </Link>
              <button
                aria-label={
                  incident.viewer_follows
                    ? "Unfollow incident"
                    : "Follow incident"
                }
                onClick={() =>
                  action.mutate({
                    id: incident.id,
                    path: "follow",
                    method: incident.viewer_follows ? "DELETE" : "PUT",
                  })
                }
              >
                <Icon name="notification" size={19} />
                {incident.viewer_follows ? "Following" : "Follow"}
              </button>
              <Link className="view-record" to={`/incidents/${incident.id}`}>
                View record <Icon name="arrow" size={18} />
              </Link>
            </footer>
          </article>
        ))}
      </section>
      {!query.isLoading && !incidents.length && (
        <div className="empty-state">
          <Icon name="map" size={34} />
          <h2>No incidents match these filters.</h2>
          <p>Clear a filter or explore a different area.</p>
        </div>
      )}
      {query.hasNextPage && (
        <button
          className="button button--primary load-more"
          onClick={() => query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
        >
          Load more incidents
        </button>
      )}
    </main>
  );
}
