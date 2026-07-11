function tie(seed, id) {
  let hash = 2166136261;
  for (const character of `${seed}:${id}`) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}

export function calculateDistribution(students, { seed = "distribution", maxDifference = 3, classIds } = {}) {
  const ordered = students.map(student => {
    const shared=(student.friendPreferences||[]).flatMap(friend=>student.destinations.filter(classId=>friend.destinations.includes(classId)).map(classId=>({classId,worst:Math.max(student.destinations.indexOf(classId),friend.destinations.indexOf(classId)),sum:student.destinations.indexOf(classId)+friend.destinations.indexOf(classId),rank:friend.rank}))).sort((a,b)=>a.worst-b.worst||a.sum-b.sum||a.rank-b.rank||tie(seed,`${student.id}:${a.classId}`)-tie(seed,`${student.id}:${b.classId}`)).map(item=>item.classId);
    const preferred=[student.supportClass,...shared,...student.destinations].filter((id,index,list)=>Number.isInteger(id)&&student.destinations.includes(id)&&list.indexOf(id)===index);
    return { ...student, destinations: preferred };
  })
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
    if (!student || student.preference !== "move") return false;
    const origin = assignment.get(studentId);
    if (origin === destination) return true;
    const target = occupants.get(destination);
    if (!target) return false;
    if (target.size >= maxSize) {
      const nextVisiting = new Set(visiting).add(studentId);
      const candidates = [...target].filter(id => byId.get(id)?.preference === "move")
        .sort((a, b) => tie(seed, a) - tie(seed, b));
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

  for (const student of ordered.filter(item => item.preference === "move")) {
    for (const destination of student.destinations) if (relocate(student.id, destination, new Set())) break;
  }
  const finalCounts = [...occupants.values()].map(group => group.size);
  if (Math.max(...finalCounts) - Math.min(...finalCounts) > maxDifference) throw new Error("Não existe uma distribuição que respeite a diferença máxima de três estudantes.");
  return ordered.map(student => {
    const destinationClass = assignment.get(student.id);
    const rank = student.destinations.indexOf(destinationClass) + 1;
    const sensitive=(student.considerations||[]).some(value=>["bullying_discrimination","serious_integration","other_exception"].includes(value));
    const matchedFriendIds=(student.friendPreferences||[]).filter(friend=>assignment.get(friend.friendStudentId)===destinationClass).map(friend=>friend.friendStudentId),unmatchedFriendIds=(student.friendPreferences||[]).filter(friend=>assignment.get(friend.friendStudentId)!==destinationClass).map(friend=>friend.friendStudentId);
    return { studentId: student.id, originClass: student.classId, destinationClass, rank: rank || null, status: student.preference === "stay" ? "stayed_by_choice" : destinationClass === student.classId ? "fallback" : "moved", randomized: randomized.has(student.id), manualReview: sensitive||Boolean(student.notes?.trim()),supportMatched:Boolean(student.supportClass&&destinationClass===student.supportClass),groupMatched:false,friendMatched:matchedFriendIds.length>0,matchedFriendIds,unmatchedFriendIds,friendMatchPartial:matchedFriendIds.length>0&&unmatchedFriendIds.length>0 };
  });
}
