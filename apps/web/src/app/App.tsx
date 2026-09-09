import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  HeartHandshake,
  MapPinned,
  Menu,
  ShieldCheck,
} from "lucide-react";
import { Link, NavLink, Route, Routes } from "react-router-dom";
import { api } from "../lib/api";
import { LoginPage, RegisterPage } from "../features/auth/AuthPages";
import { ReportPage } from "../features/reports/ReportPage";
import { OnboardingPage } from "../features/organizations/OnboardingPage";
type Me = {
  user: { email: string; platformRole: string | null };
  organizations: Array<{ id: string; kind: string; role: string }>;
};
function Shell({ children }: { children: React.ReactNode }) {
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<Me>("/auth/me"),
    retry: false,
  });
  return (
    <>
      <header className="site-header">
        <Link className="brand" to="/">
          <img src="/brand/civicpulse-logo.svg" alt="CivicPulse" />
        </Link>
        <nav>
          <NavLink to="/report">Report</NavLink>
          <NavLink to="/incidents">Incidents</NavLink>
          <NavLink to="/government">Government</NavLink>
          <NavLink to="/ngo">NGOs</NavLink>
          <NavLink to="/admin">Admin</NavLink>
        </nav>
        <div className="header-action">
          {me.data ? (
            <span className="eyebrow">{me.data.user.email}</span>
          ) : (
            <Link className="button button--ink" to="/login">
              Sign in
            </Link>
          )}
          <Menu aria-label="Open menu" className="mobile-menu" />
        </div>
      </header>
      {children}
    </>
  );
}
function Landing() {
  return (
    <main>
      <section className="hero swiss-grid">
        <div className="hero-copy">
          <p className="eyebrow signal">
            01 / PUBLIC ACCOUNTABILITY, MADE LEGIBLE
          </p>
          <h1>
            REPORT.
            <br />
            ROUTE.
            <br />
            <span>RESOLVE.</span>
          </h1>
          <p className="lede">
            CivicPulse turns resident evidence into a public record: located,
            routed to verified institutions, and visible until the outcome can
            be verified.
          </p>
          <div className="actions">
            <Link className="button button--ink" to="/report">
              Report a problem <ArrowUpRight />
            </Link>
            <Link className="button" to="/incidents">
              Explore incidents
            </Link>
          </div>
        </div>
        <div className="hero-image">
          <img
            src="/brand/civicpulse-hero.png"
            alt="Abstract civic infrastructure grid with a red route"
          />
        </div>
      </section>
      <section className="method">
        <p className="eyebrow signal">
          02 / ONE CIVIC SIGNAL, FOUR PUBLIC LAYERS
        </p>
        <div className="method-grid">
          <article>
            <MapPinned />
            <h2>Evidence</h2>
            <p>
              Describe what is wrong. Add photos, audio or video. Confirm the
              location.
            </p>
          </article>
          <article>
            <ShieldCheck />
            <h2>Responsibility</h2>
            <p>
              Verified mandates and deterministic jurisdiction data guide the
              route.
            </p>
          </article>
          <article>
            <Building2 />
            <h2>Action</h2>
            <p>
              Government organizations coordinate updates and evidence-backed
              decisions.
            </p>
          </article>
          <article>
            <HeartHandshake />
            <h2>Verification</h2>
            <p>
              Communities and NGOs can see the work and challenge a claimed
              resolution.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}
function RouteShell({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <main className="route-shell swiss-dots">
      <p className="eyebrow signal">CIVICPULSE / {title}</p>
      <h1>{title}</h1>
      <p className="lede">{description}</p>
      <div className="empty-state">
        <AlertTriangle />
        <p>
          This operational surface connects to live CivicPulse data as its
          supporting module is implemented. It does not display invented
          records.
        </p>
      </div>
    </main>
  );
}
export function App() {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/report" element={<ReportPage />} />
        <Route path="/organizations/onboard" element={<OnboardingPage />} />
        <Route
          path="/incidents"
          element={
            <RouteShell
              title="INCIDENTS"
              description="An incident-centric public record of civic issues and official response."
            />
          }
        />
        <Route
          path="/government"
          element={
            <RouteShell
              title="GOVERNMENT OPERATIONS"
              description="Assigned incidents, routing rationale, evidence and official updates."
            />
          }
        />
        <Route
          path="/ngo"
          element={
            <RouteShell
              title="NGO INTERVENTIONS"
              description="Discover verified public needs and propose approval-gated support."
            />
          }
        />
        <Route
          path="/admin"
          element={
            <RouteShell
              title="PLATFORM ADMINISTRATION"
              description="Verification, routing review, data quality, and audit operations."
            />
          }
        />
        <Route
          path="*"
          element={
            <RouteShell
              title="NOT FOUND"
              description="This route does not exist."
            />
          }
        />
      </Routes>
    </Shell>
  );
}
