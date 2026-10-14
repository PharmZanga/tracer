import express from 'express';
import {isAdministrator} from '../src/dashboardAccess.js';
import {activityQuery,validateActivityPage} from '../src/viewerActivityPolicy.js';
export function viewerActivityRouter(pool) {
  const router=express.Router();
  router.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  let cleanedAt=0;
  async function retention(){if(Date.now()-cleanedAt<3600000)return;cleanedAt=Date.now();try{await pool.query("DELETE FROM dashboard_viewer_activity WHERE last_seen < NOW() - INTERVAL '30 days'");}catch(e){cleanedAt=0;throw e;}}
  router.post('/',async(req,res,next)=>{
    const user=req.session.user,page=req.body?.page;
    if(!validateActivityPage(user.role,page))return res.status(400).json({error:'Invalid dashboard page.'});
    const previous=req.session.viewerActivity;
    if(previous?.page===page&&Date.now()-previous.time<30000)return res.sendStatus(204);
    try{
      await retention();
      await pool.query(`INSERT INTO dashboard_viewer_activity (email,page,activity_day,first_seen,last_seen,view_count)
        VALUES ($1,$2,(NOW() AT TIME ZONE 'Africa/Lusaka')::date,NOW(),NOW(),$3)
        ON CONFLICT(email,page,activity_day) DO UPDATE SET last_seen=NOW(),view_count=dashboard_viewer_activity.view_count+EXCLUDED.view_count`,
      [user.email,page,req.body?.view===true?1:0]);
      req.session.viewerActivity={page,time:Date.now()};res.sendStatus(204);
    }catch(e){next(e);}
  });
  router.get('/',async(req,res,next)=>{
    if(!isAdministrator(req.session.user.role))return res.status(403).json({error:'Administrator access required.'});
    const {days,limit,offset,page,search}=activityQuery(req.query);
    try{
      await retention();
      const where=`a.activity_day >= (NOW() AT TIME ZONE 'Africa/Lusaka')::date - ($1::int - 1) AND ($2='' OR u.email ILIKE '%' || $2 || '%' OR u.name ILIKE '%' || $2 || '%' OR u.province ILIKE '%' || $2 || '%')`;
      const totals=await pool.query(`SELECT COUNT(DISTINCT a.email)::int AS viewers,COALESCE(SUM(a.view_count),0)::int AS views,COUNT(DISTINCT a.email) FILTER(WHERE a.last_seen >= NOW()-INTERVAL '5 minutes')::int AS active FROM dashboard_viewer_activity a JOIN dashboard_users u ON u.email=a.email WHERE ${where}`,[days,search]);
      const users=await pool.query(`SELECT email,name,province,role,page,last_seen,views FROM (
        SELECT DISTINCT ON(a.email) a.email,u.name,u.province,u.role,a.page,a.last_seen,SUM(a.view_count) OVER(PARTITION BY a.email)::int AS views
        FROM dashboard_viewer_activity a JOIN dashboard_users u ON u.email=a.email WHERE ${where} ORDER BY a.email,a.last_seen DESC,a.page
      ) latest ORDER BY last_seen DESC,email LIMIT $3 OFFSET $4`,[days,search,limit,offset]);
      const pages=await pool.query(`SELECT a.page,COUNT(DISTINCT a.email)::int AS viewers,SUM(a.view_count)::int AS views FROM dashboard_viewer_activity a JOIN dashboard_users u ON u.email=a.email WHERE ${where} GROUP BY a.page ORDER BY views DESC,a.page`,[days,search]);
      res.json({summary:totals.rows[0],users:users.rows,pages:pages.rows,page,pageSize:limit,days,asOf:new Date().toISOString()});
    }catch(e){next(e);}
  });
  return router;
}
