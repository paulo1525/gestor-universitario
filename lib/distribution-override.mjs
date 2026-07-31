function classCounts(results, classIds) {
  const counts = new Map(classIds.map(classId => [classId, 0]));
  for (const result of results) counts.set(result.destinationClass, (counts.get(result.destinationClass) || 0) + 1);
  return counts;
}

function distributionDifference(counts) {
  const sizes = [...counts.values()];
  return sizes.length ? Math.max(...sizes) - Math.min(...sizes) : 0;
}

export function previewDistributionOverride({ results, classIds, student, studentId, destinationClass, allowedDifference }) {
  if (!Array.isArray(results) || !Array.isArray(classIds) || !classIds.includes(destinationClass)) throw new Error("INVALID_DESTINATION");
  const index = results.findIndex(result => result.studentId === studentId);
  if (index < 0 || !student) throw new Error("STUDENT_NOT_FOUND");

  const beforeCounts = classCounts(results, classIds);
  const beforeDifference = distributionDifference(beforeCounts);
  const previousClass = results[index].destinationClass;
  const nextResults = results.map((result, resultIndex) => resultIndex === index ? {
    ...result,
    destinationClass,
    rank: student.destinations.indexOf(destinationClass) + 1 || null,
    status: destinationClass === student.classId ? (student.studentDecision === "move" ? "fallback" : "stayed_by_choice") : "moved",
    manualReview: false,
    randomized: false,
    manualOverride: true,
  } : { ...result });
  const afterCounts = classCounts(nextResults, classIds);
  const afterDifference = distributionDifference(afterCounts);

  return {
    nextResults,
    previousClass,
    beforeCounts: Object.fromEntries(beforeCounts),
    afterCounts: Object.fromEntries(afterCounts),
    beforeDifference,
    afterDifference,
    allowedDifference,
    requiresImbalanceException: afterDifference > allowedDifference,
  };
}
