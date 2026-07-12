function tie(seed, id) {
  let hash = 2166136261;
  for (const character of `${seed}:${id}`) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}

function canStudentMove(student) {
  return Boolean(student) && (Object.prototype.hasOwnProperty.call(student, "studentDecision") ? student.studentDecision === "move" : student.preference === "move");
}

function destinationScore(student, destination) {
  const reference = (student?.friendPreferences || []).find(friend => friend.destinationClass === destination && friend.valid);
  return (student?.basePoints || 0) + (reference ? 1 : 0);
}

function comparePlacementPriority(first, second, destination) {
  const firstRank = first.destinations.indexOf(destination);
  const secondRank = second.destinations.indexOf(destination);
  return (firstRank < 0 ? Number.MAX_SAFE_INTEGER : firstRank) - (secondRank < 0 ? Number.MAX_SAFE_INTEGER : secondRank) || destinationScore(second, destination) - destinationScore(first, destination);
}

export function calculateDistribution(students, { seed = "distribution", maxDifference = 3, classIds } = {}) {
  const ordered = students.map(student => ({ ...student, destinations: [...student.destinations] }))
    .sort((a, b) => tie(seed, a.id) - tie(seed, b.id));
  const assignment = new Map(ordered.map(student => [student.id, student.classId]));
  const byId = new Map(ordered.map(student => [student.id, student]));
  const activeClasses = classIds?.length ? [...new Set(classIds)].sort((a,b)=>a-b) : [...new Set(students.flatMap(student=>[student.classId,...student.destinations]))].sort((a,b)=>a-b);
  const occupants = new Map(activeClasses.map(id => [id, new Set()]));
  for (const student of ordered) {
    if (!occupants.has(student.classId)) throw new Error(`A turma de origem ${student.classId} não está ativa.`);
    occupants.get(student.classId).add(student.id);
  }
  const initialCounts = [...occupants.values()].map(group => group.size);
  const maxSize = Math.min(...initialCounts) + maxDifference;
  const randomized = new Set();

  function relocate(studentId, destination, visiting) {
    if (visiting.has(studentId)) return false;
    const student = byId.get(studentId);
    if (!student || !canStudentMove(student)) return false;
    const origin = assignment.get(studentId);
    if (origin === destination) return true;
    const target = occupants.get(destination);
    if (!target) return false;
    if (target.size >= maxSize) {
      const nextVisiting = new Set(visiting).add(studentId);
      const candidates = [...target].filter(id => {
        const occupant = byId.get(id);
        const comparison = comparePlacementPriority(student, occupant, destination);
        return canStudentMove(occupant) && (comparison < 0 || (comparison === 0 && tie(seed, student.id) < tie(seed, id)));
      }).sort((a, b) => comparePlacementPriority(byId.get(b), byId.get(a), destination) || tie(seed, a) - tie(seed, b));
      let opened = false;
      for (const occupantId of candidates) {
        const occupant = byId.get(occupantId);
        for (const alternative of [...occupant.destinations, occupant.classId]) {
          if (alternative !== destination && relocate(occupantId, alternative, nextVisiting)) { opened = true; randomized.add(occupantId); break; }
        }
        if (opened) break;
      }
      if (!opened) return false;
    }
    occupants.get(origin).delete(studentId);
    target.add(studentId);
    assignment.set(studentId, destination);
    return true;
  }

  for (const student of ordered.filter(canStudentMove)) {
    for (const destination of student.destinations) if (relocate(student.id, destination, new Set())) break;
  }
  const finalCounts = [...occupants.values()].map(group => group.size);
  if (Math.max(...finalCounts) - Math.min(...finalCounts) > maxDifference) throw new Error(`Não foi encontrada uma distribuição que respeite a diferença máxima de ${maxDifference} estudantes.`);
  return ordered.map(student => {
    const destinationClass = assignment.get(student.id);
    const rank = student.destinations.indexOf(destinationClass) + 1;
    const sensitive=(student.considerations||[]).some(value=>["integration_bullying","other_exception","bullying_discrimination","serious_integration"].includes(value));
    const matchedReference=(student.friendPreferences||[]).find(friend=>friend.destinationClass===destinationClass&&friend.valid);
    const points=destinationClass===student.classId?0:destinationScore(student,destinationClass),status=!canStudentMove(student)?"stayed_by_choice":destinationClass===student.classId?"fallback":"moved";
    const manualReview=Boolean((rank!==1||status==="fallback")&&(sensitive||student.notes?.trim()));
    return { studentId: student.id, originClass: student.classId, destinationClass, rank: rank || null, status, points,pointBreakdown:{integration:student.integrationPoints||0,exception:student.exceptionPoints||0,reference:matchedReference?1:0}, randomized: randomized.has(student.id), manualReview,supportMatched:false,groupMatched:false,friendMatched:Boolean(matchedReference),matchedFriendIds:matchedReference?[matchedReference.friendStudentId]:[],unmatchedFriendIds:[],friendMatchPartial:false };
  });
}
