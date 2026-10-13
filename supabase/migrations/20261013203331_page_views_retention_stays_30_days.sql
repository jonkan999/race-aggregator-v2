-- p_retention_days now only governs popup events; raw race_detail_page_views keep 30 days.
do $m$
declare v text := pg_get_functiondef('crm.rollup_and_prune_analytics(boolean,integer)'::regprocedure);
begin
  if position('least(v_cutoff, (v_rdpv_max + 1)' in v) = 0 then raise exception 'unexpected function body'; end if;
  execute replace(v, 'least(v_cutoff, (v_rdpv_max + 1)', 'least((v_today - 30)::timestamp at time zone ''UTC'', (v_rdpv_max + 1)');
end $m$;
