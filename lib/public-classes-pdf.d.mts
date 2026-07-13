export type PublicClassPdfStudent={classId:number;fullName:string;studentNumber:string};
export function buildPublicClassesPdf(input:{classes:number[];students:PublicClassPdfStudent[];publishedAt:string}):Uint8Array;
