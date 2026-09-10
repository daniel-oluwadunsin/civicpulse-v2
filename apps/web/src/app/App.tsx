import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { lazy, Suspense, useMemo, useState } from "react";
import {
  Link,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { api } from "../lib/api";
import { Icon } from "./icons";
import { ThemeToggle } from "./ThemeToggle";

const LoginPage = lazy(() =>
  import("../features/auth/AuthPages").then((m) => ({ default: m.LoginPage })),
);
const RegisterPage = lazy(() =>
  import("../features/auth/AuthPages").then((m) => ({
    default: m.RegisterPage,
  })),
);
const ForgotPasswordPage = lazy(() =>
  import("../features/auth/AuthPages").then((m) => ({
    default: m.ForgotPasswordPage,
  })),
);
const ResetPasswordPage = lazy(() =>
  import("../features/auth/AuthPages").then((m) => ({
    default: m.ResetPasswordPage,
  })),
);
const ReportPage = lazy(() =>
  import("../features/reports/ReportPage").then((m) => ({
    default: m.ReportPage,
  })),
);
const OnboardingPage = lazy(() =>
  import("../features/organizations/OnboardingPage").then((m) => ({
    default: m.OnboardingPage,
  })),
);
const OrganizationInvitationPage = lazy(() =>
  import("../features/organizations/OrganizationInvitationPage").then((m) => ({
    default: m.OrganizationInvitationPage,
  })),
);
const IncidentFeedPage = lazy(
  () => import("../features/incidents/IncidentFeedPage"),
);
const IncidentDetailPage = lazy(
  () => import("../features/incidents/IncidentDetailPage"),
);
const GovernmentPage = lazy(
  () => import("../features/government/GovernmentPage"),
);
const NgoPage = lazy(() => import("../features/ngo/NgoPage"));
const LandingPage = lazy(() => import("../features/landing/LandingPage"));
const AccountPage = lazy(() => import("../features/account/AccountPages"));
const ActivityPage = lazy(() => import("../features/account/ActivityPage"));
const AdminPage = lazy(() => import("../features/admin/AdminPage"));

export type Me = {
  user: {
    id?: string;
    email: string;
    platformRole: string | null;
    displayName?: string;
  };
  organizations: Array<{
    id: string;
    kind: string;
    role: string;
    display_name?: string;
    official_name?: string;
    active: boolean;
    verification_status: string;
    onboarding_status: string;
  }>;
};
const publicPaths = [
  "/",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/organizations/onboard",
  "/organization-invitation",
];
const protectedPaths = new Set([
  "/report",
  "/activity",
  "/profile",
  "/government",
  "/ngo",
  "/admin",
  "/organizations/onboard",
  "/organization-invitation",
]);
function getRole(me?: Me) {
  if (me?.user.platformRole === "CIVICPULSE_ADMIN") return "admin";
  if (
    me?.organizations.some(
      (o) =>
        o.kind === "GOVERNMENT" &&
        o.active &&
        o.verification_status === "VERIFIED",
    )
  )
    return "government";
  if (
    me?.organizations.some(
      (o) =>
        o.kind === "NGO" && o.active && o.verification_status === "VERIFIED",
    )
  )
    return "ngo";
  return "citizen";
}
const roleNavigation = {
  citizen: [
    ["/incidents", "Feed", "home"],
    ["/incidents?view=map", "Map", "map"],
    ["/report", "Report", "report"],
    ["/activity", "Activity", "activity"],
    ["/profile", "Profile", "profile"],
  ],
  government: [
    ["/government", "Inbox", "dashboard"],
    ["/government?view=map", "Map", "map"],
    ["/government?view=updates", "Updates", "message"],
    ["/activity", "Activity", "activity"],
    ["/profile", "More", "menu"],
  ],
  ngo: [
    ["/ngo", "Discover", "search"],
    ["/ngo?view=proposals", "Proposals", "document"],
    ["/ngo?view=work", "Work", "building"],
    ["/activity", "Activity", "activity"],
    ["/profile", "More", "menu"],
  ],
  admin: [
    ["/admin", "Reviews", "shield"],
    ["/admin?view=moderation", "Moderation", "security"],
    ["/admin?view=routing", "Routing", "map"],
    ["/activity", "Activity", "activity"],
    ["/profile", "More", "menu"],
  ],
} as const;
function Brand() {
  return (
    <Link className="brand" to="/" aria-label="CivicPulse home">
      <svg className="brand-mark" viewBox="0 0 48 48" aria-hidden="true">
        <path
          d="M10 8h24a6 6 0 0 1 0 12H16v12h18a6 6 0 0 1 0 12H10a6 6 0 0 1-6-6V14a6 6 0 0 1 6-6Z"
          fill="currentColor"
        />
        <circle cx="39" cy="26" r="5" fill="#F4C542" />
      </svg>
      <span className="brand-word">
        Civic<span>Pulse</span>
      </span>
    </Link>
  );
}

function isSelectedDestination(
  destination: string,
  pathname: string,
  search: string,
) {
  const [path, query] = destination.split("?");
  return (
    pathname === path &&
    (query ? search === `?${query}` : !search.includes("view="))
  );
}

function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation(),
    navigate = useNavigate(),
    qc = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<Me>("/auth/me"),
    retry: false,
  });
  const role = getRole(me.data),
    isAnonymousIncident =
      !me.data &&
      (location.pathname === "/incidents" ||
        location.pathname.startsWith("/incidents/")),
    isPublic =
      publicPaths.includes(location.pathname) ||
      isAnonymousIncident ||
      (!me.data && protectedPaths.has(location.pathname));
  const logout = useMutation({
    mutationFn: () => api<void>("/auth/logout", { method: "POST", body: "{}" }),
    onSuccess: () => {
      qc.clear();
      navigate("/");
    },
  });
  const nav = useMemo(() => roleNavigation[role], [role]);
  if (isPublic)
    return (
      <div className="public-shell">
        <header className="public-header">
          <Brand />
          <nav
            className={menuOpen ? "is-open" : ""}
            aria-label="Primary navigation"
          >
            <NavLink onClick={() => setMenuOpen(false)} to="/incidents">
              Public record
            </NavLink>
            <a onClick={() => setMenuOpen(false)} href="/#how-it-works">
              How it works
            </a>
            <a onClick={() => setMenuOpen(false)} href="/#institutions">
              For organizations
            </a>
          </nav>
          <div className="header-actions">
            <ThemeToggle />
            {me.data ? (
              <Link
                className="button button--quiet"
                to={role === "citizen" ? "/incidents" : `/${role}`}
              >
                Dashboard
              </Link>
            ) : (
              <Link className="button button--quiet desktop-only" to="/login">
                Sign in
              </Link>
            )}
            <Link className="button button--primary desktop-only" to="/report">
              Report a problem
            </Link>
            <button
              className="icon-button mobile-only"
              aria-label="Toggle navigation"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <Icon name={menuOpen ? "close" : "menu"} />
            </button>
          </div>
        </header>
        {children}
      </div>
    );
  return (
    <div className={`app-shell app-shell--${role}`}>
      <aside className="app-sidebar">
        <Brand />
        <div className="workspace-label">
          <span>
            {role === "citizen" ? "Public workspace" : `${role} workspace`}
          </span>
          <strong>
            {me.data?.organizations[0]?.display_name ??
              me.data?.organizations[0]?.official_name ??
              "CivicPulse"}
          </strong>
        </div>
        <nav aria-label={`${role} navigation`}>
          {nav.map(([to, label, icon]) => {
            const selected = isSelectedDestination(
              to,
              location.pathname,
              location.search,
            );
            return (
              <Link
                key={to}
                to={to}
                className={selected ? "active" : undefined}
                aria-current={selected ? "page" : undefined}
              >
                <Icon name={icon} variant={selected ? "Bold" : "Linear"} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          <button onClick={() => logout.mutate()} disabled={logout.isPending}>
            <Icon name="arrow" />
            <span>Sign out</span>
          </button>
          <div className="system-status">
            <i /> System operational
          </div>
        </div>
      </aside>
      <section className="app-workspace">
        <header className="app-topbar">
          <div className="mobile-topbar-brand">
            <Brand />
          </div>
          <div className="topbar-search">
            <Icon name="search" />
            <span>Search incidents, places or organizations</span>
            <kbd>⌘ K</kbd>
          </div>
          <div className="header-actions">
            <ThemeToggle />
            <Link
              className="icon-button"
              to="/activity"
              aria-label="Notifications"
            >
              <Icon name="notification" />
            </Link>
            <Link className="user-chip" to="/profile">
              <span>
                {(me.data?.user.displayName ?? me.data?.user.email ?? "CP")
                  .slice(0, 2)
                  .toUpperCase()}
              </span>
              <small>
                {me.data?.user.displayName ?? me.data?.user.email ?? "Account"}
              </small>
            </Link>
          </div>
        </header>
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
            className="route-motion"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </section>
      <nav className="bottom-nav" aria-label="Mobile navigation">
        {nav.map(([to, label, icon], index) => {
          const selected = isSelectedDestination(
            to,
            location.pathname,
            location.search,
          );
          return (
            <Link
              key={to}
              to={to}
              aria-current={selected ? "page" : undefined}
              className={`${index === 2 ? "bottom-nav__primary " : ""}${selected ? "active" : ""}`}
            >
              <Icon name={icon} variant={selected ? "Bold" : "Linear"} />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function PermissionDenied() {
  return (
    <main className="page-container state-page">
      <span className="kicker">Access restricted</span>
      <h1>This workspace is not available to your account.</h1>
      <p>
        Operational dashboards require an active membership in a verified
        organization.
      </p>
      <Link className="button button--primary" to="/incidents">
        Return to the public record
      </Link>
    </main>
  );
}

function RequireAccess({
  children,
  role,
}: {
  children: React.ReactNode;
  role?: "government" | "ngo" | "admin";
}) {
  const location = useLocation();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<Me>("/auth/me"),
    retry: false,
  });
  if (me.isPending)
    return (
      <main className="page-container state-page" aria-busy="true">
        <div className="skeleton-card" />
        <span className="sr-only">Checking account access</span>
      </main>
    );
  if (!me.data) {
    const returnTo = encodeURIComponent(
      `${location.pathname}${location.search}`,
    );
    return <Navigate replace to={`/login?returnTo=${returnTo}`} />;
  }
  if (role && getRole(me.data) !== role) return <PermissionDenied />;
  return children;
}
function NotFound() {
  return (
    <main className="page-container state-page">
      <span className="kicker">404 / Page not found</span>
      <h1>This route has moved.</h1>
      <p>Return to the public incident record or report a civic problem.</p>
      <div className="button-row">
        <Link className="button button--primary" to="/incidents">
          Explore incidents
        </Link>
        <Link className="button" to="/">
          CivicPulse home
        </Link>
      </div>
    </main>
  );
}
export function App() {
  return (
    <AppShell>
      <Suspense
        fallback={
          <main className="page-container state-page">
            <div className="skeleton-line" />
            <div className="skeleton-card" />
            <span className="sr-only">Loading CivicPulse</span>
          </main>
        }
      >
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route
            path="/report"
            element={
              <RequireAccess>
                <ReportPage />
              </RequireAccess>
            }
          />
          <Route
            path="/organizations/onboard"
            element={
              <RequireAccess>
                <OnboardingPage />
              </RequireAccess>
            }
          />
          <Route
            path="/organization-invitation"
            element={
              <RequireAccess>
                <OrganizationInvitationPage />
              </RequireAccess>
            }
          />
          <Route path="/incidents" element={<IncidentFeedPage />} />
          <Route path="/incidents/:id" element={<IncidentDetailPage />} />
          <Route
            path="/government"
            element={
              <RequireAccess role="government">
                <GovernmentPage />
              </RequireAccess>
            }
          />
          <Route
            path="/ngo"
            element={
              <RequireAccess role="ngo">
                <NgoPage />
              </RequireAccess>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireAccess role="admin">
                <AdminPage />
              </RequireAccess>
            }
          />
          <Route
            path="/activity"
            element={
              <RequireAccess>
                <ActivityPage />
              </RequireAccess>
            }
          />
          <Route
            path="/profile"
            element={
              <RequireAccess>
                <AccountPage />
              </RequireAccess>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}
