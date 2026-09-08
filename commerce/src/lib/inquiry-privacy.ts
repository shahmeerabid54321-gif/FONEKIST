import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
function key(): Buffer {
  const value=process.env.INQUIRY_ENCRYPTION_KEY ?? '';
  if(!/^[a-f0-9]{64}$/i.test(value)) throw new Error('INQUIRY_ENCRYPTION_KEY must be a 32-byte hex key.');
  return Buffer.from(value,'hex');
}
export function encryptCustomer(customer: unknown): string {
  const nonce=randomBytes(12); const cipher=createCipheriv('aes-256-gcm',key(),nonce);
  const encrypted=Buffer.concat([cipher.update(JSON.stringify(customer),'utf8'),cipher.final()]);
  return ['v1',nonce.toString('base64'),cipher.getAuthTag().toString('base64'),encrypted.toString('base64')].join('.');
}
export function decryptCustomer(value: string): Record<string,string> {
  const [version,nonce,tag,data]=value.split('.');
  if(version!=='v1'||!nonce||!tag||!data)throw new Error('Invalid encrypted customer record.');
  const decipher=createDecipheriv('aes-256-gcm',key(),Buffer.from(nonce,'base64'));
  decipher.setAuthTag(Buffer.from(tag,'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data,'base64')),decipher.final()]).toString('utf8'));
}
/** Keyed fingerprint prevents low-entropy identity values being guessed from a DB hash. */
export function inquiryFingerprint(value: unknown): string {return createHmac('sha256',key()).update('fonekist-inquiry-v1\0').update(JSON.stringify(value)).digest('hex');}
