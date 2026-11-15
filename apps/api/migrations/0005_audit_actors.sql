alter table promotions
  add column cancelled_by uuid;

alter table price_labels
  add column printed_by uuid,
  add column removed_by uuid;

alter table store_alerts
  add column read_by uuid;
