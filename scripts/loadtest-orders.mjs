#!/usr/bin/env node
/** Real HTTP submission tests; restricted to the disposable local database and backend.
 * Synthetic document metadata exercises submission, not upload/scanning or approval.
 * Unique forwarded test addresses model distinct clients; this does not verify proxy trust.
 */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

process.loadEnvFile('test-results/local-capacity/storefront.env');
const target = process.env.MEDUSA_BACKEND_URL;
if (target !== 'http://localhost:9100') throw new Error('Only isolated localhost:9100 is allowed.');
const database = 'fonekist_loadtest_20260908';
const runId = randomUUID();
const testEmail = `loadtest-${runId}@example.invalid`;
const sql = (query) => execFileSync('psql', ['-h','127.0.0.1','-d',database,'-At','-v','ON_ERROR_STOP=1','-c',query], {encoding:'utf8'}).trim();
const quote = (value) => "'" + String(value).replaceAll("'", "''") + "'";
const select = (query) => JSON.parse(sql(`SELECT coalesce(json_agg(x),'[]') FROM (${query}) x`));
const concurrency = Number(process.env.ORDER_CONCURRENCY ?? 10);
if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 100) throw new Error('ORDER_CONCURRENCY must be 1..100.');
const ipPrefix = Math.floor(Math.random()*240)+1;
let client = 0;
async function request(path, body, key, ip) {
  const start=performance.now();
  const response = await fetch(target+path, {method:body?'POST':'GET',headers:{'content-type':'application/json','x-publishable-api-key':process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,...(key?{'idempotency-key':key}:{}),...(ip?{'x-forwarded-for':ip}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000)});
  const data=await response.json();
  return {status:response.status,ms:Math.round(performance.now()-start),data};
}
const product=select(`SELECT ip.id AS plan_id,ip.variant_id,ip.product_id,p.handle,il.id AS level_id,il.stocked_quantity FROM installment_plan ip JOIN product p ON p.id=ip.product_id JOIN product_variant_inventory_item vi ON vi.variant_id=ip.variant_id JOIN inventory_level il ON il.inventory_item_id=vi.inventory_item_id WHERE ip.active=true AND il.stocked_quantity-il.reserved_quantity>=20 ORDER BY ip.cash_price_pkr LIMIT 1`)[0];
if(!product) throw new Error('No test handset with at least 20 available units.');
sql(`UPDATE inventory_level SET stocked_quantity=reserved_quantity+${concurrency+20},raw_stocked_quantity=jsonb_build_object('value',(reserved_quantity+${concurrency+20})::text,'precision',20) WHERE id=${quote(product.level_id)}`);
const regions=await request('/store/regions');
const region=regions.data.regions.find(r=>r.currency_code==='pkr');
if(!region) throw new Error('No PKR region.');
async function prepare() {
  const index=++client;
  const cart=await request('/store/carts',{region_id:region.id});
  if(cart.status!==200) throw new Error(`Create cart: ${cart.status}`);
  const added=await request(`/store/carts/${cart.data.cart.id}/line-items`,{variant_id:product.variant_id,quantity:1});
  if(added.status!==200) throw new Error(`Add line: ${added.status}`);
  const kinds=['cnic_front','cnic_back','guarantor_cnic_front','guarantor_cnic_back'];
  const ids=kinds.map(()=>`idoc_load_${randomUUID()}`);
  sql(`INSERT INTO installment_document (id,upload_token,kind,storage_key,mime_type,size_bytes,sha256,scan_status) VALUES ${kinds.map((kind,i)=>`(${quote(ids[i])},${quote(runId)},${quote(kind)},${quote('loadtest/no-file/'+ids[i])},'image/png',12,${quote('0'.repeat(64))},'pending')`).join(',')}`);
  const address={full_name:'Synthetic Load Test',phone:'03000000000',province:'Sindh',city:'Karachi',area:'Test locality',street:'Test house on a synthetic street for local testing only'};
  return {ip:`198.18.${ipPrefix}.${index%250+1}`,key:randomUUID(),body:{cart_id:cart.data.cart.id,plan_id:product.plan_id,applicant:{full_name:address.full_name,cnic:'0000000000000',phone:address.phone,email:testEmail,date_of_birth:'1990-01-01',employment_type:'salaried',monthly_income_pkr:100000,address},guarantor:{full_name:'Synthetic Guarantor',cnic:'0000000000001',phone:'03000000001',relationship:'Test guarantor'},document_ids:ids,consent:{accepted:true,terms_version:'2026-08-27'}}};
}
async function submit(f) {return request('/store/installment-applications',f.body,f.key,f.ip);}
const report={runId,createdAt:new Date().toISOString(),target,database,product:product.handle,limitations:['Synthetic pending document metadata; upload/scanning not tested.','Direct backend HTTP; browser form not tested.','In-memory workflow engine; Redis deployment not tested.','Forwarded addresses simulate distinct clients.'],scenarios:[]};
function record(name,responses,check){
  const timings=responses.map(r=>r.ms).sort((a,b)=>a-b);
  const result={name,requests:responses.length,statuses:responses.reduce((a,r)=>(a[r.status]=(a[r.status]??0)+1,a),{}),p50:timings[Math.ceil(timings.length*.5)-1],p95:timings[Math.ceil(timings.length*.95)-1],p99:timings[Math.ceil(timings.length*.99)-1],...check};
  report.scenarios.push(result);console.log(JSON.stringify(result));
}
try {
  const fixtures=[];for(let i=0;i<concurrency;i++)fixtures.push(await prepare());
  const started=performance.now();
  const results=await Promise.all(fixtures.map(submit));
  const carts=fixtures.map(f=>quote(f.body.cart_id)).join(',');
  const stored=select(`SELECT cart_id,count(*)::int AS count FROM installment_application WHERE cart_id IN (${carts}) GROUP BY cart_id`);
  record(`${concurrency} distinct simultaneous applications`,results,{elapsedMs:Math.round(performance.now()-started),applications:stored.length,passed:results.every(r=>r.status===201)&&stored.length===concurrency&&stored.every(r=>r.count===1),errors:results.filter(r=>r.status>=400).map(r=>({status:r.status,code:r.data.error?.code,message:r.data.error?.message}))});
  const duplicate=await prepare();
  const retries=await Promise.all(Array.from({length:4},()=>submit(duplicate)));
  const replay=await submit(duplicate);
  const count=Number(sql(`SELECT count(*) FROM installment_application WHERE cart_id=${quote(duplicate.body.cart_id)}`));
  const references=[...retries,replay].filter(r=>r.status===201).map(r=>r.data.data?.reference);
  record('Simultaneous duplicates and completed replay',[...retries,replay],{applications:count,uniqueReferences:new Set(references).size,passed:count===1&&replay.status===201&&new Set(references).size===1&&retries.every(r=>[201,409].includes(r.status))});
  // Restrict only this disposable handset to five remaining units; ten customers compete.
  sql(`UPDATE inventory_level SET stocked_quantity=reserved_quantity+5,raw_stocked_quantity=jsonb_build_object('value',(reserved_quantity+5)::text,'precision',20) WHERE id=${quote(product.level_id)}`);
  const scarce=[];for(let i=0;i<10;i++)scarce.push(await prepare());
  const contested=await Promise.all(scarce.map(submit));
  const stock=select(`SELECT stocked_quantity,reserved_quantity FROM inventory_level WHERE id=${quote(product.level_id)}`)[0];
  const successful=contested.filter(r=>r.status===201).length;
  record('10 customers compete for 5 remaining units',contested,{successful,stock,passed:successful===5&&Number(stock.reserved_quantity)<=Number(stock.stocked_quantity)&&contested.every(r=>[201,409,400].includes(r.status)),errors:contested.filter(r=>r.status>=400).map(r=>({status:r.status,code:r.data.error?.code,message:r.data.error?.message}))});
} catch(error) {report.fatal={name:error.name,message:error.message};console.error(report.fatal);}
report.integrity=select(`SELECT count(*)::int AS applications,count(DISTINCT order_id)::int AS distinct_orders,count(DISTINCT cart_id)::int AS distinct_carts FROM installment_application WHERE applicant_email=${quote(testEmail)}`)[0];
report.passed=!report.fatal&&report.scenarios.every(s=>s.passed);
mkdirSync('test-results/local-capacity',{recursive:true});
writeFileSync(`test-results/local-capacity/orders-${runId}.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:report.passed,integrity:report.integrity}));
process.exitCode=report.passed?0:1;
