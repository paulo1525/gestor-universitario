export type PlacementStudent={full_name:string;student_number:string;class_id:number;student_decision:"stay"|"move"|null;notes?:string|null;exception_points:number;exception_reviewed_at?:number|null;additional_info_validation?:string|null};
export type PlacementMove={destinationClass:number;rank:number|null;status:string;manualOverride?:boolean};
export type PlacementFilters={query:string;origin:string;destination:string;decision:string;result:string;validation:string;points:string;assignment:string};
export function placementOutcome(student:PlacementStudent,move?:PlacementMove):{key:string;tone:string;destinationClass:number;label:string};
export function placementDecision(student:PlacementStudent):string;
export function placementValidation(student:PlacementStudent):string;
export function matchesPlacementFilters(row:{student:PlacementStudent;move?:PlacementMove;destinations:number[]},filters:PlacementFilters):boolean;
