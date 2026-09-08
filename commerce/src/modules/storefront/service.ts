import { MedusaService } from '@medusajs/framework/utils';
import { StorefrontContent, InquiryCoupon, StorefrontInquiry, InquiryAccess } from './models';
export default class StorefrontService extends MedusaService({StorefrontContent, InquiryCoupon, StorefrontInquiry, InquiryAccess}) {}
