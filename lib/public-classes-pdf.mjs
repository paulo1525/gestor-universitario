function latin1(value) {
  const normalized=String(value??"").replace(/[–—−]/g,"-").replace(/[“”]/g,'"').replace(/[‘’]/g,"'").normalize("NFC");
  const bytes=new Uint8Array(normalized.length);
  for(let index=0;index<normalized.length;index+=1){const code=normalized.charCodeAt(index);bytes[index]=code<=255?code:63}
  return bytes;
}

function concatBytes(parts){const length=parts.reduce((sum,part)=>sum+part.length,0),output=new Uint8Array(length);let offset=0;for(const part of parts){output.set(part,offset);offset+=part.length}return output}
function pdfText(value){return String(value??"").replace(/[–—−]/g,"-").replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/\\/g,"\\\\").replace(/\(/g,"\\(").replace(/\)/g,"\\)")}
function shorten(value,maxLength){const text=String(value??"");return text.length>maxLength?`${text.slice(0,maxLength-3).trimEnd()}...`:text}
function text(font,size,color,x,y,value){return `BT /${font} ${size} Tf ${color} rg ${x} ${y} Td (${pdfText(value)}) Tj ET\n`}
function line(x1,y1,x2,y2,color="0.82 0.80 0.73",width=0.6){return `${color} RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S\n`}

function pageStream({classId,students,publishedAt,pageNumber,pageCount,continuation}){
  let stream="0.982 0.978 0.956 rg 0 0 595 842 re f\n0.09 0.09 0.08 rg 0 752 595 90 re f\n0.93 0.72 0.08 rg 0 752 9 90 re f\n";
  stream+=text("F2",19,"1 1 1",42,799,"Turmas definitivas - 2.º ano");
  stream+=text("F1",9,"0.83 0.83 0.79",42,779,"Ano letivo 2026/2027 | Documento público");
  stream+=text("F2",22,"0.10 0.10 0.09",42,712,`Turma ${classId}${continuation?" - continuação":""}`);
  stream+=text("F1",9,"0.37 0.36 0.32",42,692,`${students.length} ${students.length===1?"estudante nesta página":"estudantes nesta página"} | Publicado em ${publishedAt}`);
  stream+="0.93 0.72 0.08 rg 42 650 511 31 re f\n";
  stream+=text("F2",9,"0.12 0.12 0.10",54,662,"NOME COMPLETO");
  stream+=text("F2",9,"0.12 0.12 0.10",438,662,"NÚMERO");
  let y=628;
  for(const student of students){stream+=text("F1",10,"0.15 0.15 0.13",54,y,shorten(student.fullName,55));stream+=text("F1",10,"0.25 0.24 0.21",438,y,student.studentNumber);stream+=line(42,y-9,553,y-9);y-=20}
  if(!students.length)stream+=text("F1",10,"0.40 0.39 0.34",54,620,"Sem estudantes registados.");
  stream+=line(42,54,553,54,"0.72 0.69 0.60",0.7);
  stream+=text("F1",8,"0.38 0.37 0.33",42,35,"Inclui apenas nome, número mecanográfico e turma final publicada.");
  stream+=text("F1",8,"0.38 0.37 0.33",486,35,`Página ${pageNumber} de ${pageCount}`);
  return latin1(stream);
}

export function buildPublicClassesPdf({classes,students,publishedAt}){
  const orderedClasses=[...new Set(classes.map(Number).filter(Number.isInteger))].sort((a,b)=>a-b),rows=[...students].sort((a,b)=>a.classId-b.classId||a.fullName.localeCompare(b.fullName,"pt")),pageSpecs=[];
  for(const classId of orderedClasses){const own=rows.filter(student=>student.classId===classId);if(!own.length)pageSpecs.push({classId,students:[],continuation:false});else for(let start=0;start<own.length;start+=27)pageSpecs.push({classId,students:own.slice(start,start+27),continuation:start>0})}
  if(!pageSpecs.length)pageSpecs.push({classId:0,students:[],continuation:false});
  const pageCount=pageSpecs.length,objects=new Map(),pageObjectIds=[];
  objects.set(3,latin1("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"));
  objects.set(4,latin1("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"));
  pageSpecs.forEach((spec,index)=>{const pageObjectId=5+index*2,contentObjectId=pageObjectId+1,stream=pageStream({...spec,publishedAt,pageNumber:index+1,pageCount});pageObjectIds.push(pageObjectId);objects.set(pageObjectId,latin1(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjectId} 0 R >>`));objects.set(contentObjectId,concatBytes([latin1(`<< /Length ${stream.length} >>\nstream\n`),stream,latin1("endstream")]))});
  objects.set(1,latin1("<< /Type /Catalog /Pages 2 0 R >>"));objects.set(2,latin1(`<< /Type /Pages /Kids [${pageObjectIds.map(id=>`${id} 0 R`).join(" ")}] /Count ${pageCount} >>`));
  const maxObject=Math.max(...objects.keys()),header=latin1("%PDF-1.4\n%âãÏÓ\n"),chunks=[header],offsets=Array(maxObject+1).fill(0);let offset=header.length;
  for(let id=1;id<=maxObject;id+=1){const body=objects.get(id),chunk=concatBytes([latin1(`${id} 0 obj\n`),body,latin1("\nendobj\n")]);offsets[id]=offset;chunks.push(chunk);offset+=chunk.length}
  const xrefOffset=offset,xref=`xref\n0 ${maxObject+1}\n0000000000 65535 f \n${offsets.slice(1).map(value=>`${String(value).padStart(10,"0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${maxObject+1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  chunks.push(latin1(xref));return concatBytes(chunks);
}
