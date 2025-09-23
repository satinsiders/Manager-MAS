export async function selectUnits(plan: any, minutes: number) {
  const flat: { unit: any; curriculumId: string; duration: number }[] = [];
  for (const curriculum of plan.curricula ?? []) {
    for (const unit of curriculum.units ?? []) {
      flat.push({
        unit,
        curriculumId: curriculum.id,
        duration: Number(unit.duration_minutes) || 0,
      });
    }
  }

  const sums = new Map<number, number[]>();
  sums.set(0, []);
  flat.forEach((item, idx) => {
    const entries = Array.from(sums.entries());
    for (const [sum, indices] of entries) {
      const newSum = sum + item.duration;
      if (!sums.has(newSum)) {
        sums.set(newSum, [...indices, idx]);
      }
    }
  });

  let chosen = minutes;
  if (!sums.has(minutes)) {
    let bestUnder = -1;
    let bestOver = Infinity;
    for (const sum of sums.keys()) {
      if (sum === 0) continue;
      if (sum <= minutes && sum > bestUnder) {
        bestUnder = sum;
      } else if (sum > minutes && sum < bestOver) {
        bestOver = sum;
      }
    }
    if (bestUnder >= 0) {
      chosen = bestUnder;
    } else if (bestOver < Infinity) {
      chosen = bestOver;
    } else {
      chosen = 0;
    }
  }

  const indices = sums.get(chosen) ?? [];
  indices.sort((a, b) => a - b);
  const units = indices.map((i) => flat[i].unit);
  const lastCurriculumId = indices.length
    ? flat[indices[indices.length - 1]].curriculumId
    : undefined;
  return { units, total: chosen, lastCurriculumId };
}
