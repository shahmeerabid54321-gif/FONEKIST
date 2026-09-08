import {randomBytes} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
process.loadEnvFile('test-results/local-capacity/backend.env');
if(!process.env.DATABASE_URL?.endsWith('/fonekist_loadtest_20260908'))throw new Error('Isolated database required.');
const login={email:'owner-review@example.invalid',password:randomBytes(24).toString('base64url')};
writeFileSync('test-results/local-capacity/admin-login.json',JSON.stringify(login),{mode:0o600});
const result=spawnSync(process.execPath,['node_modules/@medusajs/cli/cli.js','user','-e',login.email,'-p',login.password],{cwd:'commerce',env:process.env,encoding:'utf8'});
if(result.status!==0){console.error('Local admin creation failed.');process.exit(1);}
console.log('Local review admin created; credentials saved to ignored local fixture.');
