#!/usr/bin/env node
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {writeFileSync,mkdirSync} from 'node:fs';
process.loadEnvFile('test-results/local-capacity/storefront.env');
if(process.env.MEDUSA_BACKEND_URL!=='http://localhost:9100')throw new Error('Only the isolated localhost test backend is allowed.');
const database='fonekist_loadtest_20260908';
const sql=q=>execFileSync('psql',['-h','127.0.0.1',database,'-At','-v','ON_ERROR_STOP=1','-c',q],{encoding:'utf8'}).trim();
const quote=v=>"'"+String(v).replaceAll("'","''")+"'";
const select=q=>JSON.parse(sql(`SELECT coalesce(json_agg(x),'[]') FROM (${q})x`));
const channel=sql("SELECT id FROM sales_channel WHERE name='FONEKIST'");
const plan=select(`SELECT p.* FROM installment_plan p JOIN product_sales_channel c ON c.product_id=p.product_id WHERE c.sales_channel_id=${quote(channel)} AND p.active=true LIMIT 1`)[0];
if(!plan)throw new Error('No test plan.');
const runId=randomUUID(),code='TEST_'+runId.slice(0,8).toUpperCase();
const count=Number(process.env.INQUIRY_CONCURRENCY??100);if(!Number.isSafeInteger(count)||count<1||count>1000)throw new Error('Concurrency must be 1..1000.');
const before=Number(sql('SELECT count(*) FROM "order"'));
const body={items:[{variant_id:plan.variant_id,plan_id:plan.id,expected_advance_pkr:plan.advance_pkr,expected_monthly_pkr:plan.monthly_pkr,expected_tenure_months:plan.tenure_months,expected_total_pkr:plan.total_payable_pkr}],full_name:'Synthetic Inquiry',phone:'03000000000',alternative_phone:'',email:'',cnic:'0000000000000',city:'Karachi',area:'Other Karachi area',address:'Synthetic house on test street in Karachi near the test landmark',notes:'Synthetic localhost capacity fixture',coupon_code:'',consent:true,terms_version:'inquiry-2026-09-08'};
let index=0;const prefix=Math.floor(Math.random()*200)+1;
async function post(payload,key=randomUUID()){
 const i=++index,start=performance.now();
 try{const r=await fetch('http://localhost:9100/store/inquiries',{method:'POST',headers:{'content-type':'application/json','x-publishable-api-key':process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,'idempotency-key':key,'x-forwarded-for':`198.${prefix}.${Math.floor(i/250)}.${i%250+1}`},body:JSON.stringify(payload),signal:AbortSignal.timeout(30000)});return{status:r.status,ms:Math.round(performance.now()-start),data:await r.json()};}
 catch(error){return{status:0,ms:Math.round(performance.now()-start),data:{error:{message:error.message,cause:error.cause?.code}}};}
}
const report={runId,createdAt:new Date().toISOString(),database,scenarios:[]};
function record(name,results,passed,detail={}){const latency=results.map(r=>r.ms).sort((a,b)=>a-b);const scenario={name,requests:results.length,statuses:results.reduce((a,r)=>(a[r.status]=(a[r.status]??0)+1,a),{}),p95:latency[Math.ceil(latency.length*.95)-1],p99:latency[Math.ceil(latency.length*.99)-1],passed,...detail,errors:results.filter(r=>r.status!==201&&r.status!==200).slice(0,3).map(r=>r.data.error)};report.scenarios.push(scenario);console.log(JSON.stringify(scenario));}
const start=performance.now(),distinct=await Promise.all(Array.from({length:count},()=>post(body)));record(`${count} simultaneous inquiries`,distinct,distinct.every(r=>r.status===201),{elapsedMs:Math.round(performance.now()-start)});
const duplicateKey=randomUUID();const duplicates=await Promise.all(Array.from({length:20},()=>post(body,duplicateKey)));const unique=new Set(duplicates.map(r=>r.data.data?.reference));record('20 identical simultaneous submissions',duplicates,duplicates.every(r=>[200,201].includes(r.status))&&unique.size===1,{uniqueReferences:unique.size});
sql(`INSERT INTO inquiry_coupon(id,channel_id,code,discount_pkr,minimum_advance_pkr,max_redemptions,redemptions,active) VALUES (${quote('icoupon_'+runId)},${quote(channel)},${quote(code)},100,0,5,0,true)`);
const coupon=await Promise.all(Array.from({length:20},()=>post({...body,coupon_code:code})));
const redeemed=Number(sql(`SELECT redemptions FROM inquiry_coupon WHERE code=${quote(code)}`));record('20 customers compete for 5 coupon redemptions',coupon,coupon.filter(r=>r.status===201).length===5&&coupon.filter(r=>r.status===400).length===15&&redeemed===5,{redemptions:redeemed});
const stale=await post({...body,items:[{...body.items[0],expected_total_pkr:1}]});record('Changed price requires review',[stale],stale.status===409&&stale.data.error?.code==='PRICE_CHANGED');
const invalidCity=await post({...body,city:'Lahore'});record('Unsupported city rejected',[invalidCity],invalidCity.status===400);
const altered=await post({...body,phone:'03000000001'},duplicateKey);record('Retry key cannot change customer',[altered],altered.status===409);
const after=Number(sql('SELECT count(*) FROM "order"'));
report.ordersCreated=after-before;report.passed=report.ordersCreated===0&&report.scenarios.every(s=>s.passed);
mkdirSync('test-results/local-capacity',{recursive:true});writeFileSync(`test-results/local-capacity/inquiries-${runId}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,ordersCreated:report.ordersCreated}));process.exitCode=report.passed?0:1;
