function tie(seed, id) {
  let hash = 2166136261;
  for (const character of `${seed}:${id}`) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}

function canStudentMove(student) {
  return Boolean(student) && (Object.prototype.hasOwnProperty.call(student, "studentDecision") ? student.studentDecision === "move" : student.preference === "move");
}

const RANK_WEIGHT = 1_000_000_000_000;
const POINT_WEIGHT = 1_000_000;
const TIE_RANGE = 100;

function placementCost(student, destination, seed, preferenceLevels, moverCount, tieDirection = 1) {
  const rank = student.destinations.indexOf(destination);
  const rawRandomOrder = tie(seed, `${student.id}:${destination}`) % TIE_RANGE;
  const randomOrder = tieDirection < 0 ? TIE_RANGE - 1 - rawRandomOrder : tieDirection === 0 ? 0 : rawRandomOrder;
  if (rank < 0) {
    const maximumPreferenceSwing = (preferenceLevels + 1) * RANK_WEIGHT + 5 * POINT_WEIGHT * preferenceLevels + TIE_RANGE;
    const stayPenalty = (moverCount + 1) * maximumPreferenceSwing;
    return stayPenalty + student.destinations.length * RANK_WEIGHT + randomOrder;
  }
  const points = Math.max(0, Math.min(5, Number(student.basePoints) || 0));
  const priorityAtRank = Math.max(1, preferenceLevels - rank);
  return rank * RANK_WEIGHT - points * POINT_WEIGHT * priorityAtRank + randomOrder;
}

function addEdge(graph, from, to, capacity, cost, meta = null) {
  const forward = { to, reverse: graph[to].length, capacity, cost, meta, initialCapacity: capacity };
  const backward = { to: from, reverse: graph[from].length, capacity: 0, cost: -cost, meta: null, initialCapacity: 0 };
  graph[from].push(forward);
  graph[to].push(backward);
}

function solveForMinimum(students, movers, fixedCounts, activeClasses, minimum, maximum, seed, tieDirection = 1) {
  const source = 0;
  const moverOffset = 1;
  const classOffset = moverOffset + movers.length;
  const sink = classOffset + activeClasses.length;
  const superSource = sink + 1;
  const superSink = superSource + 1;
  const graph = Array.from({ length: superSink + 1 }, () => []);
  const demand = Array(sink + 1).fill(0);
  const classNode = new Map(activeClasses.map((classId, index) => [classId, classOffset + index]));

  for (let index = 0; index < movers.length; index += 1) {
    const student = movers[index], node = moverOffset + index;
    addEdge(graph, source, node, 1, 0);
    const choices = [...new Set([...student.destinations, student.classId])].filter(classId => classNode.has(classId));
    for (const classId of choices) addEdge(graph, node, classNode.get(classId), 1, placementCost(student, classId, seed, activeClasses.length, movers.length, tieDirection), { studentId: student.id, classId });
  }

  for (const classId of activeClasses) {
    const fixed = fixedCounts.get(classId) || 0;
    if (fixed > maximum) return null;
    const lowerSlots = Math.max(0, minimum - fixed), capacity = maximum - fixed;
    if (lowerSlots > capacity) return null;
    addEdge(graph, classNode.get(classId), sink, capacity - lowerSlots, 0);
    demand[classNode.get(classId)] -= lowerSlots;
    demand[sink] += lowerSlots;
  }

  // The exact sink-to-source circulation bound forces every mover to be
  // assigned. Class lower bounds become node demands, keeping minimum sizes
  // as hard constraints instead of a cost heuristic.
  demand[sink] -= movers.length;
  demand[source] += movers.length;
  let requiredFlow = 0;
  for (let node = 0; node <= sink; node += 1) {
    if (demand[node] > 0) { addEdge(graph, superSource, node, demand[node], 0); requiredFlow += demand[node]; }
    else if (demand[node] < 0) addEdge(graph, node, superSink, -demand[node], 0);
  }

  let flow = 0;
  while (flow < requiredFlow) {
    const distance = Array(graph.length).fill(Infinity), previousNode = Array(graph.length).fill(-1), previousEdge = Array(graph.length).fill(-1), queued = Array(graph.length).fill(false);
    distance[superSource] = 0;
    const queue = [superSource]; queued[superSource] = true;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const node = queue[cursor]; queued[node] = false;
      for (let edgeIndex = 0; edgeIndex < graph[node].length; edgeIndex += 1) {
        const edge = graph[node][edgeIndex];
        if (edge.capacity <= 0 || distance[edge.to] <= distance[node] + edge.cost) continue;
        distance[edge.to] = distance[node] + edge.cost; previousNode[edge.to] = node; previousEdge[edge.to] = edgeIndex;
        if (!queued[edge.to]) { queue.push(edge.to); queued[edge.to] = true; }
      }
    }
    if (!Number.isFinite(distance[superSink])) return null;
    for (let node = superSink; node !== superSource; node = previousNode[node]) {
      const edge = graph[previousNode[node]][previousEdge[node]];
      edge.capacity -= 1;
      graph[node][edge.reverse].capacity += 1;
    }
    flow += 1;
  }

  const assignment = new Map(students.filter(student => !canStudentMove(student)).map(student => [student.id, student.classId]));
  for (let index = 0; index < movers.length; index += 1) {
    const node = moverOffset + index;
    const selected = graph[node].find(edge => edge.meta && edge.initialCapacity === 1 && edge.capacity === 0);
    if (!selected) return null;
    assignment.set(movers[index].id, selected.meta.classId);
  }
  const counts = new Map(activeClasses.map(classId => [classId, 0]));
  for (const classId of assignment.values()) counts.set(classId, (counts.get(classId) || 0) + 1);
  const sizes = [...counts.values()];
  if (Math.min(...sizes) < minimum || Math.max(...sizes) > maximum || Math.max(...sizes) - Math.min(...sizes) > maximum - minimum) return null;
  const objectiveValue = movers.reduce((total, student) => total + BigInt(placementCost(student, assignment.get(student.id), seed, activeClasses.length, movers.length, tieDirection)), 0n);
  const priorityObjective = movers.reduce((total, student) => total + BigInt(placementCost(student, assignment.get(student.id), seed, activeClasses.length, movers.length, 0)), 0n);
  const moved = movers.filter(student => assignment.get(student.id) !== student.classId).length;
  const difference = Math.max(...sizes) - Math.min(...sizes);
  const signature = movers.map(student => `${student.id}:${assignment.get(student.id)}`).sort().join("|");
  return { assignment, counts, objective: objectiveValue, priorityObjective, moved, difference, signature };
}

function randomizedStudents(movers, selected, alternative) {
  if (!alternative) return new Set();
  const samePrimaryObjective = selected.priorityObjective === alternative.priorityObjective
    && selected.difference === alternative.difference
    && selected.moved === alternative.moved;
  if (!samePrimaryObjective) return new Set();
  return new Set(movers.filter(student => selected.assignment.get(student.id) !== alternative.assignment.get(student.id)).map(student => student.id));
}

export function calculateDistribution(students, { seed = "distribution", maxDifference = 3, classIds, objective = "preferences" } = {}) {
  if (!new Set(["preferences", "maximize_moves"]).has(objective)) throw new Error("Objetivo de distribuição inválido.");
  const normalized = students.map(student => ({ ...student, destinations: [...new Set(student.destinations || [])] }));
  const activeClasses = classIds?.length ? [...new Set(classIds)].sort((a, b) => a - b) : [...new Set(normalized.flatMap(student => [student.classId, ...student.destinations]))].sort((a, b) => a - b);
  if (!activeClasses.length) return [];
  const activeSet = new Set(activeClasses);
  for (const student of normalized) {
    if (!activeSet.has(student.classId)) throw new Error(`A turma de origem ${student.classId} não está ativa.`);
    student.destinations = student.destinations.filter(classId => activeSet.has(classId) && classId !== student.classId);
  }
  const movers = normalized.filter(canStudentMove).sort((left, right) => String(left.id).localeCompare(String(right.id))), fixedCounts = new Map(activeClasses.map(classId => [classId, 0]));
  for (const student of normalized.filter(student => !canStudentMove(student))) fixedCounts.set(student.classId, (fixedCounts.get(student.classId) || 0) + 1);

  const averageFloor = Math.floor(normalized.length / activeClasses.length);
  const findBest = (allowedDifference, tieDirection) => {
    const minimumStart = Math.max(0, averageFloor - allowedDifference);
    let candidateBest = null;
    for (let minimum = minimumStart; minimum <= averageFloor; minimum += 1) {
      const candidate = solveForMinimum(normalized, movers, fixedCounts, activeClasses, minimum, minimum + allowedDifference, seed, tieDirection);
      const better = candidate && (!candidateBest
        || candidate.difference < candidateBest.difference
        || (candidate.difference === candidateBest.difference && (candidate.moved > candidateBest.moved
          || (candidate.moved === candidateBest.moved && (candidate.priorityObjective < candidateBest.priorityObjective
            || (candidate.priorityObjective === candidateBest.priorityObjective && (candidate.objective < candidateBest.objective
              || (candidate.objective === candidateBest.objective && candidate.signature < candidateBest.signature))))))));
      if (better) candidateBest = candidate;
    }
    return candidateBest;
  };
  let minimumDifference = null;
  for (let difference = 0; difference <= maxDifference; difference += 1) {
    if (findBest(difference, 0)) { minimumDifference = difference; break; }
  }
  const best = minimumDifference === null ? null : findBest(minimumDifference, 1);
  if (!best) throw new Error(`Não foi encontrada uma distribuição que respeite a diferença máxima de ${maxDifference} estudantes.`);

  // Keep tie-break analysis bounded. Re-solving once per mover made this path
  // quadratic and exhausted the Worker CPU budget on full-year cohorts.
  const randomized = randomizedStudents(movers, best, findBest(minimumDifference, -1));
  return normalized.map(student => {
    const destinationClass = best.assignment.get(student.id), rank = student.destinations.indexOf(destinationClass) + 1;
    const sensitive = (student.considerations || []).some(value => ["integration_bullying", "other"].includes(value));
    const points = destinationClass === student.classId ? 0 : Math.max(0, Number(student.basePoints) || 0);
    const status = !canStudentMove(student) ? "stayed_by_choice" : destinationClass === student.classId ? "fallback" : "moved";
    const manualReview = Boolean((rank !== 1 || status === "fallback") && (sensitive || student.notes?.trim()));
    return { studentId: student.id, originClass: student.classId, destinationClass, rank: rank || null, status, points, pointBreakdown: { integration: student.integrationPoints || 0, exception: student.exceptionPoints || 0 }, randomized: randomized.has(student.id), manualReview };
  });
}
