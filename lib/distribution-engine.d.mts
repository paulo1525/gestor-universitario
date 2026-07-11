export type DistributionStudent={id:string;classId:number;preference:"stay"|"move";destinations:number[];notes?:string|null};
export type DistributionResult={studentId:string;originClass:number;destinationClass:number;rank:number|null;status:"stayed_by_choice"|"fallback"|"moved";randomized:boolean;manualReview:boolean};
export function calculateDistribution(students:DistributionStudent[],options?:{seed?:string;maxDifference?:number;classIds?:number[]}):DistributionResult[];
