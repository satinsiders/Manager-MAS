-- Rename curricula tables and related objects to studyplans
alter table if exists curricula rename to studyplans;
alter table if exists curricula_drafts rename to studyplan_drafts;

-- Rename jsonb columns
alter table if exists studyplans rename column curriculum to studyplan;
alter table if exists studyplan_drafts rename column curriculum to studyplan;

-- Rename index and foreign key
alter index if exists curricula_version_student_idx rename to studyplans_version_student_idx;
alter table if exists studyplans rename constraint curricula_student_id_fkey to studyplans_student_id_fkey;

-- Rename trigger enforcing append-only behavior
alter table if exists studyplans rename trigger prevent_modify_curricula to prevent_modify_studyplans;

-- Rename policies on studyplans
alter policy if exists select_curricula on studyplans rename to select_studyplans;
alter policy if exists insert_curricula on studyplans rename to insert_studyplans;
alter policy if exists update_curricula_denied on studyplans rename to update_studyplans_denied;
alter policy if exists delete_curricula_denied on studyplans rename to delete_studyplans_denied;

-- Rename policies on studyplan_drafts
alter policy if exists select_curricula_drafts on studyplan_drafts rename to select_studyplan_drafts;
alter policy if exists insert_curricula_drafts on studyplan_drafts rename to insert_studyplan_drafts;
alter policy if exists update_curricula_drafts on studyplan_drafts rename to update_studyplan_drafts;
alter policy if exists delete_curricula_drafts on studyplan_drafts rename to delete_studyplan_drafts;

-- Rename student pointer column
alter table if exists students rename column current_curriculum_version to current_studyplan_version;

-- Update restrict_student_updates function to new column name
create or replace function restrict_student_updates()
returns trigger as $$
begin
  if (row_to_json(NEW)::jsonb
        - 'current_studyplan_version'
        - 'active'
        - 'last_lesson_sent'
        - 'last_lesson_id'
     ) is distinct from (row_to_json(OLD)::jsonb
        - 'current_studyplan_version'
        - 'active'
        - 'last_lesson_sent'
        - 'last_lesson_id') then
    raise exception 'Only current_studyplan_version, active, last_lesson_sent, and last_lesson_id can be updated';
  end if;
  return NEW;
end;
$$ language plpgsql;
