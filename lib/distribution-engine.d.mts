export type DistributionStudent={id:string;classId:number;preference:"stay"|"move";studentDecision?:"stay"|"move"|null;destinations:number[];notes?:string|null;considerations?:string[];integrationPoints?:number;exceptionPoints?:number;basePoints?:number};
export type DistributionResult={studentId:string;originClass:number;destinationClass:number;rank:number|null;status:"stayed_by_choice"|"fallback"|"moved";points:number;pointBreakdown:{integration:number;exception:number};randomized:boolean;manualReview:boolean};
export type DistributionObjective="preferences"|"maximize_moves";
export function calculateDistribution(students:DistributionStudent[],options?:{seed?:string;maxDifference?:number;classIds?:number[];objective?:DistributionObjective}):DistributionResult[];
