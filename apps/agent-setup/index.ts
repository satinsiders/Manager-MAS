import OpenAI from 'openai';
import { OPENAI_API_KEY } from '../../packages/shared/config';

// `agents` is a new beta feature and may not be typed yet in the SDK, so we
// cast the client to `any` when calling it.
const client = new OpenAI({ apiKey: OPENAI_API_KEY });
const betaClient = client as any;

interface AgentSpec {
  name: string;
  instructions: string;
}

const agents: AgentSpec[] = [
  {
    name: 'Scheduler',
    instructions: 'Call daily and weekly jobs at the exact time.'
  },
  {
    name: 'Orchestrator',
    instructions: 'Pass context to required sub-agents and manage retries and logging.'
  },
  {
    name: 'Lesson Picker',
    instructions:
      'Select `next_curriculum_id` and recommended minutes using embeddings plus GPT guidance.'
  },
  {
    name: 'Dispatcher',
    instructions: 'Send lessons and metadata to the SuperfastSAT platform and record in `dispatch_log`.'
  },
  {
    name: 'Performance Recorder',
    instructions:
      'Append `{student_id, curriculum_id (lesson_id), score, confidence_rating}` to the `performances` table.'
  },
  {
    name: 'Data Aggregator',
    instructions:
      'Generate `performance_summary.json` by combining weekly performances and charts.'
  },
  {
    name: 'Study Plan Editor',
    instructions: 'Produce the next study plan draft (`study_plan_vX`) via GPT-5 Responses.'
  },
  {
    name: 'QA & Formatter',
    instructions: 'Validate curriculum JSON schema and style then update student pointers to the new version.'
  },
  {
    name: 'Notification Bot',
    instructions: 'Notify key events via Slack direct message.'
  }
];

async function setupAgents() {
  for (const spec of agents) {
    const created = await betaClient.agents.create({
      name: spec.name,
      instructions: spec.instructions,
      model: 'gpt-5-nano'
    });
    console.log(`${spec.name} -> ${created.id}`);
  }
}

if (require.main === module) {
  setupAgents().catch((err) => {
    console.error('Failed to setup agents:', err);
    process.exit(1);
  });
}
