export type ApiErrors = {
  'advice_code'?: string;
  'charge'?: string;
  'code'?: string;
  'decline_code'?: string;
  'doc_url'?: string;
  'message'?: string;
  'network_advice_code'?: string;
  'network_decline_code'?: string;
  'param'?: string;
  'payment_intent'?: PaymentIntent;
  'payment_method'?: PaymentMethod;
  'payment_method_type'?: string;
  'request_log_url'?: string;
  'setup_intent'?: SetupIntent;
  'source'?: Record<string, any>;
  'type': string;
};

export type AutomaticTax = {
  'disabled_reason'?: string;
  'enabled': boolean;
  'liability'?: Record<string, any>;
  'provider'?: string;
  'status'?: string;
};

export type BillingBillResourceInvoicingTaxesTax = {
  'amount': number;
  'tax_behavior': string;
  'tax_rate_details'?: Record<string, any>;
  'taxability_reason': string;
  'taxable_amount'?: number;
  'type': string;
};

export type BillingDetails = {
  'address'?: Record<string, any>;
  'email'?: string;
  'name'?: string;
  'phone'?: string;
  'tax_id'?: string;
};

export type CheckoutSession = {
  'adaptive_pricing'?: Record<string, any>;
  'after_expiration'?: Record<string, any>;
  'allow_promotion_codes'?: boolean;
  'amount_subtotal'?: number;
  'amount_total'?: number;
  'automatic_tax': PaymentPagesCheckoutSessionAutomaticTax;
  'billing_address_collection'?: string;
  'branding_settings'?: PaymentPagesCheckoutSessionBrandingSettings;
  'cancel_url'?: string;
  'client_reference_id'?: string;
  'client_secret'?: string;
  'collected_information'?: Record<string, any>;
  'consent'?: Record<string, any>;
  'consent_collection'?: Record<string, any>;
  'created': number;
  'currency'?: string;
  'currency_conversion'?: Record<string, any>;
  'custom_fields': PaymentPagesCheckoutSessionCustomFields[];
  'custom_text': PaymentPagesCheckoutSessionCustomText;
  'customer'?: Record<string, any>;
  'customer_account'?: string;
  'customer_creation'?: string;
  'customer_details'?: Record<string, any>;
  'customer_email'?: string;
  'discounts'?: PaymentPagesCheckoutSessionDiscount[];
  'excluded_payment_method_types'?: string[];
  'expires_at': number;
  'id': string;
  'integration_identifier'?: string;
  'invoice'?: Record<string, any>;
  'invoice_creation'?: Record<string, any>;
  'line_items'?: {
    'data': Item[];
    'has_more': boolean;
    'object': string;
    'url': string;
  };
  'livemode': boolean;
  'locale'?: string;
  'managed_payments'?: Record<string, any>;
  'metadata'?: Record<string, any>;
  'mode': string;
  'name_collection'?: PaymentPagesCheckoutSessionNameCollection;
  'object': string;
  'optional_items'?: PaymentPagesCheckoutSessionOptionalItem[];
  'origin_context'?: string;
  'payment_intent'?: Record<string, any>;
  'payment_link'?: Record<string, any>;
  'payment_method_collection'?: string;
  'payment_method_configuration_details'?: Record<string, any>;
  'payment_method_options'?: Record<string, any>;
  'payment_method_types': string[];
  'payment_status': string;
  'permissions'?: Record<string, any>;
  'phone_number_collection'?: PaymentPagesCheckoutSessionPhoneNumberCollection;
  'presentment_details'?: PaymentFlowsPaymentIntentPresentmentDetails;
  'recovered_from'?: string;
  'redirect_on_completion'?: string;
  'return_url'?: string;
  'saved_payment_method_options'?: Record<string, any>;
  'setup_intent'?: Record<string, any>;
  'shipping_address_collection'?: Record<string, any>;
  'shipping_cost'?: Record<string, any>;
  'shipping_options': PaymentPagesCheckoutSessionShippingOption[];
  'status'?: string;
  'submit_type'?: string;
  'subscription'?: Record<string, any>;
  'success_url'?: string;
  'tax_id_collection'?: PaymentPagesCheckoutSessionTaxIdCollection;
  'total_details'?: Record<string, any>;
  'ui_mode'?: string;
  'url'?: string;
  'wallet_options'?: Record<string, any>;
};

export type ConnectAccountReference = {
  'account'?: Record<string, any>;
  'type': string;
};

export type CurrencyOption = {
  'custom_unit_amount'?: Record<string, any>;
  'tax_behavior'?: string;
  'tiers'?: PriceTier[];
  'unit_amount'?: number;
  'unit_amount_decimal'?: string;
};

export type Customer = {
  'address'?: Record<string, any>;
  'balance'?: number;
  'business_name'?: string;
  'cash_balance'?: Record<string, any>;
  'created': number;
  'currency'?: string;
  'customer_account'?: string;
  'default_source'?: Record<string, any>;
  'delinquent'?: boolean;
  'description'?: string;
  'discount'?: Record<string, any>;
  'email'?: string;
  'id': string;
  'individual_name'?: string;
  'invoice_credit_balance'?: Record<string, any>;
  'invoice_prefix'?: string;
  'invoice_settings'?: InvoiceSettingCustomerSetting;
  'livemode': boolean;
  'metadata'?: Record<string, any>;
  'name'?: string;
  'next_invoice_sequence'?: number;
  'object': string;
  'phone'?: string;
  'preferred_locales'?: string[];
  'shipping'?: Record<string, any>;
  'sources'?: {
    'data': Record<string, any>[];
    'has_more': boolean;
    'object': string;
    'url': string;
  };
  'subscriptions'?: {
    'data': Subscription[];
    'has_more': boolean;
    'object': string;
    'url': string;
  };
  'tax'?: CustomerTax;
  'tax_exempt'?: string;
  'tax_ids'?: {
    'data': TaxId[];
    'has_more': boolean;
    'object': string;
    'url': string;
  };
  'test_clock'?: Record<string, any>;
};

export type CustomerTax = {
  'automatic_tax': string;
  'ip_address'?: string;
  'location'?: Record<string, any>;
  'provider': string;
};

export type Discount = {
  'checkout_session'?: string;
  'customer'?: Record<string, any>;
  'customer_account'?: string;
  'end'?: number;
  'id': string;
  'invoice'?: string;
  'invoice_item'?: string;
  'object': string;
  'promotion_code'?: Record<string, any>;
  'source': DiscountSource;
  'start': number;
  'subscription'?: string;
  'subscription_item'?: string;
};

export type DiscountSource = {
  'coupon'?: Record<string, any>;
  'type': string;
};

export type DiscountsResourceDiscountAmount = {
  'amount': number;
  'discount': Record<string, any>;
};

export type Error = {
  'error': ApiErrors;
};

export type Invoice = {
  'account_country'?: string;
  'account_name'?: string;
  'account_tax_ids'?: Record<string, any>[];
  'amount_due': number;
  'amount_overpaid': number;
  'amount_paid': number;
  'amount_paid_off_stripe': number;
  'amount_remaining': number;
  'amount_shipping': number;
  'application'?: Record<string, any>;
  'attempt_count': number;
  'attempted': boolean;
  'auto_advance': boolean;
  'automatic_tax': AutomaticTax;
  'automatically_finalizes_at'?: number;
  'billing_reason'?: string;
  'collection_method': string;
  'confirmation_secret'?: Record<string, any>;
  'created': number;
  'currency': string;
  'custom_fields'?: InvoiceSettingCustomField[];
  'customer': Record<string, any>;
  'customer_account'?: string;
  'customer_address'?: Record<string, any>;
  'customer_email'?: string;
  'customer_name'?: string;
  'customer_phone'?: string;
  'customer_shipping'?: Record<string, any>;
  'customer_tax_exempt'?: string;
  'customer_tax_ids'?: InvoicesResourceInvoiceTaxId[];
  'default_payment_method'?: Record<string, any>;
  'default_source'?: Record<string, any>;
  'default_tax_rates': TaxRate[];
  'description'?: string;
  'discounts': Record<string, any>[];
  'due_date'?: number;
  'effective_at'?: number;
  'ending_balance'?: number;
  'footer'?: string;
  'from_invoice'?: Record<string, any>;
  'hosted_invoice_url'?: string;
  'id': string;
  'invoice_pdf'?: string;
  'issuer': ConnectAccountReference;
  'last_finalization_error'?: Record<string, any>;
  'latest_revision'?: Record<string, any>;
  'lines': {
    'data': LineItem[];
    'has_more': boolean;
    'object': string;
    'url': string;
  };
  'livemode': boolean;
  'metadata'?: Record<string, any>;
  'next_payment_attempt'?: number;
  'number'?: string;
  'object': string;
  'on_behalf_of'?: Record<string, any>;
  'parent'?: Record<string, any>;
  'payment_settings': InvoicesPaymentSettings;
  'payments'?: {
    'data': InvoicePayment[];
    'has_more': boolean;
    'object': string;
    'url': string;
  };
  'period_end': number;
  'period_start': number;
  'post_payment_credit_notes_amount': number;
  'pre_payment_credit_notes_amount': number;
  'receipt_number'?: string;
  'rendering'?: Record<string, any>;
  'shipping_cost'?: Record<string, any>;
  'shipping_details'?: Record<string, any>;
  'starting_balance': number;
  'statement_descriptor'?: string;
  'status'?: string;
  'status_transitions': InvoicesResourceStatusTransitions;
  'subtotal': number;
  'subtotal_excluding_tax'?: number;
  'test_clock'?: Record<string, any>;
  'threshold_reason'?: InvoiceThresholdReason;
  'total': number;
  'total_discount_amounts'?: DiscountsResourceDiscountAmount[];
  'total_excluding_tax'?: number;
  'total_pretax_credit_amounts'?: InvoicesResourcePretaxCreditAmount[];
  'total_taxes'?: BillingBillResourceInvoicingTaxesTax[];
  'webhooks_delivered_at'?: number;
};

export type InvoiceItemThresholdReason = {
  'line_item_ids': string[];
  'usage_gte': number;
};

export type InvoiceLineItemPeriod = {
  'end': number;
  'start': number;
};

export type InvoicePayment = {
  'amount_paid'?: number;
  'amount_requested': number;
  'created': number;
  'currency': string;
  'id': string;
  'invoice': Record<string, any>;
  'is_default': boolean;
  'livemode': boolean;
  'object': string;
  'payment': InvoicesPaymentsInvoicePaymentAssociatedPayment;
  'status': string;
  'status_transitions': InvoicesPaymentsInvoicePaymentStatusTransitions;
};

export type InvoiceSettingCustomField = {
  'name': string;
  'value': string;
};

export type InvoiceSettingCustomerSetting = {
  'custom_fields'?: InvoiceSettingCustomField[];
  'default_payment_method'?: Record<string, any>;
  'footer'?: string;
  'rendering_options'?: Record<string, any>;
};

export type InvoiceThresholdReason = {
  'amount_gte'?: number;
  'item_reasons': InvoiceItemThresholdReason[];
};

export type InvoicesPaymentSettings = {
  'default_mandate'?: string;
  'payment_method_options'?: Record<string, any>;
  'payment_method_types'?: string[];
};

export type InvoicesPaymentsInvoicePaymentAssociatedPayment = {
  'charge'?: Record<string, any>;
  'payment_intent'?: Record<string, any>;
  'payment_record'?: Record<string, any>;
  'type': string;
};

export type InvoicesPaymentsInvoicePaymentStatusTransitions = {
  'canceled_at'?: number;
  'paid_at'?: number;
};

export type InvoicesResourceInvoiceTaxId = {
  'type': string;
  'value'?: string;
};

export type InvoicesResourcePretaxCreditAmount = {
  'amount': number;
  'credit_balance_transaction'?: Record<string, any>;
  'discount'?: Record<string, any>;
  'type': string;
};

export type InvoicesResourceStatusTransitions = {
  'finalized_at'?: number;
  'marked_uncollectible_at'?: number;
  'paid_at'?: number;
  'voided_at'?: number;
};

export type Item = {
  'adjustable_quantity'?: Record<string, any>;
  'amount_discount': number;
  'amount_subtotal': number;
  'amount_tax': number;
  'amount_total': number;
  'currency': string;
  'description'?: string;
  'discounts'?: LineItemsDiscountAmount[];
  'id': string;
  'metadata'?: Record<string, any>;
  'object': string;
  'price'?: Record<string, any>;
  'quantity'?: number;
  'taxes'?: LineItemsTaxAmount[];
};

export type LineItem = {
  'amount': number;
  'currency': string;
  'description'?: string;
  'discount_amounts'?: DiscountsResourceDiscountAmount[];
  'discountable': boolean;
  'discounts': Record<string, any>[];
  'id': string;
  'invoice'?: string;
  'livemode': boolean;
  'metadata': Record<string, any>;
  'object': string;
  'parent'?: Record<string, any>;
  'period': InvoiceLineItemPeriod;
  'pretax_credit_amounts'?: InvoicesResourcePretaxCreditAmount[];
  'pricing'?: Record<string, any>;
  'quantity'?: number;
  'quantity_decimal'?: string;
  'subscription'?: Record<string, any>;
  'subtotal': number;
  'taxes'?: BillingBillResourceInvoicingTaxesTax[];
};

export type LineItemsDiscountAmount = {
  'amount': number;
  'discount': Discount;
};

export type LineItemsTaxAmount = {
  'amount': number;
  'rate': TaxRate;
  'taxability_reason'?: string;
  'taxable_amount'?: number;
};

export type PaymentFlowsPaymentDetails = {
  'customer_reference'?: string;
  'order_reference'?: string;
};

export type PaymentFlowsPaymentIntentAsyncWorkflows = {
  'inputs'?: PaymentFlowsPaymentIntentAsyncWorkflowsResourceInputs;
};

export type PaymentFlowsPaymentIntentAsyncWorkflowsResourceInputs = {
  'tax'?: PaymentFlowsPaymentIntentAsyncWorkflowsResourceInputsResourceTax;
};

export type PaymentFlowsPaymentIntentAsyncWorkflowsResourceInputsResourceTax = {
  'calculation': string;
};

export type PaymentFlowsPaymentIntentPresentmentDetails = {
  'presentment_amount': number;
  'presentment_currency': string;
};

export type PaymentFlowsPrivatePaymentMethodsAlipay = Record<string, any>;

export type PaymentFlowsPrivatePaymentMethodsCardPresentCommonWallet = {
  'type': string;
};

export type PaymentIntent = {
  'allowed_payment_method_types'?: string[];
  'amount'?: number;
  'amount_capturable'?: number;
  'amount_details'?: Record<string, any>;
  'amount_received'?: number;
  'application'?: Record<string, any>;
  'application_fee_amount'?: number;
  'automatic_payment_methods'?: Record<string, any>;
  'canceled_at'?: number;
  'cancellation_reason'?: string;
  'capture_method'?: string;
  'client_secret'?: string;
  'confirmation_method'?: string;
  'created': number;
  'currency'?: string;
  'customer'?: Record<string, any>;
  'customer_account'?: string;
  'description'?: string;
  'excluded_payment_method_types'?: string[];
  'hooks'?: PaymentFlowsPaymentIntentAsyncWorkflows;
  'id': string;
  'last_payment_error'?: Record<string, any>;
  'latest_charge'?: Record<string, any>;
  'livemode': boolean;
  'managed_payments'?: Record<string, any>;
  'metadata'?: Record<string, any>;
  'next_action'?: Record<string, any>;
  'object': string;
  'on_behalf_of'?: Record<string, any>;
  'payment_details'?: PaymentFlowsPaymentDetails;
  'payment_method'?: Record<string, any>;
  'payment_method_configuration_details'?: Record<string, any>;
  'payment_method_options'?: Record<string, any>;
  'payment_method_types'?: string[];
  'presentment_details'?: PaymentFlowsPaymentIntentPresentmentDetails;
  'processing'?: Record<string, any>;
  'receipt_email'?: string;
  'review'?: Record<string, any>;
  'setup_future_usage'?: string;
  'shipping'?: Record<string, any>;
  'statement_descriptor'?: string;
  'statement_descriptor_suffix'?: string;
  'status': string;
  'transfer_data'?: Record<string, any>;
  'transfer_group'?: string;
};

export type PaymentMethod = {
  'acss_debit'?: PaymentMethodAcssDebit;
  'affirm'?: PaymentMethodAffirm;
  'afterpay_clearpay'?: PaymentMethodAfterpayClearpay;
  'alipay'?: PaymentFlowsPrivatePaymentMethodsAlipay;
  'allow_redisplay'?: string;
  'alma'?: PaymentMethodAlma;
  'amazon_pay'?: PaymentMethodAmazonPay;
  'au_becs_debit'?: PaymentMethodAuBecsDebit;
  'bacs_debit'?: PaymentMethodBacsDebit;
  'bancontact'?: PaymentMethodBancontact;
  'billie'?: PaymentMethodBillie;
  'billing_details': BillingDetails;
  'bizum'?: PaymentMethodBizum;
  'blik'?: PaymentMethodBlik;
  'boleto'?: PaymentMethodBoleto;
  'card'?: PaymentMethodCard;
  'card_present'?: PaymentMethodCardPresent;
  'cashapp'?: PaymentMethodCashapp;
  'created': number;
  'crypto'?: PaymentMethodCrypto;
  'custom'?: PaymentMethodCustom;
  'customer'?: Record<string, any>;
  'customer_account'?: string;
  'customer_balance'?: PaymentMethodCustomerBalance;
  'eps'?: PaymentMethodEps;
  'fpx'?: PaymentMethodFpx;
  'giropay'?: PaymentMethodGiropay;
  'grabpay'?: PaymentMethodGrabpay;
  'id': string;
  'ideal'?: PaymentMethodIdeal;
  'interac_present'?: PaymentMethodInteracPresent;
  'kakao_pay'?: PaymentMethodKakaoPay;
  'klarna'?: PaymentMethodKlarna;
  'konbini'?: PaymentMethodKonbini;
  'kr_card'?: PaymentMethodKrCard;
  'link'?: PaymentMethodLink;
  'livemode': boolean;
  'mb_way'?: PaymentMethodMbWay;
  'metadata'?: Record<string, any>;
  'mobilepay'?: PaymentMethodMobilepay;
  'multibanco'?: PaymentMethodMultibanco;
  'naver_pay'?: PaymentMethodNaverPay;
  'nz_bank_account'?: PaymentMethodNzBankAccount;
  'object': string;
  'oxxo'?: PaymentMethodOxxo;
  'p24'?: PaymentMethodP24;
  'pay_by_bank'?: PaymentMethodPayByBank;
  'payco'?: PaymentMethodPayco;
  'paynow'?: PaymentMethodPaynow;
  'paypal'?: PaymentMethodPaypal;
  'payto'?: PaymentMethodPayto;
  'pix'?: PaymentMethodPix;
  'promptpay'?: PaymentMethodPromptpay;
  'radar_options'?: RadarRadarOptions;
  'revolut_pay'?: PaymentMethodRevolutPay;
  'samsung_pay'?: PaymentMethodSamsungPay;
  'satispay'?: PaymentMethodSatispay;
  'scalapay'?: PaymentMethodScalapay;
  'sepa_debit'?: PaymentMethodSepaDebit;
  'sofort'?: PaymentMethodSofort;
  'sunbit'?: PaymentMethodSunbit;
  'swish'?: PaymentMethodSwish;
  'twint'?: PaymentMethodTwint;
  'type': string;
  'upi'?: PaymentMethodUpi;
  'us_bank_account'?: PaymentMethodUsBankAccount;
  'wechat_pay'?: PaymentMethodWechatPay;
  'zip'?: PaymentMethodZip;
};

export type PaymentMethodAcssDebit = {
  'bank_name'?: string;
  'fingerprint'?: string;
  'institution_number'?: string;
  'last4'?: string;
  'transit_number'?: string;
};

export type PaymentMethodAffirm = Record<string, any>;

export type PaymentMethodAfterpayClearpay = Record<string, any>;

export type PaymentMethodAlma = Record<string, any>;

export type PaymentMethodAmazonPay = Record<string, any>;

export type PaymentMethodAuBecsDebit = {
  'bsb_number'?: string;
  'fingerprint'?: string;
  'last4'?: string;
};

export type PaymentMethodBacsDebit = {
  'fingerprint'?: string;
  'last4'?: string;
  'sort_code'?: string;
};

export type PaymentMethodBancontact = Record<string, any>;

export type PaymentMethodBillie = Record<string, any>;

export type PaymentMethodBizum = {
  'buyer_id'?: string;
};

export type PaymentMethodBlik = {
  'buyer_id'?: string;
};

export type PaymentMethodBoleto = {
  'tax_id': string;
};

export type PaymentMethodCard = {
  'brand': string;
  'checks'?: Record<string, any>;
  'country'?: string;
  'display_brand'?: string;
  'exp_month': number;
  'exp_year': number;
  'fingerprint'?: string;
  'funding': string;
  'generated_from'?: Record<string, any>;
  'last4': string;
  'networks'?: Record<string, any>;
  'regulated_status'?: string;
  'three_d_secure_usage'?: Record<string, any>;
  'wallet'?: Record<string, any>;
};

export type PaymentMethodCardPresent = {
  'brand'?: string;
  'brand_product'?: string;
  'cardholder_name'?: string;
  'country'?: string;
  'description'?: string;
  'exp_month': number;
  'exp_year': number;
  'fingerprint'?: string;
  'funding'?: string;
  'issuer'?: string;
  'last4'?: string;
  'networks'?: Record<string, any>;
  'offline'?: Record<string, any>;
  'preferred_locales'?: string[];
  'read_method'?: string;
  'wallet'?: PaymentFlowsPrivatePaymentMethodsCardPresentCommonWallet;
};

export type PaymentMethodCashapp = {
  'buyer_id'?: string;
  'cashtag'?: string;
};

export type PaymentMethodCrypto = Record<string, any>;

export type PaymentMethodCustom = {
  'display_name'?: string;
  'logo'?: Record<string, any>;
  'type': string;
};

export type PaymentMethodCustomerBalance = Record<string, any>;

export type PaymentMethodEps = {
  'bank'?: string;
};

export type PaymentMethodFpx = {
  'bank': string;
};

export type PaymentMethodGiropay = Record<string, any>;

export type PaymentMethodGrabpay = Record<string, any>;

export type PaymentMethodIdeal = {
  'bank'?: string;
  'bic'?: string;
};

export type PaymentMethodInteracPresent = {
  'brand'?: string;
  'cardholder_name'?: string;
  'country'?: string;
  'description'?: string;
  'exp_month': number;
  'exp_year': number;
  'fingerprint'?: string;
  'funding'?: string;
  'issuer'?: string;
  'last4'?: string;
  'networks'?: Record<string, any>;
  'preferred_locales'?: string[];
  'read_method'?: string;
};

export type PaymentMethodKakaoPay = Record<string, any>;

export type PaymentMethodKlarna = {
  'dob'?: Record<string, any>;
};

export type PaymentMethodKonbini = Record<string, any>;

export type PaymentMethodKrCard = {
  'brand'?: string;
  'last4'?: string;
};

export type PaymentMethodLink = {
  'email'?: string;
};

export type PaymentMethodMbWay = Record<string, any>;

export type PaymentMethodMobilepay = Record<string, any>;

export type PaymentMethodMultibanco = Record<string, any>;

export type PaymentMethodNaverPay = {
  'buyer_id'?: string;
  'funding': string;
};

export type PaymentMethodNzBankAccount = {
  'account_holder_name'?: string;
  'bank_code': string;
  'bank_name': string;
  'branch_code': string;
  'last4': string;
  'suffix'?: string;
};

export type PaymentMethodOxxo = Record<string, any>;

export type PaymentMethodP24 = {
  'bank'?: string;
};

export type PaymentMethodPayByBank = Record<string, any>;

export type PaymentMethodPayco = Record<string, any>;

export type PaymentMethodPaynow = Record<string, any>;

export type PaymentMethodPaypal = {
  'country'?: string;
  'payer_email'?: string;
  'payer_id'?: string;
};

export type PaymentMethodPayto = {
  'bsb_number'?: string;
  'last4'?: string;
  'pay_id'?: string;
};

export type PaymentMethodPix = {
  'fingerprint'?: string;
};

export type PaymentMethodPromptpay = Record<string, any>;

export type PaymentMethodRevolutPay = Record<string, any>;

export type PaymentMethodSamsungPay = Record<string, any>;

export type PaymentMethodSatispay = Record<string, any>;

export type PaymentMethodScalapay = Record<string, any>;

export type PaymentMethodSepaDebit = {
  'bank_code'?: string;
  'branch_code'?: string;
  'country'?: string;
  'fingerprint'?: string;
  'generated_from'?: Record<string, any>;
  'last4'?: string;
};

export type PaymentMethodSofort = {
  'country'?: string;
};

export type PaymentMethodSunbit = Record<string, any>;

export type PaymentMethodSwish = Record<string, any>;

export type PaymentMethodTwint = Record<string, any>;

export type PaymentMethodUpi = {
  'vpa'?: string;
};

export type PaymentMethodUsBankAccount = {
  'account_holder_type'?: string;
  'account_type'?: string;
  'bank_name'?: string;
  'financial_connections_account'?: string;
  'fingerprint'?: string;
  'last4'?: string;
  'networks'?: Record<string, any>;
  'routing_number'?: string;
  'status_details'?: Record<string, any>;
};

export type PaymentMethodWechatPay = Record<string, any>;

export type PaymentMethodZip = Record<string, any>;

export type PaymentPagesCheckoutSessionAutomaticTax = {
  'enabled': boolean;
  'liability'?: Record<string, any>;
  'provider'?: string;
  'status'?: string;
};

export type PaymentPagesCheckoutSessionBrandingSettings = {
  'background_color': string;
  'border_style': string;
  'button_color': string;
  'display_name': string;
  'font_family': string;
  'icon'?: Record<string, any>;
  'logo'?: Record<string, any>;
};

export type PaymentPagesCheckoutSessionBusinessName = {
  'enabled': boolean;
  'optional': boolean;
};

export type PaymentPagesCheckoutSessionCustomFields = {
  'dropdown'?: PaymentPagesCheckoutSessionCustomFieldsDropdown;
  'key': string;
  'label': PaymentPagesCheckoutSessionCustomFieldsLabel;
  'numeric'?: PaymentPagesCheckoutSessionCustomFieldsNumeric;
  'optional': boolean;
  'text'?: PaymentPagesCheckoutSessionCustomFieldsText;
  'type': string;
};

export type PaymentPagesCheckoutSessionCustomFieldsDropdown = {
  'default_value'?: string;
  'options': PaymentPagesCheckoutSessionCustomFieldsOption[];
  'value'?: string;
};

export type PaymentPagesCheckoutSessionCustomFieldsLabel = {
  'custom'?: string;
  'type': string;
};

export type PaymentPagesCheckoutSessionCustomFieldsNumeric = {
  'default_value'?: string;
  'maximum_length'?: number;
  'minimum_length'?: number;
  'value'?: string;
};

export type PaymentPagesCheckoutSessionCustomFieldsOption = {
  'label': string;
  'value': string;
};

export type PaymentPagesCheckoutSessionCustomFieldsText = {
  'default_value'?: string;
  'maximum_length'?: number;
  'minimum_length'?: number;
  'value'?: string;
};

export type PaymentPagesCheckoutSessionCustomText = {
  'after_submit'?: Record<string, any>;
  'shipping_address'?: Record<string, any>;
  'submit'?: Record<string, any>;
  'terms_of_service_acceptance'?: Record<string, any>;
};

export type PaymentPagesCheckoutSessionDiscount = {
  'coupon'?: Record<string, any>;
  'promotion_code'?: Record<string, any>;
};

export type PaymentPagesCheckoutSessionIndividualName = {
  'enabled': boolean;
  'optional': boolean;
};

export type PaymentPagesCheckoutSessionNameCollection = {
  'business'?: PaymentPagesCheckoutSessionBusinessName;
  'individual'?: PaymentPagesCheckoutSessionIndividualName;
};

export type PaymentPagesCheckoutSessionOptionalItem = {
  'adjustable_quantity'?: Record<string, any>;
  'price': string;
  'quantity': number;
};

export type PaymentPagesCheckoutSessionPhoneNumberCollection = {
  'enabled': boolean;
};

export type PaymentPagesCheckoutSessionShippingOption = {
  'shipping_amount': number;
  'shipping_rate': Record<string, any>;
};

export type PaymentPagesCheckoutSessionTaxIdCollection = {
  'enabled': boolean;
  'required': string;
};

export type Price = {
  'active': boolean;
  'billing_scheme': string;
  'created': number;
  'currency': string;
  'currency_options'?: Record<string, any>;
  'custom_unit_amount'?: Record<string, any>;
  'id': string;
  'livemode': boolean;
  'lookup_key'?: string;
  'metadata': Record<string, any>;
  'nickname'?: string;
  'object': string;
  'product': Record<string, any>;
  'recurring'?: Record<string, any>;
  'tax_behavior'?: string;
  'tiers'?: PriceTier[];
  'tiers_mode'?: string;
  'transform_quantity'?: Record<string, any>;
  'type': string;
  'unit_amount'?: number;
  'unit_amount_decimal'?: string;
};

export type PriceTier = {
  'flat_amount'?: number;
  'flat_amount_decimal'?: string;
  'unit_amount'?: number;
  'unit_amount_decimal'?: string;
  'up_to'?: number;
};

export type Product = {
  'active': boolean;
  'created': number;
  'default_price'?: Record<string, any>;
  'description'?: string;
  'id': string;
  'images': string[];
  'livemode': boolean;
  'marketing_features': ProductMarketingFeature[];
  'metadata': Record<string, any>;
  'name': string;
  'object': string;
  'package_dimensions'?: Record<string, any>;
  'shippable'?: boolean;
  'statement_descriptor'?: string;
  'tax_code'?: Record<string, any>;
  'unit_label'?: string;
  'updated': number;
  'url'?: string;
};

export type ProductMarketingFeature = {
  'name'?: string;
};

export type RadarRadarOptions = {
  'session'?: string;
};

export type SetupIntent = {
  'allowed_payment_method_types'?: string[];
  'application'?: Record<string, any>;
  'attach_to_self'?: boolean;
  'automatic_payment_methods'?: Record<string, any>;
  'cancellation_reason'?: string;
  'client_secret'?: string;
  'created': number;
  'customer'?: Record<string, any>;
  'customer_account'?: string;
  'description'?: string;
  'excluded_payment_method_types'?: string[];
  'flow_directions'?: string[];
  'id': string;
  'last_setup_error'?: Record<string, any>;
  'latest_attempt'?: Record<string, any>;
  'livemode': boolean;
  'managed_payments'?: Record<string, any>;
  'mandate'?: Record<string, any>;
  'metadata'?: Record<string, any>;
  'next_action'?: Record<string, any>;
  'object': string;
  'on_behalf_of'?: Record<string, any>;
  'payment_method'?: Record<string, any>;
  'payment_method_configuration_details'?: Record<string, any>;
  'payment_method_options'?: Record<string, any>;
  'payment_method_types': string[];
  'single_use_mandate'?: Record<string, any>;
  'status': string;
  'usage': string;
};

export type Subscription = {
  'application'?: Record<string, any>;
  'application_fee_percent'?: number;
  'automatic_tax': SubscriptionAutomaticTax;
  'billing_cycle_anchor': number;
  'billing_cycle_anchor_config'?: Record<string, any>;
  'billing_mode': SubscriptionsResourceBillingMode;
  'billing_schedules': SubscriptionsResourceBillingSchedules[];
  'billing_thresholds'?: Record<string, any>;
  'cancel_at'?: number;
  'cancel_at_period_end': boolean;
  'canceled_at'?: number;
  'cancellation_details'?: Record<string, any>;
  'collection_method': string;
  'created': number;
  'currency': string;
  'customer': Record<string, any>;
  'customer_account'?: string;
  'days_until_due'?: number;
  'default_payment_method'?: Record<string, any>;
  'default_source'?: Record<string, any>;
  'default_tax_rates'?: TaxRate[];
  'description'?: string;
  'discounts': Record<string, any>[];
  'ended_at'?: number;
  'id': string;
  'invoice_settings': SubscriptionsResourceSubscriptionInvoiceSettings;
  'items': {
    'data': SubscriptionItem[];
    'has_more': boolean;
    'object': string;
    'url': string;
  };
  'latest_invoice'?: Record<string, any>;
  'livemode': boolean;
  'managed_payments'?: Record<string, any>;
  'metadata': Record<string, any>;
  'next_pending_invoice_item_invoice'?: number;
  'object': string;
  'on_behalf_of'?: Record<string, any>;
  'pause_collection'?: Record<string, any>;
  'payment_settings'?: Record<string, any>;
  'pending_invoice_item_interval'?: Record<string, any>;
  'pending_setup_intent'?: Record<string, any>;
  'pending_update'?: Record<string, any>;
  'presentment_details'?: SubscriptionsResourceSubscriptionPresentmentDetails;
  'schedule'?: Record<string, any>;
  'start_date': number;
  'status': string;
  'test_clock'?: Record<string, any>;
  'transfer_data'?: Record<string, any>;
  'trial_end'?: number;
  'trial_settings'?: Record<string, any>;
  'trial_start'?: number;
};

export type SubscriptionAutomaticTax = {
  'disabled_reason'?: string;
  'enabled': boolean;
  'liability'?: Record<string, any>;
};

export type SubscriptionItem = {
  'billed_until'?: number;
  'billing_thresholds'?: Record<string, any>;
  'created': number;
  'current_period_end': number;
  'current_period_start': number;
  'discounts': Record<string, any>[];
  'id': string;
  'metadata': Record<string, any>;
  'object': string;
  'price': Price;
  'quantity'?: number;
  'subscription': string;
  'tax_rates'?: TaxRate[];
};

export type SubscriptionsResourceBillingMode = {
  'flexible'?: Record<string, any>;
  'type': string;
  'updated_at'?: number;
};

export type SubscriptionsResourceBillingSchedules = {
  'applies_to'?: SubscriptionsResourceBillingSchedulesAppliesTo[];
  'bill_until': SubscriptionsResourceBillingSchedulesBillUntil;
  'key': string;
};

export type SubscriptionsResourceBillingSchedulesAppliesTo = {
  'price'?: Record<string, any>;
  'type': string;
};

export type SubscriptionsResourceBillingSchedulesBillUntil = {
  'computed_timestamp': number;
  'duration'?: Record<string, any>;
  'timestamp'?: number;
  'type': string;
};

export type SubscriptionsResourceSubscriptionInvoiceSettings = {
  'account_tax_ids'?: Record<string, any>[];
  'custom_fields'?: InvoiceSettingCustomField[];
  'description'?: string;
  'footer'?: string;
  'issuer': ConnectAccountReference;
};

export type SubscriptionsResourceSubscriptionPresentmentDetails = {
  'presentment_currency': string;
};

export type TaxId = {
  'country'?: string;
  'created': number;
  'customer'?: Record<string, any>;
  'customer_account'?: string;
  'id': string;
  'livemode': boolean;
  'object': string;
  'owner'?: Record<string, any>;
  'type': string;
  'value': string;
  'verification'?: Record<string, any>;
};

export type TaxRate = {
  'active': boolean;
  'country'?: string;
  'created': number;
  'description'?: string;
  'display_name': string;
  'effective_percentage'?: number;
  'flat_amount'?: Record<string, any>;
  'id': string;
  'inclusive': boolean;
  'jurisdiction'?: string;
  'jurisdiction_level'?: string;
  'livemode': boolean;
  'metadata'?: Record<string, any>;
  'object': string;
  'percentage': number;
  'rate_type'?: string;
  'state'?: string;
  'tax_type'?: string;
};
