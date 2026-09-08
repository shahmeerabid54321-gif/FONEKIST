import { encryptCustomer,decryptCustomer,inquiryFingerprint } from '../inquiry-privacy';
describe('inquiry identity storage',()=>{
 beforeEach(()=>{process.env.INQUIRY_ENCRYPTION_KEY='a'.repeat(64);});
 afterEach(()=>{delete process.env.INQUIRY_ENCRYPTION_KEY;});
 it('encrypts identity with unique authenticated ciphertext',()=>{
  const identity={cnic:'0000000000000',full_name:'Synthetic Customer'};
  const first=encryptCustomer(identity),second=encryptCustomer(identity);
  expect(first).not.toEqual(second);expect(first).not.toContain(identity.cnic);
  expect(decryptCustomer(first)).toEqual(identity);
 });
 it('rejects tampered identity and wrong keys',()=>{
  const data=encryptCustomer({cnic:'0000000000000'}).split('.');
  data[2]=Buffer.alloc(16).toString('base64');
  expect(()=>decryptCustomer(data.join('.'))).toThrow();
  process.env.INQUIRY_ENCRYPTION_KEY='b'.repeat(64);
  expect(()=>decryptCustomer(data.join('.'))).toThrow();
 });
 it('requires a real configured key',()=>{
  delete process.env.INQUIRY_ENCRYPTION_KEY;
  expect(()=>encryptCustomer({})).toThrow();
 });
 it('keys request fingerprints and binds payload changes',()=>{
  const a=inquiryFingerprint({name:'One'});
  expect(a).toEqual(inquiryFingerprint({name:'One'}));
  expect(a).not.toEqual(inquiryFingerprint({name:'Two'}));
  process.env.INQUIRY_ENCRYPTION_KEY='b'.repeat(64);
  expect(a).not.toEqual(inquiryFingerprint({name:'One'}));
 });
});
