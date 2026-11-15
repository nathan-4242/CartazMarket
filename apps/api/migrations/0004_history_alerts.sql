alter table price_labels
  add constraint price_labels_organization_store_id_uq unique (organization_id, store_id, id);

create table store_alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  store_id uuid not null,
  label_id uuid not null,
  alert_type varchar(40) not null default 'label_removal_due',
  status varchar(24) not null default 'unread',
  created_at timestamptz not null default now(),
  read_at timestamptz,
  resolved_at timestamptz,
  constraint store_alerts_type_check check (alert_type = 'label_removal_due'),
  constraint store_alerts_status_check check (status in ('unread', 'read', 'resolved')),
  constraint store_alerts_read_timestamp_check check (status <> 'read' or read_at is not null),
  constraint store_alerts_resolved_timestamp_check check (status <> 'resolved' or resolved_at is not null),
  constraint store_alerts_organization_store_fk
    foreign key (organization_id, store_id)
    references stores(organization_id, id) on delete cascade,
  constraint store_alerts_label_fk
    foreign key (organization_id, store_id, label_id)
    references price_labels(organization_id, store_id, id) on delete cascade,
  constraint store_alerts_label_type_uq unique (alert_type, label_id)
);

create index store_alerts_store_status_created_idx
  on store_alerts(store_id, status, created_at desc);
