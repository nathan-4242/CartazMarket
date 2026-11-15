create table promotions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  store_id uuid not null,
  product_id uuid not null,
  regular_amount numeric(12, 2) not null,
  promotional_amount numeric(12, 2) not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  constraint promotions_regular_amount_check check (regular_amount > 0),
  constraint promotions_promotional_amount_check check (promotional_amount >= 0 and promotional_amount < regular_amount),
  constraint promotions_period_check check (ends_at > starts_at),
  constraint promotions_organization_store_fk
    foreign key (organization_id, store_id)
    references stores(organization_id, id) on delete cascade,
  constraint promotions_organization_product_fk
    foreign key (organization_id, product_id)
    references products(organization_id, id) on delete cascade,
  constraint promotions_organization_store_product_id_uq
    unique (organization_id, store_id, product_id, id)
);

create index promotions_store_period_idx on promotions(store_id, starts_at, ends_at);
create index promotions_product_period_idx on promotions(store_id, product_id, starts_at, ends_at)
  where cancelled_at is null;

create table price_labels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  store_id uuid not null,
  product_id uuid not null,
  promotion_id uuid,
  regular_amount numeric(12, 2) not null,
  display_amount numeric(12, 2) not null,
  promotion_starts_at timestamptz,
  removal_due_at timestamptz,
  status varchar(24) not null default 'ready_to_print',
  created_by uuid not null,
  created_at timestamptz not null default now(),
  printed_at timestamptz,
  removed_at timestamptz,
  constraint price_labels_regular_amount_check check (regular_amount >= 0),
  constraint price_labels_display_amount_check check (display_amount >= 0),
  constraint price_labels_status_check check (status in ('ready_to_print', 'printed', 'removed', 'cancelled')),
  constraint price_labels_print_timestamp_check check (status <> 'printed' or printed_at is not null),
  constraint price_labels_removed_timestamp_check check (status <> 'removed' or removed_at is not null),
  constraint price_labels_promotion_snapshot_check check (
    (promotion_id is null and promotion_starts_at is null and removal_due_at is null)
    or (promotion_id is not null and promotion_starts_at is not null and removal_due_at is not null)
  ),
  constraint price_labels_organization_store_fk
    foreign key (organization_id, store_id)
    references stores(organization_id, id) on delete cascade,
  constraint price_labels_organization_product_fk
    foreign key (organization_id, product_id)
    references products(organization_id, id) on delete cascade,
  constraint price_labels_promotion_fk
    foreign key (organization_id, store_id, product_id, promotion_id)
    references promotions(organization_id, store_id, product_id, id) on delete restrict
);

create index price_labels_store_created_idx on price_labels(store_id, created_at desc);
create index price_labels_removal_due_idx on price_labels(store_id, removal_due_at)
  where status = 'printed' and removal_due_at is not null;
