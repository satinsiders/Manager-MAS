-- Track mastery status per question type
create table if not exists student_progress (
  student_id uuid references students(id),
  question_type text not null,
  mastered bool default false,
  last_updated timestamptz default now(),
  primary key (student_id, question_type)
);
