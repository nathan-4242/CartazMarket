create table product_expiry_lots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  store_id uuid not null,
  product_id uuid not null,
  lot_code text,
  expires_on date not null,
  remaining_quantity numeric(12, 3),
  status varchar(16) not null default 'active',
  last_review_action varchar(24),
  last_review_note text,
  last_reviewed_at timestamptz,
  last_reviewed_by uuid,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by uuid,
  constraint product_expiry_lots_quantity_check check (remaining_quantity is null or remaining_quantity >= 0),
  constraint product_expiry_lots_status_check check (status in ('active', 'closed')),
  constraint product_expiry_lots_review_action_check check (last_review_action is null or last_review_action in ('no_change', 'discount', 'sold_out', 'removed')),
  constraint product_expiry_lots_closed_timestamp_check check (status <> 'closed' or closed_at is not null),
  constraint product_expiry_lots_store_fk
    foreign key (organization_id, store_id)
    references stores(organization_id, id) on delete cascade,
  constraint product_expiry_lots_product_fk
    foreign key (organization_id, product_id)
    references products(organization_id, id) on delete cascade,
  constraint product_expiry_lots_organization_store_id_uq unique (organization_id, store_id, id)
);

create index product_expiry_lots_store_expiry_idx
  on product_expiry_lots(store_id, expires_on)
  where status = 'active';

create table product_expiry_alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  store_id uuid not null,
  lot_id uuid not null,
  alert_type varchar(16) not null,
  status varchar(24) not null default 'unread',
  created_at timestamptz not null default now(),
  read_at timestamptz,
  resolved_at timestamptz,
  read_by uuid,
  resolved_by uuid,
  constraint product_expiry_alerts_type_check check (alert_type in ('30_day', '7_day', 'expiry_day')),
  constraint product_expiry_alerts_status_check check (status in ('unread', 'read', 'resolved')),
  constraint product_expiry_alerts_read_timestamp_check check (status <> 'read' or read_at is not null),
  constraint product_expiry_alerts_resolved_timestamp_check check (status <> 'resolved' or resolved_at is not null),
  constraint product_expiry_alerts_store_fk
    foreign key (organization_id, store_id)
    references stores(organization_id, id) on delete cascade,
  constraint product_expiry_alerts_lot_fk
    foreign key (organization_id, store_id, lot_id)
    references product_expiry_lots(organization_id, store_id, id) on delete cascade,
  constraint product_expiry_alerts_lot_type_uq unique (lot_id, alert_type)
);

create index product_expiry_alerts_store_status_created_idx
  on product_expiry_alerts(store_id, status, created_at desc);
