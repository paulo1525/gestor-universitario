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
const LOWER_SLOT_REWARD = 100_000_000_000_000;

function placementCost(student, destination, seed, preferenceLevels) {
  const rank = student.destinations.indexOf(destination);
  const randomOrder = tie(seed, `${student.id}:${destination}`) % TIE_RANGE;
  if (rank < 0) return student.destinations.length * RANK_WEIGHT + randomOrder;
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

function solveForMinimum(students, movers, fixedCounts, activeClasses, minimum, maximum, seed) {
  const source = 0;
  const moverOffset = 1;
  const classOffset = moverOffset + movers.length;
  const sink = classOffset + activeClasses.length;
  const graph = Array.from({ length: sink + 1 }, () => []);
  const classNode = new Map(activeClasses.map((classId, index) => [classId, classOffset + index]));

  for (let index = 0; index < movers.length; index += 1) {
    const student = movers[index], node = moverOffset + index;
    addEdge(graph, source, node, 1, 0);
    const choices = [...new Set([...student.destinations, student.classId])].filter(classId => classNode.has(classId));
    for (const classId of choices) addEdge(graph, node, classNode.get(classId), 1, placementCost(student, classId, seed, activeClasses.length), { studentId: student.id, classId });
  }

  for (const classId of activeClasses) {
    const fixed = fixedCounts.get(classId) || 0;
    if (fixed > maximum) return null;
    const lowerSlots = Math.max(0, minimum - fixed), capacity = maximum - fixed;
    if (lowerSlots > capacity) return null;
    if (lowerSlots) addEdge(graph, classNode.get(classId), sink, lowerSlots, -LOWER_SLOT_REWARD);
    if (capacity > lowerSlots) addEdge(graph, classNode.get(classId), sink, capacity - lowerSlots, 0);
  }

  let flow = 0;
  while (flow < movers.length) {
    const distance = Array(graph.length).fill(Infinity), previousNode = Array(graph.length).fill(-1), previousEdge = Array(graph.length).fill(-1), queued = Array(graph.length).fill(false);
    distance[source] = 0;
    const queue = [source]; queued[source] = true;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const node = queue[cursor]; queued[node] = false;
      for (let edgeIndex = 0; edgeIndex < graph[node].length; edgeIndex += 1) {
        const edge = graph[node][edgeIndex];
        if (edge.capacity <= 0 || distance[edge.to] <= distance[node] + edge.cost) continue;
        distance[edge.to] = distance[node] + edge.cost; previousNode[edge.to] = node; previousEdge[edge.to] = edgeIndex;
        if (!queued[edge.to]) { queue.push(edge.to); queued[edge.to] = true; }
      }
    }
    if (!Number.isFinite(distance[sink])) return null;
    for (let node = sink; node !== source; node = previousNode[node]) {
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
  const objective = movers.reduce((total, student) => total + BigInt(placementCost(student, assignment.get(student.id), seed, activeClasses.length)), 0n);
  const signature = movers.map(student => `${student.id}:${assignment.get(student.id)}`).sort().join("|");
  return { assignment, counts, objective, signature };
}

function decisiveRandomizedStudents(movers, assignment) {
  const randomized = new Set(), groups = new Map();
  for (const student of movers) {
    const finalClass = assignment.get(student.id), finalRank = student.destinations.indexOf(finalClass);
    student.destinations.forEach((destination, rank) => {
      if (finalRank >= 0 && finalRank < rank) return;
      const key = `${destination}:${rank}:${Number(student.basePoints) || 0}`;
      const group = groups.get(key) || { destination, candidates: [] };
      group.candidates.push(student); groups.set(key, group);
    });
  }
  for (const { destination, candidates } of groups.values()) {
    if (candidates.length < 2) continue;
    const placed = candidates.filter(candidate => assignment.get(candidate.id) === destination);
    if (!placed.length || placed.length === candidates.length) continue;
    for (const candidate of candidates) randomized.add(candidate.id);
  }
  return randomized;
}

export function calculateDistribution(students, { seed = "distribution", maxDifference = 3, classIds } = {}) {
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
  const minimumStart = Math.max(0, averageFloor - maxDifference);
  let best = null;
  for (let minimum = minimumStart; minimum <= averageFloor; minimum += 1) {
    const candidate = solveForMinimum(normalized, movers, fixedCounts, activeClasses, minimum, minimum + maxDifference, seed);
    if (candidate && (!best || candidate.objective < best.objective || (candidate.objective === best.objective && candidate.signature < best.signature))) best = candidate;
  }
  if (!best) throw new Error(`Não foi encontrada uma distribuição que respeite a diferença máxima de ${maxDifference} estudantes.`);

  const randomized = decisiveRandomizedStudents(movers, best.assignment);
  return normalized.map(student => {
    const destinationClass = best.assignment.get(student.id), rank = student.destinations.indexOf(destinationClass) + 1;
    const sensitive = (student.considerations || []).some(value => ["integration_bullying", "other"].includes(value));
    const points = destinationClass === student.classId ? 0 : Math.max(0, Number(student.basePoints) || 0);
    const status = !canStudentMove(student) ? "stayed_by_choice" : destinationClass === student.classId ? "fallback" : "moved";
    const manualReview = Boolean((rank !== 1 || status === "fallback") && (sensitive || student.notes?.trim()));
    return { studentId: student.id, originClass: student.classId, destinationClass, rank: rank || null, status, points, pointBreakdown: { integration: student.integrationPoints || 0, exception: student.exceptionPoints || 0 }, randomized: randomized.has(student.id), manualReview };
  });
}
