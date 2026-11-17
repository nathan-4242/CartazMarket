import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "playwright-core";

const userId="11111111-1111-4111-8111-111111111111";
const organizationId="22222222-2222-4222-8222-222222222222";
const storeId="33333333-3333-4333-8333-333333333333";
const productId="44444444-4444-4444-8444-444444444444";
const promotionId="55555555-5555-4555-8555-555555555555";
const labelId="66666666-6666-4666-8666-666666666666";
const server=await createServer({
 root:".",server:{host:"127.0.0.1",port:5199,strictPort:true},
 define:{
  "import.meta.env.VITE_API_BASE_URL":JSON.stringify("http://api.test"),
  "import.meta.env.VITE_SUPABASE_URL":JSON.stringify("http://auth.test"),
  "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY":JSON.stringify("sb_publishable_test_only"),
  "import.meta.env.VITE_STORES":JSON.stringify(JSON.stringify([{id:storeId,organizationId,name:"Loja de teste"}])),
 },
});
await server.listen();
const browser=await chromium.launch({channel:"msedge",headless:true});
try{
 const context=await browser.newContext();
 const page=await context.newPage();
 page.setDefaultTimeout(12000);
 const errors=[];page.on("pageerror",error=>errors.push(error.message));
 const requests=[];
 let role="manager",expired=false,printed=false,failProducts=false;
 const date="2026-11-16T12:00:00Z";
 const label={id:labelId,productId,promotionId:null,regularAmount:"8.99",displayAmount:"8.99",promotionStartsAt:null,removalDueAt:null,status:"ready_to_print",createdAt:date};
 const product={productId,name:"Arroz catálogo",unit:"UN",currentAmount:"7.90",currency:"BRL",priceUpdatedAt:date};
 const jwt=[{alg:"HS256",typ:"JWT"},{sub:userId,exp:Math.floor(Date.now()/1000)+3600,aud:"authenticated"},{}].map(value=>Buffer.from(JSON.stringify(value)).toString("base64url")).join(".");
 await context.route("http://auth.test/**",async route=>{
  const url=new URL(route.request().url());
  if(url.pathname.endsWith("/logout"))return route.fulfill({status:204});
  return route.fulfill({json:{access_token:jwt,refresh_token:"test-only-refresh",token_type:"bearer",expires_in:3600,user:{id:userId,email:"teste@example.com",aud:"authenticated",created_at:date}}});
 });
 await context.route("http://api.test/**",async route=>{
  const request=route.request(),url=new URL(request.url());
  requests.push({path:url.pathname,search:url.search,method:request.method(),body:request.postDataJSON(),authorization:request.headers().authorization});
  if(expired)return route.fulfill({status:401,json:{error:"INVALID_TOKEN"}});
  assert.equal(request.headers().authorization,"Bearer "+jwt);
  if(url.pathname==="/v1/me")return route.fulfill({json:{user:{userId,email:"teste@example.com"},organizations:[{organizationId,organizationName:"Organização teste",role}]}});
  if(url.pathname.endsWith("/products")){
   if(failProducts)return route.fulfill({status:503,json:{error:"INTERNAL_SERVER_ERROR",message:"Teste de indisponibilidade"}});
   const offset=Number(url.searchParams.get("offset"));
   const products=offset===0?Array.from({length:25},(_,index)=>({...product,productId:index===0?productId:"77777777-7777-4777-8777-"+String(index).padStart(12,"0"),name:index===0?product.name:"Produto "+index})): [];
   return route.fulfill({json:{products,limit:25,offset}});
  }
  if(url.pathname.endsWith("/promotions")&&request.method()==="POST"){
   const body=request.postDataJSON();assert.equal(body.productId,productId);assert.equal(body.promotionalAmount,"6.50");
   return route.fulfill({status:201,json:{promotion:{id:promotionId}}});
  }
  if(url.pathname.endsWith("/promotions"))return route.fulfill({json:{promotions:[{id:promotionId,productId,productName:product.name,regularAmount:"7.90",promotionalAmount:"6.50",startsAt:"2030-01-01T12:00:00Z",endsAt:"2030-01-05T12:00:00Z",status:"scheduled"}],limit:25,offset:0}});
  if(url.pathname.endsWith("/labels")&&request.method()==="POST"){
   assert.equal(request.postDataJSON().productId,productId);
   return route.fulfill({status:201,json:{label,productName:product.name,unit:"UN"}});
  }
  if(url.pathname.endsWith("/labels"))return route.fulfill({json:{labels:[{...label,status:printed?"printed":"ready_to_print",productName:product.name,unit:"UN"}],limit:25,offset:0}});
  if(url.pathname.endsWith("/printed")){printed=true;return route.fulfill({json:{label:{id:labelId,status:"printed"}}});}
  if(url.pathname.endsWith("/print"))return route.fulfill({body:"<!doctype html><p>Contrato de impressão de teste</p>",contentType:"text/html"});
  throw new Error("Unexpected endpoint "+url.pathname);
 });
 await page.goto("http://127.0.0.1:5199/produtos");
 await page.getByRole("heading",{name:"Entre para acessar os dados da loja"}).waitFor();
 await page.getByRole("main").getByRole("link",{name:"Entrar na conta"}).click();
 async function login(){
  await page.getByLabel("E-mail",{exact:true}).fill("teste@example.com");
  await page.getByLabel("Senha",{exact:true}).fill("test-only-password");
  await page.getByRole("button",{name:"Entrar",exact:true}).click();
  await page.getByRole("button",{name:"Sair da conta",exact:true}).waitFor();
 }
 await login();
 await page.getByRole("navigation").getByRole("link",{name:"Produtos",exact:true}).click();
 await page.getByText("Arroz catálogo",{exact:true}).waitFor();
 await page.getByRole("button",{name:"Próxima",exact:true}).click();
 await page.getByText("Nenhum registro encontrado.",{exact:true}).waitFor();
 assert.ok(requests.some(request=>request.search.includes("offset=25")));
 await page.getByRole("button",{name:"Anterior",exact:true}).click();
 await page.getByLabel("Buscar produto por nome",{exact:true}).fill("Arroz");
 await page.waitForFunction(()=>document.querySelector(".data-table")!==null);
 await new Promise(resolve=>setTimeout(resolve,500));
 assert.ok(requests.some(request=>request.search.includes("q=Arroz")));
 await page.getByRole("row").filter({hasText:"Arroz catálogo"}).getByRole("button",{name:"Agendar promoção"}).click();
 await page.getByLabel("Preço promocional",{exact:true}).fill("6,50");
 await page.getByLabel("Início",{exact:true}).fill("2030-01-01T09:00");
 await page.getByLabel("Término",{exact:true}).fill("2030-01-05T09:00");
 await page.locator("form").getByRole("button",{name:"Agendar promoção",exact:true}).click();
 await page.getByText("Promoção agendada.",{exact:true}).waitFor();
 await page.getByRole("row").filter({hasText:"Arroz catálogo"}).getByRole("button",{name:"Criar cartaz",exact:true}).click();
 await page.getByText("Cartaz registrado na loja",{exact:true}).waitFor();
 assert.equal(await page.getByLabel("Preço (R$)").inputValue(),"8,99");
 assert.equal(await page.getByLabel("Preço (R$)").isDisabled(),true);
 assert.equal(await page.getByLabel("Nome do produto",{exact:true}).inputValue(),"Arroz catálogo");
 assert.ok(!await page.evaluate(()=>Object.values(localStorage).some(value=>String(value).includes("test-only-refresh"))));
 page.once("dialog",dialog=>dialog.accept());
 await page.getByRole("button",{name:"Confirmar impressão",exact:true}).click();
 await page.getByText("Impressão confirmada no servidor.",{exact:true}).waitFor();
 assert.equal(printed,true);
 await page.getByRole("navigation").getByRole("link",{name:"Produtos",exact:true}).click();
 failProducts=true;
 await page.getByRole("button",{name:"Atualizar",exact:true}).click();
 await page.getByText("Teste de indisponibilidade",{exact:true}).waitFor();
 failProducts=false;
 await page.getByRole("button",{name:"Tentar novamente",exact:true}).click();
 await page.getByText("Arroz catálogo",{exact:true}).waitFor();
 expired=true;
 await page.getByRole("button",{name:"Atualizar",exact:true}).click();
 await page.getByRole("heading",{name:"Entre para acessar os dados da loja"}).waitFor();
 role="operator";expired=false;
 await page.getByRole("main").getByRole("link",{name:"Entrar na conta"}).click();
 await login();
 await page.getByRole("navigation").getByRole("link",{name:"Produtos",exact:true}).click();
 await page.getByText("Arroz catálogo",{exact:true}).waitFor();
 assert.equal(await page.getByRole("button",{name:"Agendar promoção"}).count(),0);
 await page.getByRole("navigation").getByRole("link",{name:"Meus Cartazes",exact:true}).click();
 await page.getByRole("table").getByText("Impresso",{exact:true}).waitFor();
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 console.log("PASS: mocked API contracts, login, protected routes, pagination, debounce, promotion, authoritative label price, printed confirmation, errors, expiry and operator permissions.");
}finally{await browser.close();await server.close();}

