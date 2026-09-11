-- ============================================================
-- MENARC POS v2 — Supabase RLS + RPC
-- Matches your real schema: inventory, sales, sale_items, returns, profiles
-- No tables are created or altered — only RLS policies and one function.
-- Safe to run more than once. Run in: Supabase Dashboard → SQL Editor
-- ============================================================

alter table public.inventory  enable row level security;
alter table public.sales      enable row level security;
alter table public.sale_items enable row level security;
alter table public.returns    enable row level security;
alter table public.profiles   enable row level security;


-- 1. INVENTORY — readable by anyone (POS terminal needs live stock),
--    writable only by logged-in staff.
drop policy if exists "inventory_select_all" on public.inventory;
create policy "inventory_select_all" on public.inventory for select to anon, authenticated using (true);

drop policy if exists "inventory_insert_authenticated" on public.inventory;
create policy "inventory_insert_authenticated" on public.inventory for insert to authenticated with check (true);

drop policy if exists "inventory_update_authenticated" on public.inventory;
create policy "inventory_update_authenticated" on public.inventory for update to authenticated using (true) with check (true);

drop policy if exists "inventory_delete_authenticated" on public.inventory;
create policy "inventory_delete_authenticated" on public.inventory for delete to authenticated using (true);


-- 2. SALES + SALE_ITEMS — no anon write policy at all. The POS terminal
--    never touches these tables directly; every write goes through
--    record_sale() below (SECURITY DEFINER, bypasses RLS in a controlled way).
drop policy if exists "sales_select_authenticated" on public.sales;
create policy "sales_select_authenticated" on public.sales for select to authenticated using (true);

drop policy if exists "sales_insert_authenticated" on public.sales;
create policy "sales_insert_authenticated" on public.sales for insert to authenticated with check (true);

drop policy if exists "sale_items_select_authenticated" on public.sale_items;
create policy "sale_items_select_authenticated" on public.sale_items for select to authenticated using (true);

drop policy if exists "sale_items_insert_authenticated" on public.sale_items;
create policy "sale_items_insert_authenticated" on public.sale_items for insert to authenticated with check (true);


-- 3. RETURNS — locked to staff, no UI built yet.
drop policy if exists "returns_all_authenticated" on public.returns;
create policy "returns_all_authenticated" on public.returns for all to authenticated using (true) with check (true);


-- 4. PROFILES — anon can read active staff names only (for the POS cashier
--    picker on a login-free terminal). Full row access + self-update for staff.
drop policy if exists "profiles_select_active_names" on public.profiles;
create policy "profiles_select_active_names" on public.profiles for select to anon using (active = true);

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated" on public.profiles for select to authenticated using (true);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);


-- 5. record_sale() — the only write path open to the public checkout terminal.
-- Items: [{ "sku": "...", "qty": 2, "item_rate": 499, "discount": 0 }, ...]
-- Row-locks inventory, validates stock, writes the sale header + line items,
-- and decrements stock — all in one transaction.
create or replace function public.record_sale(
  p_items jsonb,
  p_offline_ref text default null,
  p_staff_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale_id uuid;
  v_item jsonb;
  v_sku text;
  v_qty integer;
  v_rate numeric;
  v_discount numeric;
  v_final numeric;
  v_current_qty integer;
  v_subtotal numeric := 0;
  v_discount_total numeric := 0;
  v_total numeric := 0;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Cannot record a sale with no items';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_sku := v_item->>'sku';
    v_qty := (v_item->>'qty')::integer;
    v_rate := (v_item->>'item_rate')::numeric;
    v_discount := coalesce((v_item->>'discount')::numeric, 0);

    if v_qty is null or v_qty <= 0 then
      raise exception 'Invalid quantity for %', v_sku;
    end if;

    select current_quantity into v_current_qty from public.inventory where sku = v_sku for update;

    if v_current_qty is null then
      raise exception 'SKU % not found', v_sku;
    end if;

    if v_current_qty < v_qty then
      raise exception 'Insufficient stock for %: have %, need %', v_sku, v_current_qty, v_qty;
    end if;

    v_subtotal := v_subtotal + (v_rate * v_qty);
    v_discount_total := v_discount_total + v_discount;
    v_total := v_total + ((v_rate * v_qty) - v_discount);
  end loop;

  insert into public.sales (staff_id, subtotal, discount_total, total, status, offline_ref)
  values (p_staff_id, v_subtotal, v_discount_total, v_total, 'completed', p_offline_ref)
  returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_sku := v_item->>'sku';
    v_qty := (v_item->>'qty')::integer;
    v_rate := (v_item->>'item_rate')::numeric;
    v_discount := coalesce((v_item->>'discount')::numeric, 0);
    v_final := (v_rate * v_qty) - v_discount;

    insert into public.sale_items (sale_id, sku, qty, item_rate, discount, final_value)
    values (v_sale_id, v_sku, v_qty, v_rate, v_discount, v_final);

    update public.inventory set current_quantity = current_quantity - v_qty where sku = v_sku;
  end loop;

  return v_sale_id;
end;
$$;

drop function if exists public.decrement_stock(text, integer);

grant execute on function public.record_sale(jsonb, text, uuid) to anon, authenticated;
