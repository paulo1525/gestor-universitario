export type DistributionOverrideResult={studentId:string;destinationClass:number;rank?:number|null;status?:string;manualReview?:boolean;randomized?:boolean;manualOverride?:boolean;[key:string]:unknown};
export type DistributionOverrideStudent={classId:number;studentDecision?:"stay"|"move"|null;destinations:number[]};
export type DistributionOverridePreview<T extends DistributionOverrideResult=DistributionOverrideResult>={
  nextResults:Array<T&{destinationClass:number;rank:number|null;status:string;manualReview:false;randomized:false;manualOverride:true}>;
  previousClass:number;
  beforeCounts:Record<string,number>;
  afterCounts:Record<string,number>;
  beforeDifference:number;
  afterDifference:number;
  allowedDifference:number;
  requiresImbalanceException:boolean;
};
export function previewDistributionOverride<T extends DistributionOverrideResult>(input:{results:T[];classIds:number[];student:DistributionOverrideStudent;studentId:string;destinationClass:number;allowedDifference:number}):DistributionOverridePreview<T>;
