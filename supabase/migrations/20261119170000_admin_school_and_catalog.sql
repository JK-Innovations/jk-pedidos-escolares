-- Panel de Norma: crear un colegio con su período y grupos, y guardar prendas.
-- Ejecutar completo en el SQL Editor de Supabase (proyecto oavhgokdtohrwifjjiqs).
-- No toca pedidos, líneas, entregas, el trigger de correo ni public_submit_order.
-- Se puede volver a ejecutar: las funciones se reemplazan y las políticas solo se crean si faltan.
-- Después de ejecutarlo, Norma puede usar «Agregar escuela» y «Agregar prenda» en el panel.
-- Hasta entonces el panel avisa que falta este SQL. El formulario público no cambia.

begin;

-- Escritura de catálogo para quien ya es admin. La lectura del formulario público sigue en las RPC public_*.
do $$
declare
  t text;
begin
  foreach t in array array['schools', 'periods', 'groups', 'products']
  loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t and policyname = 'admin_all'
    ) then
      execute format(
        'create policy admin_all on public.%I for all using (public.is_admin()) with check (public.is_admin())',
        t
      );
    end if;
  end loop;
end $$;

create or replace function public.admin_create_school(
  p_name text,
  p_collector text,
  p_contact text,
  p_logo text,
  p_open date,
  p_close date,
  p_mode text,
  p_groups jsonb
) returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_school uuid;
  v_period uuid;
  v_slug text;
  g jsonb;
  n int := 0;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if length(trim(coalesce(p_name, ''))) not between 1 and 200 then raise exception 'school_name_required'; end if;
  if p_open is null or p_close is null or p_close < p_open then raise exception 'dates'; end if;
  if coalesce(p_mode, 'mixed') not in ('coord', 'each', 'mixed') then raise exception 'invalid_mode'; end if;
  if p_groups is not null and jsonb_typeof(p_groups) <> 'array' then raise exception 'invalid_group'; end if;
  if p_groups is not null and jsonb_array_length(p_groups) > 80 then raise exception 'invalid_group'; end if;

  insert into public.schools (name, collector, contact, logo_path)
  values (
    trim(p_name),
    left(coalesce(p_collector, ''), 200),
    left(coalesce(p_contact, ''), 200),
    nullif(left(trim(coalesce(p_logo, '')), 300), '')
  )
  returning id into v_school;

  insert into public.periods (school_id, open_date, close_date, mode, status)
  values (v_school, p_open, p_close, coalesce(p_mode, 'mixed'), 'pending')
  returning id into v_period;

  select slug into v_slug from public.periods where id = v_period;

  if p_groups is not null then
    for g in select * from jsonb_array_elements(p_groups) loop
      if length(trim(coalesce(g ->> 'teacher', ''))) = 0 then continue; end if;
      if length(trim(g ->> 'teacher')) > 120 then raise exception 'invalid_group'; end if;
      n := n + 1;
      insert into public.groups (period_id, teacher, grade, room, sort)
      values (
        v_period,
        trim(g ->> 'teacher'),
        left(coalesce(g ->> 'grade', ''), 40),
        left(coalesce(g ->> 'room', ''), 40),
        n
      );
    end loop;
  end if;

  return jsonb_build_object('school_id', v_school, 'period_id', v_period, 'slug', v_slug);
end $$;

create or replace function public.admin_update_school(
  p_school uuid,
  p_name text,
  p_collector text,
  p_contact text,
  p_logo text
) returns void
language plpgsql
security definer
set search_path to public
as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if length(trim(coalesce(p_name, ''))) not between 1 and 200 then raise exception 'school_name_required'; end if;
  update public.schools
  set name = trim(p_name),
      collector = left(coalesce(p_collector, ''), 200),
      contact = left(coalesce(p_contact, ''), 200),
      logo_path = nullif(left(trim(coalesce(p_logo, '')), 300), '')
  where id = p_school;
  if not found then raise exception 'not_found'; end if;
end $$;

create or replace function public.admin_save_product(
  p_period uuid,
  p_id uuid,
  p_product jsonb
) returns uuid
language plpgsql
security definer
set search_path to public
as $$
declare
  v_id uuid;
  v_name jsonb;
  v_sizes jsonb;
  v_colors jsonb;
  v_models jsonb;
  v_map jsonb;
  v_child int;
  v_adult int;
  v_cat text;
  v_pers text;
  v_key text;
  v_price numeric;
  v_ages text[];
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_period is null or not exists (select 1 from public.periods where id = p_period) then raise exception 'not_found'; end if;
  if p_product is null or jsonb_typeof(p_product) <> 'object' then raise exception 'product_invalid'; end if;

  v_name := p_product -> 'name';
  if v_name is null or (length(trim(coalesce(v_name ->> 'es', ''))) = 0 and length(trim(coalesce(v_name ->> 'en', ''))) = 0) then
    raise exception 'product_invalid';
  end if;
  if length(coalesce(v_name ->> 'es', '')) > 80 or length(coalesce(v_name ->> 'en', '')) > 80 then
    raise exception 'product_invalid';
  end if;

  v_cat := coalesce(p_product ->> 'category', 'school');
  v_pers := coalesce(p_product ->> 'personalization', 'none');
  if v_cat not in ('school', 'staff') or v_pers not in ('none', 'name', 'nameNumber') then
    raise exception 'product_invalid';
  end if;

  v_sizes := p_product -> 'sizes';
  if v_sizes is null or jsonb_typeof(v_sizes) <> 'object' then raise exception 'product_invalid'; end if;
  v_child := case when jsonb_typeof(v_sizes -> 'child') = 'array' then jsonb_array_length(v_sizes -> 'child') else 0 end;
  v_adult := case when jsonb_typeof(v_sizes -> 'adult') = 'array' then jsonb_array_length(v_sizes -> 'adult') else 0 end;
  if v_child + v_adult < 1 or v_child > 24 or v_adult > 24 then raise exception 'product_invalid'; end if;

  v_colors := p_product -> 'colors';
  if v_colors is null or jsonb_typeof(v_colors) <> 'array' or jsonb_array_length(v_colors) not between 1 and 24 then
    raise exception 'product_invalid';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_colors) c
    where coalesce(c ->> 'id', '') = '' or coalesce(c ->> 'es', c ->> 'en', '') = ''
  ) then
    raise exception 'product_invalid';
  end if;

  v_models := coalesce(p_product -> 'models', '[]'::jsonb);
  if jsonb_typeof(v_models) <> 'array' or jsonb_array_length(v_models) > 12 then raise exception 'product_invalid'; end if;

  v_map := coalesce(p_product -> 'price_map', '{}'::jsonb);
  if jsonb_typeof(v_map) <> 'object' then raise exception 'product_invalid'; end if;

  v_key := nullif(trim(coalesce(p_product ->> 'key', '')), '');
  if v_key is null or length(v_key) > 80 then raise exception 'product_invalid'; end if;
  if length(coalesce(p_product ->> 'design', '')) > 80 then raise exception 'product_invalid'; end if;

  if p_product -> 'base_price' is null or jsonb_typeof(p_product -> 'base_price') = 'null' then
    v_price := null;
  else
    begin
      v_price := (p_product ->> 'base_price')::numeric;
    exception when others then
      raise exception 'product_invalid';
    end;
    if v_price < 0 or v_price > 10000 then raise exception 'product_invalid'; end if;
  end if;

  v_ages := '{}';
  if jsonb_typeof(p_product -> 'ages') = 'array' then
    select coalesce(array_agg(x), '{}') into v_ages
    from jsonb_array_elements_text(p_product -> 'ages') x
    where x in ('child', 'adult');
  end if;
  if v_ages is null or cardinality(v_ages) = 0 then
    v_ages := array_remove(array[case when v_child > 0 then 'child' end, case when v_adult > 0 then 'adult' end]::text[], null);
  end if;

  if p_id is null then
    insert into public.products (
      period_id, key, category, name, design, personalization, base_price, price_map,
      ages, sizes, pending_sizes, sizes_pending, models, colors, photo, enabled, sort
    ) values (
      p_period, v_key, v_cat, v_name, coalesce(p_product ->> 'design', ''), v_pers, v_price, v_map,
      v_ages, v_sizes, '{}', false, v_models, v_colors,
      nullif(left(trim(coalesce(p_product ->> 'photo', '')), 300), ''),
      coalesce((p_product ->> 'enabled')::boolean, true),
      coalesce((p_product ->> 'sort')::int, 500)
    )
    returning id into v_id;
  else
    update public.products set
      key = v_key,
      category = v_cat,
      name = v_name,
      design = coalesce(p_product ->> 'design', ''),
      personalization = v_pers,
      base_price = v_price,
      price_map = v_map,
      ages = v_ages,
      sizes = v_sizes,
      sizes_pending = false,
      models = v_models,
      colors = v_colors,
      photo = nullif(left(trim(coalesce(p_product ->> 'photo', '')), 300), ''),
      sort = coalesce((p_product ->> 'sort')::int, sort)
    where id = p_id and period_id = p_period
    returning id into v_id;
    if v_id is null then raise exception 'not_found'; end if;
  end if;

  return v_id;
end $$;

create or replace function public.admin_set_product_enabled(p_id uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path to public
as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.products set enabled = coalesce(p_enabled, false) where id = p_id;
  if not found then raise exception 'not_found'; end if;
end $$;

revoke all on function public.admin_create_school(text, text, text, text, date, date, text, jsonb) from public;
revoke all on function public.admin_create_school(text, text, text, text, date, date, text, jsonb) from anon;
grant execute on function public.admin_create_school(text, text, text, text, date, date, text, jsonb) to authenticated;
grant execute on function public.admin_create_school(text, text, text, text, date, date, text, jsonb) to service_role;

revoke all on function public.admin_update_school(uuid, text, text, text, text) from public;
revoke all on function public.admin_update_school(uuid, text, text, text, text) from anon;
grant execute on function public.admin_update_school(uuid, text, text, text, text) to authenticated;
grant execute on function public.admin_update_school(uuid, text, text, text, text) to service_role;

revoke all on function public.admin_save_product(uuid, uuid, jsonb) from public;
revoke all on function public.admin_save_product(uuid, uuid, jsonb) from anon;
grant execute on function public.admin_save_product(uuid, uuid, jsonb) to authenticated;
grant execute on function public.admin_save_product(uuid, uuid, jsonb) to service_role;

revoke all on function public.admin_set_product_enabled(uuid, boolean) from public;
revoke all on function public.admin_set_product_enabled(uuid, boolean) from anon;
grant execute on function public.admin_set_product_enabled(uuid, boolean) to authenticated;
grant execute on function public.admin_set_product_enabled(uuid, boolean) to service_role;

commit;
