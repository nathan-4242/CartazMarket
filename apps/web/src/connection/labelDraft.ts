import { readDraft } from "../posters/draft";
import { readPosters } from "../posters/PosterLibrary";
import { emptyDraft, type Draft } from "../posters/draft";
import { units, type Unit } from "../posters/price";
import type { Label } from "./contracts";
import { decimalToBrazilian } from "./contracts";

function unitForPoster(value:string):Unit {
  const normalized=value.trim().toUpperCase();
  const aliases:Record<string,Unit>={UN:"UNIDADE",UND:"UNIDADE",KG:"KG",L:"LITRO",LT:"LITRO",G:"GRAMA",GR:"GRAMA",PCT:"PACOTE",PC:"PACOTE",CX:"CAIXA",FD:"FARDO"};
  if(units.includes(normalized as Unit))return normalized as Unit;
  if(aliases[normalized])return aliases[normalized];
  return normalized as Unit;
}
function localDate(value:string|null){
  if(!value)return "";
  return new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(value));
}
export function labelToDraft(label:Label,storeId:string,userId:string):Draft {
  const current = readDraft();
  let existing = current.source?.labelId === label.id && current.source.storeId === storeId && current.source.userId === userId ? current : undefined;
  if (!existing) {
    try { existing = readPosters().find((item) => item.draft.source?.labelId === label.id && item.draft.source.storeId === storeId && item.draft.source.userId === userId)?.draft; } catch { /* The active editor can still open the server snapshot. */ }
  }
  return {
    ...structuredClone(existing ?? emptyDraft),
    product:label.productName,price:decimalToBrazilian(label.displayAmount),unit:unitForPoster(label.unit),
    start:localDate(label.promotionStartsAt),end:localDate(label.removalDueAt),
    source:{storeId,userId,labelId:label.id,productId:label.productId},
  };
}
