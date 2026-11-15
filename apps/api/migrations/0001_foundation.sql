create extension if not exists pgcrypto;

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table stores (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  code text not null,
  name text not null,
  time_zone text not null default 'America/Sao_Paulo',
  created_at timestamptz not null default now(),
  constraint stores_organization_id_id_uq unique (organization_id, id),
  constraint stores_organization_id_code_uq unique (organization_id, code)
);

create table organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  auth_user_id uuid not null,
  role varchar(24) not null default 'operator',
  created_at timestamptz not null default now(),
  constraint organization_memberships_role_check check (role in ('owner', 'manager', 'operator')),
  constraint organization_memberships_organization_user_uq unique (organization_id, auth_user_id)
);

create index organization_memberships_auth_user_idx on organization_memberships(auth_user_id);

create table products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  unit varchar(16) not null default 'UN',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_organization_id_id_uq unique (organization_id, id)
);

create index products_organization_name_idx on products(organization_id, name);

create table external_product_keys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  product_id uuid not null,
  source_system text not null,
  external_key text not null,
  created_at timestamptz not null default now(),
  constraint external_product_keys_organization_product_fk
    foreign key (organization_id, product_id)
    references products(organization_id, id) on delete cascade,
  constraint external_product_keys_source_key_uq
    unique (organization_id, source_system, external_key)
);

create index external_product_keys_product_idx on external_product_keys(organization_id, product_id);

create table store_prices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  store_id uuid not null,
  product_id uuid not null,
  amount numeric(12, 2) not null,
  currency varchar(3) not null default 'BRL',
  source_updated_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint store_prices_nonnegative_amount_check check (amount >= 0),
  constraint store_prices_brl_currency_check check (currency = 'BRL'),
  constraint store_prices_organization_store_fk
    foreign key (organization_id, store_id)
    references stores(organization_id, id) on delete cascade,
  constraint store_prices_organization_product_fk
    foreign key (organization_id, product_id)
    references products(organization_id, id) on delete cascade,
  constraint store_prices_store_product_uq unique (store_id, product_id)
);

create index store_prices_organization_store_idx on store_prices(organization_id, store_id);
