-- Keep raw crm.newsletter_popup_events for 14 days (subscribe events are never pruned;
-- newsletter_popup_events_daily keeps the aggregates). Run VACUUM FULL manually afterwards.
do $m$
declare v text := pg_get_functiondef('crm.rollup_and_prune_analytics(boolean,integer)'::regprocedure);
begin
  if position('p_retention_days integer DEFAULT 30' in v) = 0 then raise exception 'unexpected function signature'; end if;
  execute replace(v, 'p_retention_days integer DEFAULT 30', 'p_retention_days integer DEFAULT 14');
end $m$;
select cron.alter_job((select jobid from cron.job where jobname='crm-rollup-and-prune-analytics'),
  command := 'select crm.rollup_and_prune_analytics(p_prune => true, p_retention_days => 14)');
