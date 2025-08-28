-- Add preferred_topics to students
alter table students add column preferred_topics text[] default '{}';
