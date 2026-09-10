import { Router } from "express";
import { query } from "../../db/pool.js";
const router = Router();
router.get("/overview", async (_req, res, next) => {
  try {
    const [totals, recent] = await Promise.all([
      query<{
        incidents: number;
        reports: number;
        organizations: number;
        resolved: number;
      }>(`select
        (select count(*)::int from incidents where public_visibility='PUBLIC') incidents,
        (select count(*)::int from reports where status in ('SUBMITTED','PROCESSING','PROCESSED','NEEDS_REVIEW')) reports,
        (select count(*)::int from organizations where active=true and verification_status in ('VERIFIED','APPROVED')) organizations,
        (select count(*)::int from incidents where public_visibility='PUBLIC' and official_status in ('RESOLVED','CLOSED')) resolved`),
      query(
        `select i.id,i.title,i.official_status status,coalesce(l.name,s.name) location from incidents i left join jurisdictions l on l.id=i.lga_jurisdiction_id left join jurisdictions s on s.id=i.state_jurisdiction_id where i.public_visibility='PUBLIC' order by i.updated_at desc limit 3`,
      ),
    ]);
    res.json({ data: { ...totals.rows[0], recentIncidents: recent.rows } });
  } catch (error) {
    next(error);
  }
});
export default router;
