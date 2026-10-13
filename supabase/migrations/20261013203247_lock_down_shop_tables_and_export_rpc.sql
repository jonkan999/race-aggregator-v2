-- Security: Feedzone shop tables share this project. All Feedzone reads/writes go
-- through createServerClient() (service role, bypasses RLS); the aggregator never
-- touches these tables. Lock out anon/authenticated writes.
alter table public.discount_codes enable row level security;
alter table public.products       enable row level security;
alter table public.news           enable row level security;
alter table public.product_groups enable row level security;

revoke all on table public.discount_codes from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger
  on table public.products, public.news, public.product_groups from anon, authenticated;

-- Catalog data is public anyway; keep read-only access for anon/authenticated.
-- discount_codes deliberately gets no policy (service role only).
drop policy if exists products_public_read on public.products;
create policy products_public_read on public.products for select to anon, authenticated using (true);
drop policy if exists news_public_read on public.news;
create policy news_public_read on public.news for select to anon, authenticated using (published_at <= now());
drop policy if exists product_groups_public_read on public.product_groups;
create policy product_groups_public_read on public.product_groups for select to anon, authenticated using (true);

-- Only aggregatory-newsletter audience_sync (service role / secret key) calls this.
revoke execute on function public.export_newsletter_contacts_for_sync(text, text, text[]) from public, anon, authenticated;
grant execute on function public.export_newsletter_contacts_for_sync(text, text, text[]) to service_role;
