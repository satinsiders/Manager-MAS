import studentHandlers from './operations/students';
import scheduleHandlers from './operations/schedules';
import curriculumHandlers from './operations/curriculums';
import studyPlanHandlers from './operations/studyPlans';
import type { OperationMap } from './operations/types';

const operationHandlers: OperationMap = {
  ...studentHandlers,
  ...scheduleHandlers,
  ...curriculumHandlers,
  ...studyPlanHandlers,
};

export type { OperationHandler, OperationArgs } from './operations/types';

export { operationHandlers };

export default operationHandlers;
