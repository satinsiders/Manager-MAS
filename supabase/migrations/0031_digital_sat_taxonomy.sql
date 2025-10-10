-- Digital SAT taxonomy, structure, and mastery alignment
create extension if not exists pgcrypto;

-- Core assessment catalog for exams we support
create table if not exists assessments (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  total_questions int,
  total_minutes int,
  description text,
  source_url text,
  created_at timestamptz default now()
);

alter table assessments enable row level security;
drop policy if exists select_assessments on assessments;
create policy select_assessments on assessments for select using (true);
drop policy if exists insert_assessments on assessments;
create policy insert_assessments on assessments for insert with check (true);
drop policy if exists update_assessments on assessments;
create policy update_assessments on assessments for update using (true) with check (true);

-- Sections inside an assessment (e.g., Reading & Writing, Math)
create table if not exists assessment_sections (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references assessments(id) on delete cascade,
  code text not null,
  name text not null,
  order_index int not null default 0,
  total_questions int,
  total_minutes int,
  module_count int,
  description text,
  notes text,
  created_at timestamptz default now(),
  unique (assessment_id, code)
);

alter table assessment_sections enable row level security;
drop policy if exists select_assessment_sections on assessment_sections;
create policy select_assessment_sections on assessment_sections for select using (true);
drop policy if exists insert_assessment_sections on assessment_sections;
create policy insert_assessment_sections on assessment_sections for insert with check (true);
drop policy if exists update_assessment_sections on assessment_sections;
create policy update_assessment_sections on assessment_sections for update using (true) with check (true);

-- Individual modules inside a section (used for timing + adaptive info)
create table if not exists assessment_modules (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references assessment_sections(id) on delete cascade,
  code text not null,
  name text not null,
  order_index int not null,
  question_count int,
  time_minutes int,
  adaptive boolean default false,
  notes text,
  created_at timestamptz default now(),
  unique (section_id, code),
  unique (section_id, order_index)
);

alter table assessment_modules enable row level security;
drop policy if exists select_assessment_modules on assessment_modules;
create policy select_assessment_modules on assessment_modules for select using (true);
drop policy if exists insert_assessment_modules on assessment_modules;
create policy insert_assessment_modules on assessment_modules for insert with check (true);
drop policy if exists update_assessment_modules on assessment_modules;
create policy update_assessment_modules on assessment_modules for update using (true) with check (true);

-- Domains (a.k.a. content categories) that question types roll up to
create table if not exists question_type_domains (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references assessment_sections(id) on delete cascade,
  code text not null,
  name text not null,
  description text not null,
  approx_question_percentage numeric(5,2),
  questions_min int,
  questions_max int,
  grouping_notes text,
  source_url text,
  created_at timestamptz default now(),
  unique (section_id, code)
);

alter table question_type_domains enable row level security;
drop policy if exists select_question_type_domains on question_type_domains;
create policy select_question_type_domains on question_type_domains for select using (true);
drop policy if exists insert_question_type_domains on question_type_domains;
create policy insert_question_type_domains on question_type_domains for insert with check (true);
drop policy if exists update_question_type_domains on question_type_domains;
create policy update_question_type_domains on question_type_domains for update using (true) with check (true);

-- Enrich question_types with assessment metadata
alter table question_types
  add column if not exists assessment_code text,
  add column if not exists section_code text,
  add column if not exists domain_id uuid references question_type_domains(id) on delete set null,
  add column if not exists skill_code text,
  add column if not exists display_name text,
  add column if not exists skill_description text,
  add column if not exists source_url text,
  add column if not exists metadata jsonb default '{}'::jsonb;

update question_types set metadata = '{}'::jsonb where metadata is null;

-- Link study plan progress to the taxonomy for mastery tracking
alter table study_plan_progress
  add column if not exists question_type_id uuid references question_types(id);

create index if not exists spp_question_type_id_idx on study_plan_progress(question_type_id);

alter table performances
  add column if not exists question_type_id uuid references question_types(id);

create index if not exists performances_question_type_id_idx on performances(question_type_id);

update study_plan_progress spp
set question_type_id = qt.id
from question_types qt
where spp.question_type_id is null
  and lower(trim(spp.question_type)) in (
    lower(qt.specific_type),
    lower(qt.canonical_path),
    lower(qt.display_name)
  );

update performances p
set question_type_id = qt.id
from question_types qt
where p.question_type_id is null
  and lower(trim(p.question_type)) in (
    lower(qt.specific_type),
    lower(qt.canonical_path),
    lower(qt.display_name)
  );

-- Enriched view surfacing question type context alongside mastery
drop view if exists public.question_type_mastery cascade;
create view public.question_type_mastery security invoker as
select
  spp.id as study_plan_progress_id,
  spp.student_id,
  spp.study_plan_id,
  spp.question_type,
  spp.question_type_id,
  spp.status,
  spp.evidence_window,
  spp.rolling_metrics,
  spp.last_decision_at,
  spp.created_at,
  qt.assessment_code,
  qt.section_code,
  qt.domain,
  qt.category,
  qt.specific_type,
  qt.display_name,
  qt.canonical_path,
  qt.skill_code,
  qt.skill_description,
  qt.source_url,
  qt.metadata,
  qd.code as domain_code,
  qd.name as domain_name,
  qd.description as domain_description,
  qd.approx_question_percentage,
  qd.questions_min,
  qd.questions_max,
  qd.grouping_notes,
  qd.source_url as domain_source_url,
  sec.code as section_code_reference,
  sec.name as section_name,
  sec.total_questions as section_total_questions,
  sec.total_minutes as section_total_minutes,
  sec.module_count as section_module_count,
  sec.description as section_description,
  sec.notes as section_notes,
  asm.code as assessment_code_reference,
  asm.name as assessment_name,
  asm.total_questions as assessment_total_questions,
  asm.total_minutes as assessment_total_minutes,
  asm.description as assessment_description,
  asm.source_url as assessment_source_url
from study_plan_progress spp
left join question_types qt on qt.id = spp.question_type_id
left join question_type_domains qd on qd.id = qt.domain_id
left join assessment_sections sec on sec.id = qd.section_id
left join assessments asm on asm.id = sec.assessment_id;

-- Digital SAT assessment, sections, modules, domains, and question types
with upsert_assessment as (
  insert into assessments (code, name, total_questions, total_minutes, description, source_url)
  values (
    'digital_sat',
    'Digital SAT',
    98,
    134,
    'Two-section adaptive exam covering Reading and Writing plus Math. Second module difficulty adapts to first-module performance. 10-minute break between sections.',
    'https://satsuite.collegeboard.org/sat/digital'
  )
  on conflict (code) do update
  set name = excluded.name,
      total_questions = excluded.total_questions,
      total_minutes = excluded.total_minutes,
      description = excluded.description,
      source_url = excluded.source_url
  returning id
),
reading_section as (
  insert into assessment_sections (assessment_id, code, name, order_index, total_questions, total_minutes, module_count, description, notes)
  select
    id,
    'reading_writing',
    'Reading and Writing',
    1,
    54,
    64,
    2,
    'Evaluates comprehension, analysis, rhetoric, and command of standard English in adaptive modules.',
    'Second module difficulty adapts to module 1. 10-minute break follows module 2 before Math.'
  from upsert_assessment
  on conflict (assessment_id, code) do update
  set name = excluded.name,
      order_index = excluded.order_index,
      total_questions = excluded.total_questions,
      total_minutes = excluded.total_minutes,
      module_count = excluded.module_count,
      description = excluded.description,
      notes = excluded.notes
  returning id
),
math_section as (
  insert into assessment_sections (assessment_id, code, name, order_index, total_questions, total_minutes, module_count, description, notes)
  select
    id,
    'math',
    'Math',
    2,
    44,
    70,
    2,
    'Assesses algebraic fluency, advanced math readiness, quantitative reasoning, and geometry/trigonometry with full calculator access.',
    'Calculator permitted for both modules. Module 2 difficulty adapts to module 1.'
  from upsert_assessment
  on conflict (assessment_id, code) do update
  set name = excluded.name,
      order_index = excluded.order_index,
      total_questions = excluded.total_questions,
      total_minutes = excluded.total_minutes,
      module_count = excluded.module_count,
      description = excluded.description,
      notes = excluded.notes
  returning id
),
modules as (
  insert into assessment_modules (section_id, code, name, order_index, question_count, time_minutes, adaptive, notes)
  values
    ((select id from reading_section), 'rw_module_1', 'Reading and Writing Module 1', 1, 27, 32, false, 'Mixed-difficulty module establishing baseline performance.'),
    ((select id from reading_section), 'rw_module_2', 'Reading and Writing Module 2', 2, 27, 32, true, 'Adaptive module calibrated on module 1 results.'),
    ((select id from math_section), 'math_module_1', 'Math Module 1', 1, 22, 35, false, 'Mixed-difficulty module covering all math domains.'),
    ((select id from math_section), 'math_module_2', 'Math Module 2', 2, 22, 35, true, 'Adaptive module calibrated on module 1 results.')
  on conflict (section_id, code) do update
  set name = excluded.name,
      order_index = excluded.order_index,
      question_count = excluded.question_count,
      time_minutes = excluded.time_minutes,
      adaptive = excluded.adaptive,
      notes = excluded.notes
  returning section_id, code, id
),
domains as (
  insert into question_type_domains (section_id, code, name, description, approx_question_percentage, questions_min, questions_max, grouping_notes, source_url)
  values
    (
      (select id from reading_section),
      'information_ideas',
      'Information and Ideas',
      'Comprehension, analysis, and reasoning with textual and quantitative evidence drawn from a range of academic and occupational contexts.',
      26.00,
      12,
      14,
      'Questions grouped by related skills and ordered from least to most difficult within each module.',
      'https://satsuite.collegeboard.org/sat/digital'
    ),
    (
      (select id from reading_section),
      'craft_structure',
      'Craft and Structure',
      'Vocabulary, rhetorical analysis, and synthesis of topic-related texts to determine how language choices shape meaning and purpose.',
      28.00,
      13,
      15,
      'Questions clustered by skill emphasis and increase in difficulty within modules.',
      'https://satsuite.collegeboard.org/sat/digital'
    ),
    (
      (select id from reading_section),
      'expression_ideas',
      'Expression of Ideas',
      'Revision of text to improve rhetorical effectiveness, coherence, and alignment to communicative goals.',
      20.00,
      8,
      12,
      'Questions with similar revision targets appear consecutively and build in difficulty.',
      'https://satsuite.collegeboard.org/sat/digital'
    ),
    (
      (select id from reading_section),
      'standard_english_conventions',
      'Standard English Conventions',
      'Editing for grammar, usage, sentence structure, and punctuation consistent with formal written English.',
      26.00,
      11,
      15,
      'Ordered solely by difficulty, regardless of the specific convention assessed.',
      'https://satsuite.collegeboard.org/sat/digital'
    ),
    (
      (select id from math_section),
      'algebra',
      'Algebra',
      'Solving, analyzing, and modeling linear relationships, equations, inequalities, and systems.',
      35.00,
      13,
      15,
      'Appears in both modules with problems that grow in difficulty.',
      'https://satsuite.collegeboard.org/sat/digital'
    ),
    (
      (select id from math_section),
      'advanced_math',
      'Advanced Math',
      'Nonlinear functions and equations that measure readiness for higher-level mathematics.',
      35.00,
      13,
      15,
      'Appears in both modules with problems that grow in difficulty.',
      'https://satsuite.collegeboard.org/sat/digital'
    ),
    (
      (select id from math_section),
      'problem_solving_data_analysis',
      'Problem-Solving and Data Analysis',
      'Quantitative reasoning with ratios, rates, proportional relationships, data interpretation, and statistical thinking.',
      15.00,
      5,
      7,
      'Distributed across modules with increasingly complex contexts.',
      'https://satsuite.collegeboard.org/sat/digital'
    ),
    (
      (select id from math_section),
      'geometry_trigonometry',
      'Geometry and Trigonometry',
      'Geometric measurement, spatial reasoning, and foundational trigonometry, including circles and right triangles.',
      15.00,
      5,
      7,
      'Distributed across modules with increasingly complex contexts.',
      'https://satsuite.collegeboard.org/sat/digital'
    )
  on conflict (section_id, code) do update
  set name = excluded.name,
      description = excluded.description,
      approx_question_percentage = excluded.approx_question_percentage,
      questions_min = excluded.questions_min,
      questions_max = excluded.questions_max,
      grouping_notes = excluded.grouping_notes,
      source_url = excluded.source_url
  returning code, id
),
upsert_question_types as (
  insert into question_types (
    domain,
    category,
    specific_type,
    canonical_path,
    assessment_code,
    section_code,
    domain_id,
    skill_code,
    display_name,
    skill_description,
    source_url,
    metadata
  )
  values
    -- Reading and Writing - Information and Ideas
    ('reading and writing', 'information and ideas', 'central ideas and details', 'reading and writing > information and ideas > central ideas and details', 'digital_sat', 'reading_writing', (select id from domains where code = 'information_ideas'), 'central_ideas_details', 'Central Ideas and Details', 'Identify primary claims and important supporting details in concise texts drawn from academic and real-world sources.', 'https://satsuite.collegeboard.org/sat/digital', jsonb_build_object()),
    ('reading and writing', 'information and ideas', 'command of evidence (textual)', 'reading and writing > information and ideas > command of evidence (textual)', 'digital_sat', 'reading_writing', (select id from domains where code = 'information_ideas'), 'command_of_evidence_textual', 'Command of Evidence (Textual)', 'Determine how textual evidence supports or refines arguments, explanations, or claims.', 'https://satsuite.collegeboard.org/sat/digital', jsonb_build_object()),
    ('reading and writing', 'information and ideas', 'command of evidence (quantitative)', 'reading and writing > information and ideas > command of evidence (quantitative)', 'digital_sat', 'reading_writing', (select id from domains where code = 'information_ideas'), 'command_of_evidence_quantitative', 'Command of Evidence (Quantitative)', 'Interpret tables, charts, and graphs to connect quantitative evidence to written arguments.', 'https://satsuite.collegeboard.org/sat/digital', jsonb_build_object()),
    ('reading and writing', 'information and ideas', 'inferences', 'reading and writing > information and ideas > inferences', 'digital_sat', 'reading_writing', (select id from domains where code = 'information_ideas'), 'inferences', 'Inferences', 'Draw logical conclusions and implications that extend beyond explicitly stated information.', 'https://satsuite.collegeboard.org/sat/digital', jsonb_build_object()),
    -- Reading and Writing - Craft and Structure
    ('reading and writing', 'craft and structure', 'words in context', 'reading and writing > craft and structure > words in context', 'digital_sat', 'reading_writing', (select id from domains where code = 'craft_structure'), 'words_in_context', 'Words in Context', 'Use contextual and rhetorical cues to determine precise meanings of high-utility words and phrases.', 'https://satsuite.collegeboard.org/sat/digital', jsonb_build_object()),
    ('reading and writing', 'craft and structure', 'text structure and purpose', 'reading and writing > craft and structure > text structure and purpose', 'digital_sat', 'reading_writing', (select id from domains where code = 'craft_structure'), 'text_structure_purpose', 'Text Structure and Purpose', 'Analyze how organization, point of view, and rhetoric shape meaning and purpose.', 'https://satsuite.collegeboard.org/sat/digital', jsonb_build_object()),
    ('reading and writing', 'craft and structure', 'cross-text connections', 'reading and writing > craft and structure > cross-text connections', 'digital_sat', 'reading_writing', (select id from domains where code = 'craft_structure'), 'cross_text_connections', 'Cross-Text Connections', 'Synthesize related texts by comparing arguments, ideas, and perspectives across passages.', 'https://satsuite.collegeboard.org/sat/digital', jsonb_build_object()),
    -- Reading and Writing - Expression of Ideas
    ('reading and writing', 'expression of ideas', 'rhetorical synthesis', 'reading and writing > expression of ideas > rhetorical synthesis', 'digital_sat', 'reading_writing', (select id from domains where code = 'expression_ideas'), 'rhetorical_synthesis', 'Rhetorical Synthesis', 'Integrate information and viewpoints to accomplish specific rhetorical goals in revised text.', 'https://satsuite.collegeboard.org/sat/digital', jsonb_build_object()),
    ('reading and writing', 'expression of ideas', 'transitions', 'reading and writing > expression of ideas > transitions', 'digital_sat', 'reading_writing', (select id from domains where code = 'expression_ideas'), 'transitions', 'Transitions', 'Select or revise transitional words, phrases, or statements to maintain cohesion.', 'https://satsuite.collegeboard.org/sat/digital', jsonb_build_object()),
    -- Reading and Writing - Standard English Conventions
    ('reading and writing', 'standard english conventions', 'boundaries', 'reading and writing > standard english conventions > boundaries', 'digital_sat', 'reading_writing', (select id from domains where code = 'standard_english_conventions'), 'boundaries', 'Boundaries', 'Apply punctuation and sentence boundary rules (commas, semicolons, colons, end marks) to clarify meaning.', 'https://satsuite.collegeboard.org/sat/digital', jsonb_build_object()),
    ('reading and writing', 'standard english conventions', 'form, structure, and sense', 'reading and writing > standard english conventions > form, structure, and sense', 'digital_sat', 'reading_writing', (select id from domains where code = 'standard_english_conventions'), 'form_structure_sense', 'Form, Structure, and Sense', 'Edit sentences and clauses for grammatical form, agreement, and logical structure.', 'https://satsuite.collegeboard.org/sat/digital', jsonb_build_object()),
    -- Math - Algebra
    ('math', 'algebra', 'linear equations in one variable', 'math > algebra > linear equations in one variable', 'digital_sat', 'math', (select id from domains where code = 'algebra'), 'linear_equations_one_variable', 'Linear Equations in One Variable', 'Solve and manipulate linear equations in a single variable.', 'https://satsuite.collegeboard.org/sat/digital', jsonb_build_object()),
    ('math', 'algebra', 'linear equations in two variables', 'math > algebra > linear equations in two variables', 'digital_sat', 'math', (select id from domains where code = 'algebra'), 'linear_equations_two_variables', 'Linear Equations in Two Variables', 'Solve linear equations involving two variables and interpret their graphs.', 'https://satsuite.collegeboard.org/sat/digital', jsonb_build_object()),
    ('math', 'algebra', 'linear functions', 'math > algebra > linear functions', 'digital_sat', 'math', (select id from domains where code = 'algebra'), 'linear_functions', 'Linear Functions', 'Analyze and model linear functions, including slope, intercepts, and rate of change.', 'https://satsuite.collegeboard.org/sat/digital', jsonb_build_object()),
    ('math', 'algebra', 'systems of two linear equations in two variables', 'math > algebra > systems of two linear equations in two variables', 'digital_sat', 'math', (select id from domains where code = 'algebra'), 'systems_two_linear_equations', 'Systems of Two Linear Equations in Two Variables', 'Solve and interpret systems of two linear equations in two variables.', 'https://satsuite.collegeboard.org/sat/digital', jsonb_build_object()),
    ('math', 'algebra', 'linear inequalities in one or two variables', 'math > algebra > linear inequalities in one or two variables', 'digital_sat', 'math', (select id from domains where code = 'algebra'), 'linear_inequalities', 'Linear Inequalities in One or Two Variables', 'Solve and represent linear inequalities in one or two variables.', 'https://satsuite.collegeboard.org/sat/digital', jsonb_build_object()),
    -- Math - Advanced Math
    ('math', 'advanced math', 'equivalent expressions', 'math > advanced math > equivalent expressions', 'digital_sat', 'math', (select id from domains where code = 'advanced_math'), 'equivalent_expressions', 'Equivalent Expressions', 'Rewrite expressions to reveal structure or establish equivalence.', 'https://satsuite.collegeboard.org/sat/digital', jsonb_build_object()),
    ('math', 'advanced math', 'nonlinear equations in one variable and systems of equations in two variables', 'math > advanced math > nonlinear equations in one variable and systems of equations in two variables', 'digital_sat', 'math', (select id from domains where code = 'advanced_math'), 'nonlinear_equations_systems', 'Nonlinear Equations and Systems', 'Solve nonlinear equations and mixed systems involving linear and nonlinear relationships.', 'https://satsuite.collegeboard.org/sat/digital', jsonb_build_object()),
    ('math', 'advanced math', 'nonlinear functions', 'math > advanced math > nonlinear functions', 'digital_sat', 'math', (select id from domains where code = 'advanced_math'), 'nonlinear_functions', 'Nonlinear Functions', 'Analyze key features of nonlinear functions including growth, intercepts, and rates of change.', 'https://satsuite.collegeboard.org/sat/digital', jsonb_build_object()),
    -- Math - Problem-Solving and Data Analysis
    ('math', 'problem-solving and data analysis', 'ratios, rates, proportional relationships, and units', 'math > problem-solving and data analysis > ratios, rates, proportional relationships, and units', 'digital_sat', 'math', (select id from domains where code = 'problem_solving_data_analysis'), 'ratios_rates_units', 'Ratios, Rates, Proportional Relationships, and Units', 'Apply quantitative reasoning to ratios, unit rates, proportional relationships, and unit conversions.', 'https://satsuite.collegeboard.org/sat/digital', jsonb_build_object()),
    ('math', 'problem-solving and data analysis', 'percentages', 'math > problem-solving and data analysis > percentages', 'digital_sat', 'math', (select id from domains where code = 'problem_solving_data_analysis'), 'percentages', 'Percentages', 'Work with percentage change, growth, and real-world percentage applications.', 'https://satsuite.collegeboard.org/sat/digital', jsonb_build_object()),
    ('math', 'problem-solving and data analysis', 'one-variable data: distributions and measures of center and spread', 'math > problem-solving and data analysis > one-variable data: distributions and measures of center and spread', 'digital_sat', 'math', (select id from domains where code = 'problem_solving_data_analysis'), 'one_variable_data', 'One-Variable Data: Distributions and Measures of Center and Spread', 'Interpret graphical and numerical summaries of one-variable data, including center and spread.', 'https://satsuite.collegeboard.org/sat/digital', jsonb_build_object()),
    ('math', 'problem-solving and data analysis', 'two-variable data: models and scatterplots', 'math > problem-solving and data analysis > two-variable data: models and scatterplots', 'digital_sat', 'math', (select id from domains where code = 'problem_solving_data_analysis'), 'two_variable_data', 'Two-Variable Data: Models and Scatterplots', 'Model, interpret, and evaluate relationships using scatterplots and regression approximations.', 'https://satsuite.collegeboard.org/sat/digital', jsonb_build_object()),
    ('math', 'problem-solving and data analysis', 'probability and conditional probability', 'math > problem-solving and data analysis > probability and conditional probability', 'digital_sat', 'math', (select id from domains where code = 'problem_solving_data_analysis'), 'probability_conditional', 'Probability and Conditional Probability', 'Calculate probabilities, including conditional probability and combined events.', 'https://satsuite.collegeboard.org/sat/digital', jsonb_build_object()),
    ('math', 'problem-solving and data analysis', 'inference from sample statistics and margin of error', 'math > problem-solving and data analysis > inference from sample statistics and margin of error', 'digital_sat', 'math', (select id from domains where code = 'problem_solving_data_analysis'), 'inference_margin_error', 'Inference from Sample Statistics and Margin of Error', 'Draw inferences and conclusions from sample statistics, including margins of error and sampling variability.', 'https://satsuite.collegeboard.org/sat/digital', jsonb_build_object()),
    ('math', 'problem-solving and data analysis', 'evaluating statistical claims: observational studies and experiments', 'math > problem-solving and data analysis > evaluating statistical claims: observational studies and experiments', 'digital_sat', 'math', (select id from domains where code = 'problem_solving_data_analysis'), 'evaluating_statistical_claims', 'Evaluating Statistical Claims: Observational Studies and Experiments', 'Assess the validity of statistical claims and study designs, distinguishing observational studies from experiments.', 'https://satsuite.collegeboard.org/sat/digital', jsonb_build_object()),
    -- Math - Geometry and Trigonometry
    ('math', 'geometry and trigonometry', 'area and volume', 'math > geometry and trigonometry > area and volume', 'digital_sat', 'math', (select id from domains where code = 'geometry_trigonometry'), 'area_volume', 'Area and Volume', 'Compute area and volume for common geometric figures and composite shapes.', 'https://satsuite.collegeboard.org/sat/digital', jsonb_build_object()),
    ('math', 'geometry and trigonometry', 'lines, angles, and triangles', 'math > geometry and trigonometry > lines, angles, and triangles', 'digital_sat', 'math', (select id from domains where code = 'geometry_trigonometry'), 'lines_angles_triangles', 'Lines, Angles, and Triangles', 'Apply properties of lines, angles, and triangles to solve geometric problems.', 'https://satsuite.collegeboard.org/sat/digital', jsonb_build_object()),
    ('math', 'geometry and trigonometry', 'right triangles and trigonometry', 'math > geometry and trigonometry > right triangles and trigonometry', 'digital_sat', 'math', (select id from domains where code = 'geometry_trigonometry'), 'right_triangles_trigonometry', 'Right Triangles and Trigonometry', 'Use the Pythagorean theorem and basic trigonometric ratios in problem solving.', 'https://satsuite.collegeboard.org/sat/digital', jsonb_build_object()),
    ('math', 'geometry and trigonometry', 'circles', 'math > geometry and trigonometry > circles', 'digital_sat', 'math', (select id from domains where code = 'geometry_trigonometry'), 'circles', 'Circles', 'Work with circle properties, arc measures, sector area, and equations of circles.', 'https://satsuite.collegeboard.org/sat/digital', jsonb_build_object())
  on conflict (canonical_path) do update
  set assessment_code = excluded.assessment_code,
      section_code = excluded.section_code,
      domain_id = excluded.domain_id,
      skill_code = excluded.skill_code,
      display_name = excluded.display_name,
      skill_description = excluded.skill_description,
      source_url = excluded.source_url,
      metadata = excluded.metadata
  returning canonical_path
)
select count(*) as inserted_or_updated_question_types
from upsert_question_types;
