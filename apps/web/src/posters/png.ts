/** Write physical pixel density so image software can recover the selected paper size. */
export async function pngWithDpi(blob: Blob, dpi: number): Promise<Blob> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunk = new Uint8Array(21);
  const view = new DataView(chunk.buffer);
  view.setUint32(0,9);
  chunk.set([112,72,89,115],4);
  const pixelsPerMeter = Math.round(dpi/0.0254);
  view.setUint32(8,pixelsPerMeter);
  view.setUint32(12,pixelsPerMeter);
  chunk[16]=1;
  let crc=0xffffffff;
  for(const byte of chunk.subarray(4,17)){
    crc^=byte;
    for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);
  }
  view.setUint32(17,(crc^0xffffffff)>>>0);
  const parts: BlobPart[] = [bytes.slice(0,8)];
  const source=new DataView(bytes.buffer);
  for(let offset=8;offset<bytes.length;){
    const length=source.getUint32(offset)+12;
    const type=String.fromCharCode(...bytes.subarray(offset+4,offset+8));
    if(type!=="pHYs")parts.push(bytes.slice(offset,offset+length));
    if(type==="IHDR")parts.push(chunk);
    offset+=length;
  }
  return new Blob(parts,{type:"image/png"});
}
