import assert from 'node:assert/strict';

// Set environment variables required by config
process.env.SLACK_WEBHOOK_URL = 'http://example.com';
process.env.OPENAI_API_KEY = 'test';
process.env.SUPABASE_URL = 'http://example.com';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'key';
process.env.NOTIFICATION_BOT_URL = 'http://example.com';
process.env.LESSON_PICKER_URL = 'http://example.com';
process.env.DISPATCHER_URL = 'http://example.com';
process.env.ASSIGNMENTS_URL = 'http://example.com';
process.env.DATA_AGGREGATOR_URL = 'http://example.com';
process.env.CURRICULUM_EDITOR_URL = 'http://example.com';
process.env.QA_FORMATTER_URL = 'http://example.com';
process.env.SUPERFASTSAT_API_URL = 'http://example.com';
process.env.SUPERFASTSAT_API_TOKEN = 'token';
process.env.ORCHESTRATOR_URL = 'http://example.com';
process.env.ORCHESTRATOR_SECRET = 'secret';
process.env.SCHEDULER_SECRET = 'sched-secret';

let rpcArgs: any = null;
let progressRows: any[] = [];
let recentScoresRow: any = {
  student_id: 'student1',
  scores: [80, 70, 60],
  updated_at: new Date().toISOString(),
};
let platformDispatchRows: any[] = [
  { external_curriculum_id: 'l3', remaining_minutes: 0 },
];
let dailyUnitRows: any[] = [
  {
    scheduled_date: '2024-01-10',
    platform_curriculum_id: 'l3',
    lesson_id: 'lesson-l3',
    unit_id: 'unit-l3-1',
    unit_seq: 1,
    is_completed: true,
    is_correct: true,
    confidence: 80,
    consecutive_correct_count: 2,
  },
  {
    scheduled_date: '2024-01-09',
    platform_curriculum_id: 'l2',
    lesson_id: 'lesson-l2',
    unit_id: 'unit-l2-1',
    unit_seq: 1,
    is_completed: true,
    is_correct: false,
    confidence: 40,
    consecutive_correct_count: 0,
  },
];
let dailySummaryRows: any[] = [
  {
    date: '2024-01-10',
    external_curriculum_id: 'l3',
    avg_correctness: 85,
    avg_confidence: 70,
    units: 2,
  },
];
let curriculumCatalogRows: any[] = [
  {
    external_curriculum_id: 'l3',
    raw_title: 'Math > Geometry > Practice',
    subtype: 'practice',
    question_types: { canonical_path: 'math > geometry > practice' },
  },
  {
    external_curriculum_id: 'l2',
    raw_title: 'Math > Algebra > Practice',
    subtype: 'practice',
    question_types: { canonical_path: 'math > algebra > practice' },
  },
];

function baseFrom(table: string) {
  switch (table) {
    case 'students':
      return {
        select() {
          return {
            eq() {
              return {
                single: async () => ({
                  data: {
                    preferred_topics: ['algebra', 'geometry'],
                    last_lesson_id: 'l1',
                  },
                }),
              };
            },
          };
        },
      };
    case 'lessons':
      return {
        select() {
          return {
            eq(_col: string, val: any) {
              return {
                single: async () => ({
                  data: {
                    topic: val === 'l3' ? 'geometry' : val === 'l2' ? 'algebra' : 'history',
                  },
                }),
              };
            },
          };
        },
      };
    case 'study_plans':
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    single: async () => ({
                      data: {
                        study_plan: {
                          curricula: [
                            {
                              id: 'l3',
                              minutes_recommended: 20,
                              units: [
                                { id: 'u1', duration_minutes: 5 },
                                { id: 'u2', duration_minutes: 6 },
                              ],
                            },
                            {
                              id: 'l2',
                              minutes_recommended: 15,
                              units: [{ id: 'u3', duration_minutes: 4 }],
                            },
                          ],
                        },
                      },
                    }),
                  };
                },
              };
            },
          };
        },
      };
    case 'curricula':
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    single: async () => ({
                      data: {
                        curriculum: {
                          curricula: [
                            {
                              id: 'l3',
                              minutes_recommended: 20,
                              units: [
                                { id: 'u1', duration_minutes: 5 },
                                { id: 'u2', duration_minutes: 6 },
                              ],
                            },
                            {
                              id: 'l2',
                              minutes_recommended: 15,
                              units: [{ id: 'u3', duration_minutes: 4 }],
                            },
                          ],
                        },
                      },
                    }),
                  };
                },
              };
            },
          };
        },
      };
    case 'assignments':
      return {
        select() {
          return {
            eq() {
              return {
                eq: () => ({ data: [] }),
              };
            },
          };
        },
      };
    case 'student_progress':
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return { data: progressRows };
                },
              };
            },
          };
        },
      };
    case 'student_recent_scores':
      return {
        select() {
          const chain: any = {
            filter: null,
            eq(_column: string, value: string) {
              this.filter = value;
              return this;
            },
            async maybeSingle() {
              return {
                data:
                  this.filter === recentScoresRow.student_id ? recentScoresRow : null,
              };
            },
          };
          return chain;
        },
        upsert(payload: any) {
          recentScoresRow = payload;
          return Promise.resolve({ data: payload });
        },
      };
    case 'platform_dispatches':
      return {
        select() {
          return {
            eq() {
              return Promise.resolve({ data: platformDispatchRows });
            },
          };
        },
      } as any;
    case 'daily_performance_units':
      return {
        select() {
          const chain: any = {
            _data: dailyUnitRows,
            eq() {
              return chain;
            },
            gte() {
              return chain;
            },
            order() {
              return chain;
            },
            limit() {
              return Promise.resolve({ data: chain._data });
            },
          };
          return chain;
        },
      };
    case 'daily_performance':
      return {
        select() {
          const chain: any = {
            _data: dailySummaryRows,
            eq() {
              return chain;
            },
            gte() {
              return chain;
            },
            order() {
              return chain;
            },
            limit() {
              return Promise.resolve({ data: chain._data });
            },
          };
          return chain;
        },
      };
    case 'curriculum_catalog':
      return {
        select() {
          const chain: any = {
            in(_column: string, values: string[]) {
              const list = values && values.length
                ? curriculumCatalogRows.filter((row: any) => values.includes(row.external_curriculum_id))
                : curriculumCatalogRows;
              return Promise.resolve({ data: list });
            },
            eq() {
              return chain;
            },
            order() {
              return chain;
            },
            limit() {
              return Promise.resolve({ data: curriculumCatalogRows });
            },
          };
          return chain;
        },
      };
    default:
      return {} as any;
  }
}

function createSupabase(onInsert: (fields: any) => Promise<void>) {
  return {
    from(table: string) {
      if (table === 'dispatch_log') {
        return {
          insert: async (fields: any) => {
            await onInsert(fields);
            return {} as any;
          }
        };
      }
      return baseFrom(table);
    },
    async rpc(fn: string, args: any) {
      rpcArgs = { fn, args };
      return {
        data: [
          { id: 'l1', difficulty: 1, topic: 'history' },
          { id: 'l2', difficulty: 2, topic: 'algebra' },
          { id: 'l3', difficulty: 3, topic: 'geometry' }
        ]
      };
    }
  };
}

function createSupabaseWithAssignments(onInsert: (fields: any) => Promise<void>) {
  return {
    from(table: string) {
      if (table === 'dispatch_log') {
        return {
          insert: async (fields: any) => {
            await onInsert(fields);
            return {} as any;
          }
        };
      }
      if (table === 'students') {
        return {
          select() {
            return {
              eq() {
                return {
                  single: async () => ({
                    data: {
                      preferred_topics: ['algebra', 'geometry'],
                      last_lesson_id: 'l1'
                    }
                  })
                };
              }
            };
          }
        };
      }
      if (table === 'curricula') {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      single: async () => ({
                        data: {
                          curriculum: { curricula: [] }
                        }
                      })
                    };
                  }
                };
              }
            };
          }
        };
      }
      if (table === 'study_plans') {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      single: async () => ({
                        data: { study_plan: { curricula: [] } }
                      })
                    };
                  }
                };
              }
            };
          }
        };
      }
      if (table === 'assignments') {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      data: [
                        {
                          id: 'a1',
                          lesson_id: 'l3',
                          duration_minutes: 12,
                          questions_json: [{ prompt: 'Q1', question_type: 'history' }]
                        }
                      ]
                    };
                  }
                };
              }
            };
          }
        };
      }
      if (table === 'daily_performance_units') {
        return {
          select() {
            const chain: any = {
              _data: dailyUnitRows,
              eq() {
                return chain;
              },
              gte() {
                return chain;
              },
              order() {
                return chain;
              },
              limit() {
                return Promise.resolve({ data: chain._data });
              },
            };
            return chain;
          },
        };
      }
      if (table === 'daily_performance') {
        return {
          select() {
            const chain: any = {
              _data: dailySummaryRows,
              eq() {
                return chain;
              },
              gte() {
                return chain;
              },
              order() {
                return chain;
              },
              limit() {
                return Promise.resolve({ data: chain._data });
              },
            };
            return chain;
          },
        };
      }
      if (table === 'curriculum_catalog') {
        return {
          select() {
            const chain: any = {
              in(_column: string, values: string[]) {
                const list = values && values.length
                  ? curriculumCatalogRows.filter((row: any) => values.includes(row.external_curriculum_id))
                  : curriculumCatalogRows;
                return Promise.resolve({ data: list });
              },
              eq() {
                return chain;
              },
              order() {
                return chain;
              },
              limit() {
                return Promise.resolve({ data: curriculumCatalogRows });
              },
            };
            return chain;
          },
        };
      }
      if (table === 'lessons') {
        return {
          select() {
            return {
              eq(_col: string, val: any) {
                return {
                  single: async () => ({
                    data: {
                      topic: val === 'l3' ? 'geometry' : val === 'l2' ? 'algebra' : 'history'
                    }
                  })
                };
              }
            };
          }
        };
      }
      if (table === 'student_progress') {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return { data: progressRows };
                  }
                };
              }
            };
          }
        };
      }
      if (table === 'student_recent_scores') {
        return {
          select() {
            const chain: any = {
              filter: null,
              eq(_column: string, value: string) {
                this.filter = value;
                return this;
              },
              async maybeSingle() {
                return {
                  data:
                    this.filter === recentScoresRow.student_id ? recentScoresRow : null,
                };
              },
            };
            return chain;
          },
          upsert(payload: any) {
            recentScoresRow = payload;
            return Promise.resolve({ data: payload });
          },
        };
      }
      if (table === 'platform_dispatches') {
        return {
          select() {
            return {
              eq() {
                return Promise.resolve({ data: platformDispatchRows });
              },
            };
          },
        } as any;
      }
      return {} as any;
    },
    async rpc(fn: string, args: any) {
      rpcArgs = { fn, args };
      return {
        data: [
          { id: 'l1', difficulty: 1, topic: 'history' },
          { id: 'l2', difficulty: 2, topic: 'algebra' },
          { id: 'l3', difficulty: 3, topic: 'geometry' }
        ]
      };
    }
  };
}

class MockOpenAI {
  constructor(
    private response: any = {
      decision: {
        action: 'dispatch_minutes',
        curriculum_id: 'l3',
        minutes: 15,
        reason: 'default',
        evidence: ['unit-l3-1 correct'],
      },
    },
  ) {}

  embeddings = {
    create: async (_opts: any) => ({
      data: [{ embedding: Array(1536).fill(0.1) }],
    }),
  };

  responses = {
    create: async () => ({ output_text: JSON.stringify(this.response) }),
  };
}

(async () => {
  const { selectNextLesson } = await import('./index');

  // Successful insert path
  let inserted: any = null;
  platformDispatchRows = [{ external_curriculum_id: 'l3', remaining_minutes: 0 }];
  const supabase = createSupabase(async (fields: any) => {
    inserted = fields;
  });
  progressRows = [];
  const result = await selectNextLesson('student1', 2, {
    supabase: supabase as any,
    openai: new MockOpenAI() as any,
  });
  assert.equal(result.next_curriculum_id, 'l3');
  assert.equal(result.minutes, 15);
  assert(result.reason);
  if (!result.units) throw new Error('expected units in result');
  assert.equal(result.units[0].id, 'u1');
  assert.equal(rpcArgs.fn, 'match_lessons');
  assert.equal(rpcArgs.args.query_embedding.length, 1536);
  assert.equal(inserted.student_id, 'student1');
  assert.equal(inserted.lesson_id, 'l3');
  assert.equal(inserted.status, 'selected');
  assert.ok(inserted.sent_at);

  // Failure path should not throw
  rpcArgs = null;
  let attempted = false;
  const failingSupabase = createSupabase(async (_fields: any) => {
    attempted = true;
    throw new Error('insert failed');
  });
  progressRows = [];
  platformDispatchRows = [{ external_curriculum_id: 'l3', remaining_minutes: 0 }];
  const result2 = await selectNextLesson('student1', 2, {
    supabase: failingSupabase as any,
    openai: new MockOpenAI({
      decision: {
        action: 'dispatch_minutes',
        curriculum_id: 'l3',
        minutes: 15,
        reason: 'fallback',
        evidence: ['fallback path'],
      },
    }) as any,
  });
  assert.equal(result2.next_curriculum_id, 'l3');
  assert(attempted);

  // Assignments fallback includes duration_minutes and questions
  platformDispatchRows = [{ external_curriculum_id: 'l3', remaining_minutes: 0 }];
  const supabaseAssign = createSupabaseWithAssignments(async () => {});
  progressRows = [];
  const result3 = (await selectNextLesson('student1', 2, {
    supabase: supabaseAssign as any,
    openai: new MockOpenAI() as any,
  })) as any;
  assert.equal(result3.units[0].id, 'a1');
  assert.equal(result3.units[0].duration_minutes, 12);
  assert.deepEqual(result3.units[0].questions, [{ prompt: 'Q1', question_type: 'history' }]);

  // Rule filters: avoid repeating same topic
  const supabaseRules = createSupabase(async () => {});
  const avoidGeometry = (lesson: any) => lesson.topic !== 'geometry';
  progressRows = [];
  const result4 = await selectNextLesson('student1', 2, {
    supabase: supabaseRules as any,
    openai: new MockOpenAI({
      decision: {
        action: 'dispatch_minutes',
        curriculum_id: 'l2',
        minutes: 15,
        reason: 'rules',
        evidence: ['avoid geometry'],
      },
    }) as any,
  }, [avoidGeometry]);
  assert.equal(result4.next_curriculum_id, 'l2');

  // Rule filters: limit difficulty jumps
  const limitJump = (lesson: any) => Math.abs(lesson.difficulty - 1) <= 1;
  progressRows = [];
  const result5 = await selectNextLesson('student1', 2, {
    supabase: supabaseRules as any,
    openai: new MockOpenAI({
      decision: {
        action: 'dispatch_minutes',
        curriculum_id: 'l2',
        minutes: 20,
        reason: 'limit jump',
        evidence: ['difficulty ok'],
      },
    }) as any,
  }, [limitJump]);
  assert.equal(result5.next_curriculum_id, 'l2');
  assert.equal(result5.minutes, 20);

  // Mastery filtering: if the selected lesson's question type is mastered, request a new curriculum
  progressRows = [{ question_type: 'math > geometry > practice' }];
  const result6 = (await selectNextLesson('student1', 2, {
    supabase: supabase as any,
    openai: new MockOpenAI({
      decision: {
        action: 'request_new_curriculum',
        reason: 'Mastered question type',
        evidence: ['canonical mastery'],
      },
    }) as any,
  })) as any;
  assert.equal(result6.action, 'request_new_curriculum');

  // Request new curriculum when all units mastered
  progressRows = [
    { question_type: 'math > geometry > practice' },
    { question_type: 'math > algebra > practice' }
  ];
  const result7 = await selectNextLesson('student1', 2, {
    supabase: supabase as any,
    openai: new MockOpenAI({
      decision: {
        action: 'request_new_curriculum',
        reason: 'All mastered',
        evidence: ['no growth'],
      },
    }) as any,
  });
  assert.equal(result7.action, 'request_new_curriculum');

  console.log('Lesson picker dispatch log tests passed');
})();
