export type PublicClassPdfStudent={classId:number;fullName:string;studentNumber:string};
export function buildPublicClassesPdf(input:{classes:number[];students:PublicClassPdfStudent[];publishedAt:string;documentLabel?:string;dateLabel?:string;footer?:string}):Uint8Array;
