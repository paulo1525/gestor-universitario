export function placementOutcome(student,move){
  const destinationClass=move?.destinationClass??student.class_id;
  if(!move)return {key:"pending",tone:"neutral",destinationClass,label:`Turma ${destinationClass} · Por calcular`};
  const wantedMove=student.student_decision==="move";
  if(wantedMove&&(move.status==="fallback"||destinationClass===student.class_id))return {key:"failed",tone:"red",destinationClass,label:`Turma ${destinationClass} · Não conseguiu mudar`};
  if(move.status==="moved"&&move.rank===1)return {key:"first",tone:"green",destinationClass,label:`Turma ${destinationClass} · 1.ª preferência`};
  if(move.status==="moved"&&Number(move.rank)>1)return {key:"later",tone:"orange",destinationClass,label:`Turma ${destinationClass} · ${move.rank}.ª preferência`};
  return {key:"stay",tone:"green",destinationClass,label:`Turma ${destinationClass} · Fica`};
}

export function placementDecision(student){
  if(student.student_decision==="move")return "move";
  if(student.student_decision==="stay")return "stay";
  return "automatic";
}

export function placementValidation(student){
  if(student.notes&&!student.exception_reviewed_at)return "pending";
  if(student.additional_info_validation||student.exception_reviewed_at)return "validated";
  return "none";
}

export function matchesPlacementFilters(row,filters){
  const {student,move,destinations}=row,outcome=placementOutcome(student,move),decision=placementDecision(student),validation=placementValidation(student);
  const searchable=[student.full_name,student.student_number,`turma ${student.class_id}`,`t${student.class_id}`,`turma ${outcome.destinationClass}`,`t${outcome.destinationClass}`,outcome.label,...destinations.map(value=>`turma ${value}`),...destinations.map(value=>`t${value}`)].join(" ").toLocaleLowerCase("pt-PT");
  const query=String(filters.query||"").trim().toLocaleLowerCase("pt-PT");
  return (!query||searchable.includes(query))
    &&(!filters.origin||Number(filters.origin)===student.class_id)
    &&(!filters.destination||Number(filters.destination)===outcome.destinationClass)
    &&(!filters.decision||filters.decision===decision)
    &&(!filters.result||filters.result===outcome.key)
    &&(!filters.validation||filters.validation===validation)
    &&(!filters.points||(filters.points==="with"?Number(student.exception_points)>0:Number(student.exception_points)===0))
    &&(!filters.assignment||(filters.assignment==="manual"?Boolean(move?.manualOverride):!move?.manualOverride));
}
