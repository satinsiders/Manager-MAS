import type { Tool } from 'openai/resources/responses/responses';

export const systemPrompt = `You're the Manager-MAS operations assistant. Be helpful, friendly, and conversational.
Talk to instructors like a human teammate: short sentences, clear suggestions, and a kind tone.

STREAMING & STYLE GUIDELINES:
- Keep sentences short and easy to read. Prefer conversational phrasing over formal lists.
- Emit information incrementally so the UI can show partial text as it arrives (sentence-by-sentence works best).
- Do NOT reveal internal chain-of-thought. If you need to explain a decision, provide a short public rationale (103 concise sentences).
- When you plan to call a platform operation, write the operation name and required fields as short lines so they can stream cleanly.

CRITICAL FIELD FORMATTING:
- For any API call requiring a scheduledDate, provide the date in strict YYYY-MM-DD format (e.g., 2025-09-23).
- If the user provides a date in another format, convert it to YYYY-MM-DD before calling the tool.

If the user's intent is ambiguous, assume they mean what they say and prefer a helpful action-oriented response.`;

export const PLATFORM_OPERATIONS = [
  'list_students',
  'list_student_curriculums',
  'list_study_schedules',
  'list_curriculums',
  'set_learning_volume',
  'grant_student_course',
] as const;

export type PlatformOperation = (typeof PLATFORM_OPERATIONS)[number];

export type PlatformToolArgs = {
  operation: PlatformOperation;
  input?: Record<string, unknown>;
};

export const platformTool: Tool = {
  type: 'function',
  name: 'platform_api_call',
  description: `Call a SuperfastSAT teacher API to manage students, curriculums, and learning schedules.

  Recommended workflow for content dispatch:
  1. Information Gathering:
     - Use list_students to validate student existence and get details
     - Use list_curriculums to see available content options
  
  2. Current State Analysis:
     - Use list_student_curriculums to check existing assignments
       IMPORTANT: This returns studentCurriculumId needed for scheduling
     - Use list_study_schedules to review current study load
  
  3. Assignment & Scheduling:
     - Use grant_student_course to assign curriculum (requires numeric studentId and curriculumId)
     - AFTER grant_student_course, use list_student_curriculums again to get the new studentCurriculumId
     - Use set_learning_volume with the studentCurriculumId to set schedule
  
  CRITICAL FIELD REQUIREMENTS:
  - grant_student_course needs: studentId and curriculumId (as numbers)
  - list_student_curriculums needs: studentId (number)
  - set_learning_volume needs: studentCurriculumId (from list_student_curriculums), scheduledDate (YYYY-MM-DD), duration (minutes)
  
  WORKFLOW EXAMPLE:
  1. list_student_curriculums(studentId: 123)
  2. grant_student_course(studentId: 123, curriculumId: 456)
  3. list_student_curriculums(studentId: 123) -> get studentCurriculumId
  4. set_learning_volume(studentCurriculumId: 789, scheduledDate: "2025-09-23", duration: 60)
  
  IMPORTANT: 
  - Always get studentCurriculumId from list_student_curriculums AFTER granting a course
  - Verify grant_student_course success before setting schedule
  - DO NOT send raw API responses to user - analyze and summarize
  `,
  strict: false,
  parameters: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        description: 'Target API operation to perform',
        enum: [...PLATFORM_OPERATIONS],
      },
      input: {
        type: 'object',
        description: 'Operation parameters',
        properties: {
          studentId: {
            type: 'number',
            description: 'Student ID for operations that target a specific student'
          },
          curriculumId: {
            type: 'number',
            description: 'Curriculum ID for curriculum-specific operations'
          },
          student_id: {
            type: 'number',
            description: 'Alternative field name for studentId'
          },
          curriculum_id: {
            type: 'number',
            description: 'Alternative field name for curriculumId'
          },
          scheduledDate: {
            type: 'string',
            description: 'Date for scheduling operations (YYYY-MM-DD format)'
          },
          duration: {
            type: 'number',
            description: 'Duration in minutes for scheduling operations'
          }
        },
        additionalProperties: true,
      },
    },
    required: ['operation'],
    additionalProperties: false,
  },
};
