create table sync_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  store_id uuid not null,
  source_system text not null,
  status varchar(24) not null default 'received',
  rows_received integer not null default 0,
  products_created integer not null default 0,
  prices_changed integer not null default 0,
  error_summary text,
  requested_by uuid not null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  constraint sync_runs_status_check check (status in ('received', 'processing', 'applied', 'failed')),
  constraint sync_runs_organization_store_fk
    foreign key (organization_id, store_id)
    references stores(organization_id, id) on delete cascade,
  constraint sync_runs_organization_store_id_uq unique (organization_id, store_id, id)
);

create index sync_runs_store_created_idx on sync_runs(store_id, created_at);

create table sync_staging_prices (
  organization_id uuid not null,
  store_id uuid not null,
  sync_run_id uuid not null,
  product_id uuid not null,
  source_system text not null,
  external_key text not null,
  product_name text not null,
  unit varchar(16) not null,
  amount numeric(12, 2) not null,
  row_number integer not null,
  constraint sync_staging_prices_amount_check check (amount >= 0),
  constraint sync_staging_prices_run_fk
    foreign key (organization_id, store_id, sync_run_id)
    references sync_runs(organization_id, store_id, id) on delete cascade,
  constraint sync_staging_prices_store_fk
    foreign key (organization_id, store_id)
    references stores(organization_id, id) on delete cascade,
  constraint sync_staging_prices_product_fk
    foreign key (organization_id, product_id)
    references products(organization_id, id) on delete cascade,
  constraint sync_staging_prices_run_row_uq unique (sync_run_id, row_number)
);

create index sync_staging_prices_run_idx on sync_staging_prices(sync_run_id);

create table price_change_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  store_id uuid not null,
  product_id uuid not null,
  sync_run_id uuid not null,
  old_amount numeric(12, 2),
  new_amount numeric(12, 2) not null,
  occurred_at timestamptz not null default now(),
  constraint price_change_events_new_amount_check check (new_amount >= 0),
  constraint price_change_events_old_amount_check check (old_amount is null or old_amount >= 0),
  constraint price_change_events_run_fk
    foreign key (organization_id, store_id, sync_run_id)
    references sync_runs(organization_id, store_id, id) on delete cascade,
  constraint price_change_events_store_fk
    foreign key (organization_id, store_id)
    references stores(organization_id, id) on delete cascade,
  constraint price_change_events_product_fk
    foreign key (organization_id, product_id)
    references products(organization_id, id) on delete cascade,
  constraint price_change_events_run_product_uq unique (sync_run_id, product_id)
);

create index price_change_events_store_time_idx on price_change_events(store_id, occurred_at);
