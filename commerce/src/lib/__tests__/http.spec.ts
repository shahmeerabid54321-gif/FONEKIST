import { AppError } from '@pk/contracts';
import { fail } from '../http';
it('preserves field errors on AppError responses',()=>{
 const result=fail(new AppError('VALIDATION_ERROR',{fieldErrors:{coupon_code:['Coupon expired.']}}),'test-request',true);
 expect(result.status).toBe(400);expect(result.body.error.field_errors).toEqual({coupon_code:['Coupon expired.']});
});
