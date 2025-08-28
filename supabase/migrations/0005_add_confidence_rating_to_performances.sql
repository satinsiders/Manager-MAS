-- Add confidence_rating to performances
alter table performances
  add column confidence_rating numeric;
