import { useGSAP } from "@gsap/react";
import { useQuery } from "@tanstack/react-query";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../app/icons";
import { api } from "../../lib/api";

gsap.registerPlugin(ScrollTrigger, useGSAP);
type Overview = {
  incidents: number;
  reports: number;
  organizations: number;
  resolved: number;
  recentIncidents: Array<{
    id: string;
    title: string;
    location?: string;
    status: string;
  }>;
};
const fallback: Overview = {
  incidents: 0,
  reports: 0,
  organizations: 0,
  resolved: 0,
  recentIncidents: [],
};

function SignalCanvas() {
  const ref = useRef<HTMLCanvasElement>(null),
    reduced = useReducedMotion();
  useEffect(() => {
    if (reduced || !ref.current) return;
    const canvas = ref.current,
      ctx = canvas.getContext("2d");
    if (!ctx) return;
    let frame = 0,
      raf = 0;
    const dots = Array.from({ length: 28 }, (_, i) => ({
      x: (i * 83) % 700,
      y: (i * 47) % 420,
      phase: i * 0.7,
    }));
    const paint = () => {
      const dpr = Math.min(devicePixelRatio, 2),
        box = canvas.getBoundingClientRect();
      if (canvas.width !== box.width * dpr) {
        canvas.width = box.width * dpr;
        canvas.height = box.height * dpr;
        ctx.scale(dpr, dpr);
      }
      ctx.clearRect(0, 0, box.width, box.height);
      frame += 0.012;
      dots.forEach((dot, i) => {
        const x = (dot.x / 700) * box.width,
          y = (dot.y / 420) * box.height;
        ctx.beginPath();
        ctx.arc(
          x,
          y + Math.sin(frame + dot.phase) * 7,
          i % 5 === 0 ? 3 : 1.5,
          0,
          Math.PI * 2,
        );
        ctx.fillStyle = i % 5 === 0 ? "#C79214" : "rgba(0,135,81,.35)";
        ctx.fill();
      });
      raf = requestAnimationFrame(paint);
    };
    paint();
    return () => cancelAnimationFrame(raf);
  }, [reduced]);
  return <canvas className="signal-canvas" ref={ref} aria-hidden="true" />;
}

export default function LandingPage() {
  const root = useRef<HTMLElement>(null),
    reduced = useReducedMotion();
  const overview = useQuery({
    queryKey: ["public-overview"],
    queryFn: () => api<Overview>("/public/overview"),
    retry: false,
  });
  useEffect(() => {
    if (reduced) return;
    const lenis = new Lenis({ duration: 1.05, smoothWheel: true });
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    lenis.on("scroll", ScrollTrigger.update);
    return () => {
      gsap.ticker.remove(tick);
      lenis.destroy();
    };
  }, [reduced]);
  useGSAP(
    () => {
      if (reduced) return;
      gsap.from(".hero-word span", {
        yPercent: 115,
        stagger: 0.08,
        duration: 1,
        ease: "power4.out",
      });
      gsap.from(".hero-art", {
        scale: 0.92,
        opacity: 0,
        rotate: 2,
        duration: 1.2,
        ease: "power3.out",
      });
      gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) =>
        gsap.from(el, {
          y: 42,
          opacity: 0,
          duration: 0.8,
          scrollTrigger: { trigger: el, start: "top 88%" },
        }),
      );
      gsap.fromTo(
        ".map-route",
        { strokeDasharray: 900, strokeDashoffset: 900 },
        {
          strokeDashoffset: 0,
          ease: "none",
          scrollTrigger: {
            trigger: ".route-story",
            start: "top 75%",
            end: "bottom 55%",
            scrub: 1,
          },
        },
      );
      gsap.to(".geo-card", {
        yPercent: 8,
        rotate: -1,
        ease: "none",
        scrollTrigger: {
          trigger: ".landing-hero",
          start: "top top",
          end: "bottom top",
          scrub: true,
        },
      });
    },
    { scope: root },
  );
  const stats = overview.data ?? fallback;
  return (
    <main ref={root} className="landing">
      <section className="landing-hero">
        <SignalCanvas />
        <div className="hero-copy-v2">
          <p className="kicker">
            <span /> Nigeria’s public accountability network
          </p>
          <h1 className="hero-word">
            <span>See the problem.</span>
            <span>Move it forward.</span>
          </h1>
          <p className="hero-lede">
            Report public infrastructure problems, see who is responsible, and
            follow verified action from first evidence to community-confirmed
            resolution.
          </p>
          <div className="button-row">
            <Link className="button button--primary" to="/report">
              Report a problem <Icon name="arrow" />
            </Link>
            <Link className="button button--quiet" to="/incidents">
              Explore the public record
            </Link>
          </div>
          <div className="trust-inline">
            <Icon name="security" />
            <span>Reporter identity stays private by default.</span>
            <span>Evidence is moderated before publication.</span>
          </div>
        </div>
        <motion.div
          className="hero-art hero-art--geometric"
          whileHover={{ scale: reduced ? 1 : 1.006 }}
          transition={{ duration: 0.4 }}
        >
          <div className="geo-dot-field" />
          <div className="geo-circle" />
          <div className="geo-triangle" />
          <div className="geo-squiggle">REPORT · ROUTE · ACT · VERIFY ·</div>
          <article className="geo-card">
            <div className="geo-card__top">
              <span className="category-tag">Road safety</span>
              <span>CP-2026-0184</span>
            </div>
            <div className="geo-photo" aria-hidden="true">
              <svg viewBox="0 0 520 230">
                <rect width="520" height="230" fill="#DDF2E5" />
                <path
                  d="M-20 210 184 28l78 70 70-52 208 175"
                  fill="#FFF1A8"
                  stroke="#12231A"
                  strokeWidth="5"
                />
                <path
                  d="M70 230 250 104l190 126"
                  fill="#008751"
                  opacity=".78"
                />
                <path
                  d="M216 230 276 96l52 134"
                  fill="#FFFDF5"
                  stroke="#12231A"
                  strokeWidth="4"
                />
                <path
                  d="M270 153h44M259 181h67"
                  stroke="#F4C542"
                  strokeWidth="7"
                  strokeLinecap="round"
                />
              </svg>
              <span className="geo-pin">
                <Icon name="location" />
              </span>
            </div>
            <h3>Damaged pedestrian bridge near the market</h3>
            <p>
              <Icon name="location" size={17} /> Surulere, Lagos · 1.8 km away
            </p>
            <div className="status-pair">
              <span className="official-state">
                <Icon name="building" size={15} />
                Official · Acknowledged
              </span>
              <span className="community-state">
                <Icon name="people" size={15} />
                Community · Unverified
              </span>
            </div>
            <footer>
              <span>
                <Icon name="document" />
                12 reports
              </span>
              <span>
                <Icon name="heart" />
                38 affected
              </span>
              <span>
                <Icon name="message" />9 comments
              </span>
            </footer>
          </article>
          <div className="hero-status">
            <i />
            <span>Public signal</span>
            <strong>Evidence → action</strong>
          </div>
        </motion.div>
      </section>

      <section className="trust-strip" aria-label="CivicPulse public activity">
        <span>PUBLIC RECORD</span>
        <dl>
          <div>
            <dt>Incidents tracked</dt>
            <dd>{stats.incidents.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Citizen reports</dt>
            <dd>{stats.reports.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Verified organizations</dt>
            <dd>{stats.organizations.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Resolved incidents</dt>
            <dd>{stats.resolved.toLocaleString()}</dd>
          </div>
        </dl>
      </section>

      <section id="how-it-works" className="section route-story">
        <div className="section-heading" data-reveal>
          <p className="kicker">The accountability route</p>
          <h2>One report becomes a shared civic record.</h2>
          <p>
            CivicPulse combines resident evidence with verified jurisdiction and
            organizational mandates. AI can assist analysis, but people retain
            authority over routing, status, approvals and resolution.
          </p>
        </div>
        <div className="route-grid">
          <div className="route-map" data-reveal>
            <img
              src="/brand/nigeria-grid.svg"
              alt="Diagram showing a civic report routed across Nigeria to action and verification"
            />
          </div>
          <ol className="route-steps">
            {[
              [
                "01",
                "Report",
                "Describe the issue, attach evidence and confirm its location.",
              ],
              [
                "02",
                "Understand",
                "Evidence is organized without inventing facts or coordinates.",
              ],
              [
                "03",
                "Route",
                "Verified jurisdictions and mandates identify responsible organizations.",
              ],
              [
                "04",
                "Act",
                "Government and approved NGO work appears in a public timeline.",
              ],
              [
                "05",
                "Verify",
                "Connected residents can confirm or dispute an official resolution.",
              ],
            ].map(([n, t, d]) => (
              <li key={n} data-reveal>
                <span>{n}</span>
                <div>
                  <h3>{t}</h3>
                  <p>{d}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section incident-preview" data-reveal>
        <div className="section-heading">
          <p className="kicker">Nearby and public</p>
          <h2>Infrastructure issues, not engagement bait.</h2>
          <p>
            Fresh evidence, unresolved age, location relevance and meaningful
            institutional activity matter. Votes never set severity.
          </p>
        </div>
        <div className="preview-grid">
          {stats.recentIncidents.length ? (
            stats.recentIncidents.slice(0, 3).map((item) => (
              <Link
                to={`/incidents/${item.id}`}
                className="preview-card"
                key={item.id}
              >
                <span className="status-chip">Official · {item.status}</span>
                <h3>{item.title}</h3>
                <p>
                  <Icon name="location" />{" "}
                  {item.location ?? "Location under review"}
                </p>
                <span className="text-link">
                  View public timeline <Icon name="arrow" />
                </span>
              </Link>
            ))
          ) : (
            <div className="preview-card preview-card--empty">
              <Icon name="map" size={34} />
              <h3>Public incidents appear here when available.</h3>
              <p>
                CivicPulse never invents records or activity for presentation.
              </p>
              <Link className="text-link" to="/incidents">
                Open the public record <Icon name="arrow" />
              </Link>
            </div>
          )}
        </div>
      </section>

      <section id="institutions" className="section institution-section">
        <div className="institution-copy" data-reveal>
          <p className="kicker">Government and civil society</p>
          <h2>Coordination with authority and a visible history.</h2>
          <p>
            Government teams triage assignments, publish updates and submit
            evidence-backed resolutions. Verified NGOs can propose support, but
            physical work cannot begin until competent approvals are recorded.
          </p>
          <div className="button-row">
            <Link className="button button--primary" to="/login">
              Organization access
            </Link>
            <Link className="button button--quiet" to="/login">
              Open your workspace
            </Link>
          </div>
        </div>
        <div className="institution-board" data-reveal>
          <div className="mini-stat">
            <Icon name="notification" />
            <span>Needs attention</span>
            <strong>Evidence, SLA and routing queues</strong>
          </div>
          <div className="mini-stat">
            <Icon name="building" />
            <span>Verified identity</span>
            <strong>Government and NGO attribution</strong>
          </div>
          <div className="mini-stat">
            <Icon name="shield" />
            <span>Two truthful states</span>
            <strong>Official resolved · Community disputed</strong>
          </div>
        </div>
      </section>

      <section className="section trust-section" data-reveal>
        <div>
          <p className="kicker">Trust is part of the product</p>
          <h2>Public where it should be. Restricted where it must be.</h2>
        </div>
        <div className="trust-cards">
          <article>
            <Icon name="eye" />
            <h3>Location-safe</h3>
            <p>
              Public views use coarse locations. Authorized operational teams
              receive exact coordinates when required.
            </p>
          </article>
          <article>
            <Icon name="security" />
            <h3>Evidence-aware</h3>
            <p>
              Original files stay restricted. Public derivatives are explicit,
              moderated and stripped of private metadata.
            </p>
          </article>
          <article>
            <Icon name="people" />
            <h3>Community-verifiable</h3>
            <p>
              Official resolution and community verification remain separate,
              visible and auditable.
            </p>
          </article>
        </div>
      </section>
      <section className="landing-cta">
        <p className="kicker">Make the signal visible</p>
        <h2>A public problem deserves a traceable response.</h2>
        <Link className="button button--inverse" to="/report">
          Report a problem <Icon name="arrow" />
        </Link>
      </section>
      <footer className="landing-footer">
        <strong className="footer-wordmark">
          Civic<span>Pulse</span>
        </strong>
        <p>Report → understand → locate → route → act → verify.</p>
        <nav>
          <Link to="/incidents">Public record</Link>
          <Link to="/login">Organization access</Link>
          <Link to="/login">Sign in</Link>
        </nav>
      </footer>
    </main>
  );
}
