// Auto-generated. Do not edit manually.
// Powered by Fused - The integration layer for teams that want control.
// Custom SDKs, native webhooks, and MCP servers from services you actually use.
// Learn more at: https://usefused.com

import { BaseClient } from './core';
import { normaliseError, buildGraphQLSelection } from './core';
// Auth providers are imported as values (they are instantiated with `new`).
import { HttpProvider } from './core';
import type { SDKConfig, AuthProvider, HttpRequest, ResponseMediaFamily, FusedExecutionOptions } from './core';
import type { Subscription, Error, CheckoutSession, Customer, Invoice, LineItem, Price, Product } from './types';


export interface DeleteSubscriptionsSubscriptionExposedIdOptions {
  'subscription_exposed_id': string;
  'cancellation_details'?: {
    'comment'?: Record<string, any>;
    'feedback'?: string;
  };
  'expand'?: string[];
  'invoice_now'?: boolean;
  'prorate'?: boolean;
  headers?: Record<string, string>;
  _credentials?: Record<string, string>;
  fused?: FusedExecutionOptions;
}
export type DeleteSubscriptionsSubscriptionExposedIdSuccessResult = Subscription;
export type DeleteSubscriptionsSubscriptionExposedIdErrorResult = Error;
export type DeleteSubscriptionsSubscriptionExposedIdResponse =
  | { ok: true; status: number; data: DeleteSubscriptionsSubscriptionExposedIdSuccessResult; error: null }
  | { ok: false; status: number; data: null; error: DeleteSubscriptionsSubscriptionExposedIdErrorResult };

export type GetCheckoutSessionsOptions = any;
export interface GetCheckoutSessionsSuccessResult {
  'data': CheckoutSession[];
  'has_more': boolean;
  'object': string;
  'url': string;
}
export type GetCheckoutSessionsErrorResult = Error;
export type GetCheckoutSessionsResponse =
  | { ok: true; status: number; data: GetCheckoutSessionsSuccessResult; error: null }
  | { ok: false; status: number; data: null; error: GetCheckoutSessionsErrorResult };

export type GetCheckoutSessionsSessionOptions = any;
export type GetCheckoutSessionsSessionSuccessResult = CheckoutSession;
export type GetCheckoutSessionsSessionErrorResult = Error;
export type GetCheckoutSessionsSessionResponse =
  | { ok: true; status: number; data: GetCheckoutSessionsSessionSuccessResult; error: null }
  | { ok: false; status: number; data: null; error: GetCheckoutSessionsSessionErrorResult };

export type GetCustomersOptions = any;
export interface GetCustomersSuccessResult {
  'data': Customer[];
  'has_more': boolean;
  'object': string;
  'url': string;
}
export type GetCustomersErrorResult = Error;
export type GetCustomersResponse =
  | { ok: true; status: number; data: GetCustomersSuccessResult; error: null }
  | { ok: false; status: number; data: null; error: GetCustomersErrorResult };

export type GetCustomersSearchOptions = any;
export interface GetCustomersSearchSuccessResult {
  'data': Customer[];
  'has_more': boolean;
  'next_page'?: string;
  'object': string;
  'total_count'?: number;
  'url': string;
}
export type GetCustomersSearchErrorResult = Error;
export type GetCustomersSearchResponse =
  | { ok: true; status: number; data: GetCustomersSearchSuccessResult; error: null }
  | { ok: false; status: number; data: null; error: GetCustomersSearchErrorResult };

export type GetCustomersCustomerOptions = any;
export type GetCustomersCustomerSuccessResult = Record<string, any>;
export type GetCustomersCustomerErrorResult = Error;
export type GetCustomersCustomerResponse =
  | { ok: true; status: number; data: GetCustomersCustomerSuccessResult; error: null }
  | { ok: false; status: number; data: null; error: GetCustomersCustomerErrorResult };

export type GetInvoicesOptions = any;
export interface GetInvoicesSuccessResult {
  'data': Invoice[];
  'has_more': boolean;
  'object': string;
  'url': string;
}
export type GetInvoicesErrorResult = Error;
export type GetInvoicesResponse =
  | { ok: true; status: number; data: GetInvoicesSuccessResult; error: null }
  | { ok: false; status: number; data: null; error: GetInvoicesErrorResult };

export type GetInvoicesInvoiceOptions = any;
export type GetInvoicesInvoiceSuccessResult = Invoice;
export type GetInvoicesInvoiceErrorResult = Error;
export type GetInvoicesInvoiceResponse =
  | { ok: true; status: number; data: GetInvoicesInvoiceSuccessResult; error: null }
  | { ok: false; status: number; data: null; error: GetInvoicesInvoiceErrorResult };

export type GetInvoicesInvoiceLinesOptions = any;
export interface GetInvoicesInvoiceLinesSuccessResult {
  'data': LineItem[];
  'has_more': boolean;
  'object': string;
  'url': string;
}
export type GetInvoicesInvoiceLinesErrorResult = Error;
export type GetInvoicesInvoiceLinesResponse =
  | { ok: true; status: number; data: GetInvoicesInvoiceLinesSuccessResult; error: null }
  | { ok: false; status: number; data: null; error: GetInvoicesInvoiceLinesErrorResult };

export type GetPricesOptions = any;
export interface GetPricesSuccessResult {
  'data': Price[];
  'has_more': boolean;
  'object': string;
  'url': string;
}
export type GetPricesErrorResult = Error;
export type GetPricesResponse =
  | { ok: true; status: number; data: GetPricesSuccessResult; error: null }
  | { ok: false; status: number; data: null; error: GetPricesErrorResult };

export type GetPricesPriceOptions = any;
export type GetPricesPriceSuccessResult = Price;
export type GetPricesPriceErrorResult = Error;
export type GetPricesPriceResponse =
  | { ok: true; status: number; data: GetPricesPriceSuccessResult; error: null }
  | { ok: false; status: number; data: null; error: GetPricesPriceErrorResult };

export type GetProductsOptions = any;
export interface GetProductsSuccessResult {
  'data': Product[];
  'has_more': boolean;
  'object': string;
  'url': string;
}
export type GetProductsErrorResult = Error;
export type GetProductsResponse =
  | { ok: true; status: number; data: GetProductsSuccessResult; error: null }
  | { ok: false; status: number; data: null; error: GetProductsErrorResult };

export type GetProductsIdOptions = any;
export type GetProductsIdSuccessResult = Product;
export type GetProductsIdErrorResult = Error;
export type GetProductsIdResponse =
  | { ok: true; status: number; data: GetProductsIdSuccessResult; error: null }
  | { ok: false; status: number; data: null; error: GetProductsIdErrorResult };

export type GetSubscriptionsOptions = any;
export interface GetSubscriptionsSuccessResult {
  'data': Subscription[];
  'has_more': boolean;
  'object': string;
  'url': string;
}
export type GetSubscriptionsErrorResult = Error;
export type GetSubscriptionsResponse =
  | { ok: true; status: number; data: GetSubscriptionsSuccessResult; error: null }
  | { ok: false; status: number; data: null; error: GetSubscriptionsErrorResult };

export type GetSubscriptionsSubscriptionExposedIdOptions = any;
export type GetSubscriptionsSubscriptionExposedIdSuccessResult = Subscription;
export type GetSubscriptionsSubscriptionExposedIdErrorResult = Error;
export type GetSubscriptionsSubscriptionExposedIdResponse =
  | { ok: true; status: number; data: GetSubscriptionsSubscriptionExposedIdSuccessResult; error: null }
  | { ok: false; status: number; data: null; error: GetSubscriptionsSubscriptionExposedIdErrorResult };

export interface PostCheckoutSessionsOptions {
  'adaptive_pricing'?: {
    'enabled'?: boolean;
  };
  'after_expiration'?: {
    'recovery'?: {
      'allow_promotion_codes'?: boolean;
      'enabled': boolean;
    };
  };
  'allow_promotion_codes'?: boolean;
  'automatic_tax'?: {
    'enabled': boolean;
    'liability'?: {
      'account'?: string;
      'type': string;
    };
  };
  'billing_address_collection'?: string;
  'branding_settings'?: {
    'background_color'?: Record<string, any>;
    'border_style'?: string;
    'button_color'?: Record<string, any>;
    'display_name'?: string;
    'font_family'?: string;
    'icon'?: {
      'file'?: string;
      'type': string;
      'url'?: string;
    };
    'logo'?: {
      'file'?: string;
      'type': string;
      'url'?: string;
    };
  };
  'cancel_url'?: string;
  'client_reference_id'?: string;
  'consent_collection'?: {
    'payment_method_reuse_agreement'?: {
      'position': string;
    };
    'promotions'?: string;
    'terms_of_service'?: string;
  };
  'currency'?: string;
  'custom_fields'?: {
    'dropdown'?: {
      'default_value'?: string;
      'options': {
        'label': string;
        'value': string;
      }[];
    };
    'key': string;
    'label': {
      'custom': string;
      'type': string;
    };
    'numeric'?: {
      'default_value'?: string;
      'maximum_length'?: number;
      'minimum_length'?: number;
    };
    'optional'?: boolean;
    'text'?: {
      'default_value'?: string;
      'maximum_length'?: number;
      'minimum_length'?: number;
    };
    'type': string;
  }[];
  'custom_text'?: {
    'after_submit'?: Record<string, any>;
    'shipping_address'?: Record<string, any>;
    'submit'?: Record<string, any>;
    'terms_of_service_acceptance'?: Record<string, any>;
  };
  'customer'?: string;
  'customer_account'?: string;
  'customer_creation'?: string;
  'customer_email'?: string;
  'customer_update'?: {
    'address'?: string;
    'name'?: string;
    'shipping'?: string;
  };
  'discounts'?: {
    'coupon'?: string;
    'promotion_code'?: string;
  }[];
  'excluded_payment_method_types'?: string[];
  'expand'?: string[];
  'expires_at'?: number;
  'integration_identifier'?: string;
  'invoice_creation'?: {
    'enabled': boolean;
    'invoice_data'?: {
      'account_tax_ids'?: Record<string, any>;
      'custom_fields'?: Record<string, any>;
      'description'?: string;
      'footer'?: string;
      'issuer'?: {
        'account'?: string;
        'type': string;
      };
      'metadata'?: Record<string, any>;
      'rendering_options'?: Record<string, any>;
    };
  };
  'line_items'?: {
    'adjustable_quantity'?: {
      'enabled': boolean;
      'maximum'?: number;
      'minimum'?: number;
    };
    'metadata'?: Record<string, any>;
    'price'?: string;
    'price_data'?: {
      'currency': string;
      'product'?: string;
      'product_data'?: {
        'description'?: string;
        'images'?: string[];
        'metadata'?: Record<string, any>;
        'name': string;
        'tax_code'?: string;
        'unit_label'?: string;
      };
      'recurring'?: {
        'interval': string;
        'interval_count'?: number;
      };
      'tax_behavior'?: string;
      'unit_amount'?: number;
      'unit_amount_decimal'?: string;
    };
    'quantity'?: number;
    'tax_rates'?: string[];
  }[];
  'locale'?: string;
  'managed_payments'?: {
    'enabled'?: boolean;
  };
  'metadata'?: Record<string, any>;
  'mode'?: string;
  'name_collection'?: {
    'business'?: {
      'enabled': boolean;
      'optional'?: boolean;
    };
    'individual'?: {
      'enabled': boolean;
      'optional'?: boolean;
    };
  };
  'optional_items'?: {
    'adjustable_quantity'?: {
      'enabled': boolean;
      'maximum'?: number;
      'minimum'?: number;
    };
    'price': string;
    'quantity': number;
  }[];
  'origin_context'?: string;
  'payment_intent_data'?: {
    'application_fee_amount'?: number;
    'capture_method'?: string;
    'description'?: string;
    'metadata'?: Record<string, any>;
    'on_behalf_of'?: string;
    'receipt_email'?: string;
    'setup_future_usage'?: string;
    'shipping'?: {
      'address': {
        'city'?: string;
        'country'?: string;
        'line1': string;
        'line2'?: string;
        'postal_code'?: string;
        'state'?: string;
      };
      'carrier'?: string;
      'name': string;
      'phone'?: string;
      'tracking_number'?: string;
    };
    'statement_descriptor'?: string;
    'statement_descriptor_suffix'?: string;
    'transfer_data'?: {
      'amount'?: number;
      'destination': string;
    };
    'transfer_group'?: string;
  };
  'payment_method_collection'?: string;
  'payment_method_configuration'?: string;
  'payment_method_data'?: {
    'allow_redisplay'?: string;
  };
  'payment_method_options'?: {
    'acss_debit'?: {
      'currency'?: string;
      'mandate_options'?: {
        'custom_mandate_url'?: Record<string, any>;
        'default_for'?: string[];
        'interval_description'?: string;
        'payment_schedule'?: string;
        'transaction_type'?: string;
      };
      'setup_future_usage'?: string;
      'target_date'?: string;
      'verification_method'?: string;
    };
    'affirm'?: {
      'capture_method'?: string;
      'setup_future_usage'?: string;
    };
    'afterpay_clearpay'?: {
      'capture_method'?: string;
      'setup_future_usage'?: string;
    };
    'alipay'?: {
      'setup_future_usage'?: string;
    };
    'alma'?: {
      'capture_method'?: string;
    };
    'amazon_pay'?: {
      'capture_method'?: string;
      'setup_future_usage'?: string;
    };
    'au_becs_debit'?: {
      'setup_future_usage'?: string;
      'target_date'?: string;
    };
    'bacs_debit'?: {
      'mandate_options'?: {
        'reference_prefix'?: Record<string, any>;
      };
      'setup_future_usage'?: string;
      'target_date'?: string;
    };
    'bancontact'?: {
      'setup_future_usage'?: string;
    };
    'billie'?: {
      'capture_method'?: string;
    };
    'boleto'?: {
      'expires_after_days'?: number;
      'setup_future_usage'?: string;
    };
    'card'?: {
      'capture_method'?: string;
      'installments'?: {
        'enabled'?: boolean;
      };
      'request_extended_authorization'?: string;
      'request_incremental_authorization'?: string;
      'request_multicapture'?: string;
      'request_overcapture'?: string;
      'request_three_d_secure'?: string;
      'restrictions'?: {
        'brands_blocked'?: string[];
      };
      'setup_future_usage'?: string;
      'statement_descriptor_suffix_kana'?: string;
      'statement_descriptor_suffix_kanji'?: string;
    };
    'cashapp'?: {
      'capture_method'?: string;
      'setup_future_usage'?: string;
    };
    'crypto'?: {
      'setup_future_usage'?: string;
    };
    'customer_balance'?: {
      'bank_transfer'?: {
        'eu_bank_transfer'?: {
          'country': string;
        };
        'requested_address_types'?: string[];
        'type': string;
      };
      'funding_type'?: string;
      'setup_future_usage'?: string;
    };
    'demo_pay'?: {
      'setup_future_usage'?: string;
    };
    'eps'?: {
      'setup_future_usage'?: string;
    };
    'fpx'?: {
      'setup_future_usage'?: string;
    };
    'giropay'?: {
      'setup_future_usage'?: string;
    };
    'grabpay'?: {
      'setup_future_usage'?: string;
    };
    'ideal'?: {
      'setup_future_usage'?: string;
    };
    'kakao_pay'?: {
      'capture_method'?: string;
      'setup_future_usage'?: string;
    };
    'klarna'?: {
      'capture_method'?: string;
      'setup_future_usage'?: string;
      'subscriptions'?: Record<string, any>;
    };
    'konbini'?: {
      'expires_after_days'?: number;
      'setup_future_usage'?: string;
    };
    'kr_card'?: {
      'capture_method'?: string;
      'setup_future_usage'?: string;
    };
    'link'?: {
      'capture_method'?: string;
      'setup_future_usage'?: string;
    };
    'mobilepay'?: {
      'capture_method'?: string;
      'setup_future_usage'?: string;
    };
    'multibanco'?: {
      'setup_future_usage'?: string;
    };
    'naver_pay'?: {
      'capture_method'?: string;
      'setup_future_usage'?: string;
    };
    'oxxo'?: {
      'expires_after_days'?: number;
      'setup_future_usage'?: string;
    };
    'p24'?: {
      'setup_future_usage'?: string;
      'tos_shown_and_accepted'?: boolean;
    };
    'pay_by_bank'?: Record<string, any>;
    'payco'?: {
      'capture_method'?: string;
      'setup_future_usage'?: string;
    };
    'paynow'?: {
      'setup_future_usage'?: string;
    };
    'paypal'?: {
      'capture_method'?: string;
      'preferred_locale'?: string;
      'reference'?: string;
      'risk_correlation_id'?: string;
      'setup_future_usage'?: string;
    };
    'payto'?: {
      'mandate_options'?: {
        'amount'?: Record<string, any>;
        'amount_type'?: string;
        'end_date'?: Record<string, any>;
        'payment_schedule'?: string;
        'payments_per_period'?: Record<string, any>;
        'purpose'?: string;
        'start_date'?: Record<string, any>;
      };
      'setup_future_usage'?: string;
    };
    'pix'?: {
      'amount_includes_iof'?: string;
      'expires_after_seconds'?: number;
      'mandate_options'?: {
        'amount'?: number;
        'amount_includes_iof'?: string;
        'amount_type'?: string;
        'currency'?: string;
        'end_date'?: string;
        'payment_schedule'?: string;
        'reference'?: string;
        'start_date'?: string;
      };
      'setup_future_usage'?: string;
    };
    'revolut_pay'?: {
      'capture_method'?: string;
      'setup_future_usage'?: string;
    };
    'samsung_pay'?: {
      'capture_method'?: string;
      'setup_future_usage'?: string;
    };
    'satispay'?: {
      'capture_method'?: string;
    };
    'scalapay'?: {
      'capture_method'?: string;
    };
    'sepa_debit'?: {
      'mandate_options'?: {
        'reference_prefix'?: Record<string, any>;
      };
      'setup_future_usage'?: string;
      'target_date'?: string;
    };
    'sofort'?: {
      'setup_future_usage'?: string;
    };
    'sunbit'?: {
      'capture_method'?: string;
      'setup_future_usage'?: string;
    };
    'swish'?: {
      'reference'?: string;
    };
    'twint'?: {
      'setup_future_usage'?: string;
    };
    'upi'?: {
      'mandate_options'?: {
        'amount'?: number;
        'amount_type'?: string;
        'description'?: string;
        'end_date'?: number;
      };
      'setup_future_usage'?: string;
    };
    'us_bank_account'?: {
      'financial_connections'?: {
        'permissions'?: string[];
        'prefetch'?: string[];
      };
      'setup_future_usage'?: string;
      'target_date'?: string;
      'verification_method'?: string;
    };
    'wechat_pay'?: {
      'app_id'?: string;
      'client': string;
      'setup_future_usage'?: string;
    };
  };
  'payment_method_types'?: string[];
  'permissions'?: {
    'update_shipping_details'?: string;
  };
  'phone_number_collection'?: {
    'enabled': boolean;
  };
  'redirect_on_completion'?: string;
  'return_url'?: string;
  'saved_payment_method_options'?: {
    'allow_redisplay_filters'?: string[];
    'payment_method_remove'?: string;
    'payment_method_save'?: string;
  };
  'setup_intent_data'?: {
    'description'?: string;
    'metadata'?: Record<string, any>;
    'on_behalf_of'?: string;
  };
  'shipping_address_collection'?: {
    'allowed_countries': string[];
  };
  'shipping_options'?: {
    'shipping_rate'?: string;
    'shipping_rate_data'?: {
      'delivery_estimate'?: {
        'maximum'?: {
          'unit': string;
          'value': number;
        };
        'minimum'?: {
          'unit': string;
          'value': number;
        };
      };
      'display_name': string;
      'fixed_amount'?: {
        'amount': number;
        'currency': string;
        'currency_options'?: Record<string, any>;
      };
      'metadata'?: Record<string, any>;
      'tax_behavior'?: string;
      'tax_code'?: string;
      'type'?: string;
    };
  }[];
  'submit_type'?: string;
  'subscription_data'?: {
    'application_fee_percent'?: number;
    'billing_cycle_anchor'?: number;
    'billing_cycle_anchor_config'?: {
      'day_of_month': number;
      'hour'?: number;
      'minute'?: number;
      'month'?: number;
      'second'?: number;
    };
    'billing_mode'?: {
      'flexible'?: {
        'proration_discounts'?: string;
      };
      'type': string;
    };
    'default_tax_rates'?: string[];
    'description'?: string;
    'invoice_settings'?: {
      'issuer'?: {
        'account'?: string;
        'type': string;
      };
    };
    'metadata'?: Record<string, any>;
    'on_behalf_of'?: string;
    'pending_invoice_item_interval'?: {
      'interval': string;
      'interval_count'?: number;
    };
    'proration_behavior'?: string;
    'transfer_data'?: {
      'amount_percent'?: number;
      'destination': string;
    };
    'trial_end'?: number;
    'trial_period_days'?: number;
    'trial_settings'?: {
      'end_behavior': {
        'missing_payment_method': string;
      };
    };
  };
  'success_url'?: string;
  'tax_id_collection'?: {
    'enabled': boolean;
    'required'?: string;
  };
  'ui_mode'?: string;
  'wallet_options'?: {
    'link'?: {
      'display'?: string;
    };
  };
  headers?: Record<string, string>;
  _credentials?: Record<string, string>;
  fused?: FusedExecutionOptions;
}
export type PostCheckoutSessionsSuccessResult = CheckoutSession;
export type PostCheckoutSessionsErrorResult = Error;
export type PostCheckoutSessionsResponse =
  | { ok: true; status: number; data: PostCheckoutSessionsSuccessResult; error: null }
  | { ok: false; status: number; data: null; error: PostCheckoutSessionsErrorResult };

export interface PostCustomersOptions {
  'address'?: Record<string, any>;
  'balance'?: number;
  'business_name'?: Record<string, any>;
  'cash_balance'?: {
    'settings'?: {
      'reconciliation_mode'?: string;
    };
  };
  'description'?: string;
  'email'?: string;
  'expand'?: string[];
  'individual_name'?: Record<string, any>;
  'invoice_prefix'?: string;
  'invoice_settings'?: {
    'custom_fields'?: Record<string, any>;
    'default_payment_method'?: string;
    'footer'?: string;
    'rendering_options'?: Record<string, any>;
  };
  'metadata'?: Record<string, any>;
  'name'?: string;
  'next_invoice_sequence'?: number;
  'payment_method'?: string;
  'phone'?: string;
  'preferred_locales'?: string[];
  'shipping'?: Record<string, any>;
  'source'?: string;
  'tax'?: {
    'ip_address'?: Record<string, any>;
    'validate_location'?: string;
  };
  'tax_exempt'?: string;
  'tax_id_data'?: {
    'type': string;
    'value': string;
  }[];
  'test_clock'?: string;
  headers?: Record<string, string>;
  _credentials?: Record<string, string>;
  fused?: FusedExecutionOptions;
}
export type PostCustomersSuccessResult = Customer;
export type PostCustomersErrorResult = Error;
export type PostCustomersResponse =
  | { ok: true; status: number; data: PostCustomersSuccessResult; error: null }
  | { ok: false; status: number; data: null; error: PostCustomersErrorResult };

export interface PostCustomersCustomerOptions {
  'customer': string;
  'address'?: Record<string, any>;
  'balance'?: number;
  'bank_account'?: Record<string, any>;
  'business_name'?: Record<string, any>;
  'card'?: Record<string, any>;
  'cash_balance'?: {
    'settings'?: {
      'reconciliation_mode'?: string;
    };
  };
  'default_alipay_account'?: string;
  'default_bank_account'?: string;
  'default_card'?: string;
  'default_source'?: string;
  'description'?: string;
  'email'?: string;
  'expand'?: string[];
  'individual_name'?: Record<string, any>;
  'invoice_prefix'?: string;
  'invoice_settings'?: {
    'custom_fields'?: Record<string, any>;
    'default_payment_method'?: string;
    'footer'?: string;
    'rendering_options'?: Record<string, any>;
  };
  'metadata'?: Record<string, any>;
  'name'?: string;
  'next_invoice_sequence'?: number;
  'phone'?: string;
  'preferred_locales'?: string[];
  'shipping'?: Record<string, any>;
  'source'?: string;
  'tax'?: {
    'ip_address'?: Record<string, any>;
    'validate_location'?: string;
  };
  'tax_exempt'?: string;
  headers?: Record<string, string>;
  _credentials?: Record<string, string>;
  fused?: FusedExecutionOptions;
}
export type PostCustomersCustomerSuccessResult = Customer;
export type PostCustomersCustomerErrorResult = Error;
export type PostCustomersCustomerResponse =
  | { ok: true; status: number; data: PostCustomersCustomerSuccessResult; error: null }
  | { ok: false; status: number; data: null; error: PostCustomersCustomerErrorResult };

export interface PostInvoicesOptions {
  'account_tax_ids'?: Record<string, any>;
  'application_fee_amount'?: number;
  'auto_advance'?: boolean;
  'automatic_tax'?: {
    'enabled': boolean;
    'liability'?: {
      'account'?: string;
      'type': string;
    };
  };
  'automatically_finalizes_at'?: number;
  'collection_method'?: string;
  'currency'?: string;
  'custom_fields'?: Record<string, any>;
  'customer'?: string;
  'customer_account'?: string;
  'days_until_due'?: number;
  'default_payment_method'?: string;
  'default_source'?: string;
  'default_tax_rates'?: string[];
  'description'?: string;
  'discounts'?: Record<string, any>;
  'due_date'?: number;
  'effective_at'?: number;
  'expand'?: string[];
  'footer'?: string;
  'from_invoice'?: {
    'action': string;
    'invoice': string;
  };
  'issuer'?: {
    'account'?: string;
    'type': string;
  };
  'metadata'?: Record<string, any>;
  'number'?: string;
  'on_behalf_of'?: string;
  'payment_settings'?: {
    'default_mandate'?: Record<string, any>;
    'payment_method_options'?: {
      'acss_debit'?: Record<string, any>;
      'bancontact'?: Record<string, any>;
      'card'?: Record<string, any>;
      'customer_balance'?: Record<string, any>;
      'konbini'?: Record<string, any>;
      'payto'?: Record<string, any>;
      'pix'?: Record<string, any>;
      'sepa_debit'?: Record<string, any>;
      'upi'?: Record<string, any>;
      'us_bank_account'?: Record<string, any>;
    };
    'payment_method_types'?: Record<string, any>;
  };
  'pending_invoice_items_behavior'?: string;
  'rendering'?: {
    'amount_tax_display'?: string;
    'pdf'?: {
      'page_size'?: string;
    };
    'template'?: string;
    'template_version'?: Record<string, any>;
  };
  'shipping_cost'?: {
    'shipping_rate'?: string;
    'shipping_rate_data'?: {
      'delivery_estimate'?: {
        'maximum'?: {
          'unit': string;
          'value': number;
        };
        'minimum'?: {
          'unit': string;
          'value': number;
        };
      };
      'display_name': string;
      'fixed_amount'?: {
        'amount': number;
        'currency': string;
        'currency_options'?: Record<string, any>;
      };
      'metadata'?: Record<string, any>;
      'tax_behavior'?: string;
      'tax_code'?: string;
      'type'?: string;
    };
  };
  'shipping_details'?: {
    'address': {
      'city'?: string;
      'country'?: string;
      'line1'?: string;
      'line2'?: string;
      'postal_code'?: string;
      'state'?: string;
    };
    'name': string;
    'phone'?: Record<string, any>;
  };
  'statement_descriptor'?: string;
  'subscription'?: string;
  'transfer_data'?: {
    'amount'?: number;
    'destination': string;
  };
  headers?: Record<string, string>;
  _credentials?: Record<string, string>;
  fused?: FusedExecutionOptions;
}
export type PostInvoicesSuccessResult = Invoice;
export type PostInvoicesErrorResult = Error;
export type PostInvoicesResponse =
  | { ok: true; status: number; data: PostInvoicesSuccessResult; error: null }
  | { ok: false; status: number; data: null; error: PostInvoicesErrorResult };

export interface PostInvoicesCreatePreviewOptions {
  'automatic_tax'?: {
    'enabled': boolean;
    'liability'?: {
      'account'?: string;
      'type': string;
    };
  };
  'currency'?: string;
  'customer'?: string;
  'customer_account'?: string;
  'customer_details'?: {
    'address'?: Record<string, any>;
    'shipping'?: Record<string, any>;
    'tax'?: {
      'ip_address'?: Record<string, any>;
    };
    'tax_exempt'?: string;
    'tax_ids'?: {
      'type': string;
      'value': string;
    }[];
  };
  'discounts'?: Record<string, any>;
  'expand'?: string[];
  'invoice_items'?: {
    'amount'?: number;
    'currency'?: string;
    'description'?: string;
    'discountable'?: boolean;
    'discounts'?: Record<string, any>;
    'invoiceitem'?: string;
    'metadata'?: Record<string, any>;
    'period'?: {
      'end': number;
      'start': number;
    };
    'price'?: string;
    'price_data'?: {
      'currency': string;
      'product': string;
      'tax_behavior'?: string;
      'unit_amount'?: number;
      'unit_amount_decimal'?: string;
    };
    'quantity'?: number;
    'quantity_decimal'?: string;
    'tax_behavior'?: string;
    'tax_code'?: Record<string, any>;
    'tax_rates'?: Record<string, any>;
    'unit_amount'?: number;
    'unit_amount_decimal'?: string;
  }[];
  'issuer'?: {
    'account'?: string;
    'type': string;
  };
  'on_behalf_of'?: Record<string, any>;
  'preview_mode'?: string;
  'schedule'?: string;
  'schedule_details'?: {
    'billing_mode'?: {
      'flexible'?: {
        'proration_discounts'?: string;
      };
      'type': string;
    };
    'end_behavior'?: string;
    'phases'?: {
      'add_invoice_items'?: {
        'discountable'?: boolean;
        'discounts'?: {
          'coupon'?: string;
          'discount'?: string;
          'promotion_code'?: string;
        }[];
        'metadata'?: Record<string, any>;
        'period'?: {
          'end': {
            'timestamp'?: number;
            'type': string;
          };
          'start': {
            'timestamp'?: number;
            'type': string;
          };
        };
        'price'?: string;
        'price_data'?: {
          'currency': string;
          'product': string;
          'tax_behavior'?: string;
          'unit_amount'?: number;
          'unit_amount_decimal'?: string;
        };
        'quantity'?: number;
        'tax_rates'?: Record<string, any>;
      }[];
      'application_fee_percent'?: number;
      'automatic_tax'?: {
        'enabled': boolean;
        'liability'?: {
          'account'?: string;
          'type': string;
        };
      };
      'billing_cycle_anchor'?: string;
      'billing_thresholds'?: Record<string, any>;
      'collection_method'?: string;
      'default_payment_method'?: string;
      'default_tax_rates'?: Record<string, any>;
      'description'?: Record<string, any>;
      'discounts'?: Record<string, any>;
      'duration'?: {
        'interval': string;
        'interval_count'?: number;
      };
      'end_date'?: Record<string, any>;
      'invoice_settings'?: {
        'account_tax_ids'?: Record<string, any>;
        'days_until_due'?: number;
        'issuer'?: {
          'account'?: string;
          'type': string;
        };
      };
      'items': {
        'billing_thresholds'?: Record<string, any>;
        'discounts'?: Record<string, any>;
        'metadata'?: Record<string, any>;
        'price'?: string;
        'price_data'?: {
          'currency': string;
          'product': string;
          'recurring': {
            'interval': string;
            'interval_count'?: number;
          };
          'tax_behavior'?: string;
          'unit_amount'?: number;
          'unit_amount_decimal'?: string;
        };
        'quantity'?: number;
        'tax_rates'?: Record<string, any>;
      }[];
      'metadata'?: Record<string, any>;
      'on_behalf_of'?: string;
      'proration_behavior'?: string;
      'start_date'?: Record<string, any>;
      'transfer_data'?: {
        'amount_percent'?: number;
        'destination': string;
      };
      'trial'?: boolean;
      'trial_end'?: Record<string, any>;
    }[];
    'proration_behavior'?: string;
  };
  'subscription'?: string;
  'subscription_details'?: {
    'billing_cycle_anchor'?: Record<string, any>;
    'billing_mode'?: {
      'flexible'?: {
        'proration_discounts'?: string;
      };
      'type': string;
    };
    'billing_schedules'?: Record<string, any>;
    'cancel_at'?: Record<string, any>;
    'cancel_at_period_end'?: boolean;
    'cancel_now'?: boolean;
    'default_tax_rates'?: Record<string, any>;
    'items'?: {
      'billing_thresholds'?: Record<string, any>;
      'clear_usage'?: boolean;
      'deleted'?: boolean;
      'discounts'?: Record<string, any>;
      'id'?: string;
      'metadata'?: Record<string, any>;
      'price'?: string;
      'price_data'?: {
        'currency': string;
        'product': string;
        'recurring': {
          'interval': string;
          'interval_count'?: number;
        };
        'tax_behavior'?: string;
        'unit_amount'?: number;
        'unit_amount_decimal'?: string;
      };
      'quantity'?: number;
      'tax_rates'?: Record<string, any>;
    }[];
    'metadata'?: Record<string, any>;
    'proration_behavior'?: string;
    'proration_date'?: number;
    'resume_at'?: string;
    'start_date'?: number;
    'trial_end'?: Record<string, any>;
  };
  headers?: Record<string, string>;
  _credentials?: Record<string, string>;
  fused?: FusedExecutionOptions;
}
export type PostInvoicesCreatePreviewSuccessResult = Invoice;
export type PostInvoicesCreatePreviewErrorResult = Error;
export type PostInvoicesCreatePreviewResponse =
  | { ok: true; status: number; data: PostInvoicesCreatePreviewSuccessResult; error: null }
  | { ok: false; status: number; data: null; error: PostInvoicesCreatePreviewErrorResult };

export interface PostInvoicesInvoiceOptions {
  'invoice': string;
  'account_tax_ids'?: Record<string, any>;
  'application_fee_amount'?: number;
  'auto_advance'?: boolean;
  'automatic_tax'?: {
    'enabled': boolean;
    'liability'?: {
      'account'?: string;
      'type': string;
    };
  };
  'automatically_finalizes_at'?: number;
  'collection_method'?: string;
  'custom_fields'?: Record<string, any>;
  'days_until_due'?: number;
  'default_payment_method'?: string;
  'default_source'?: Record<string, any>;
  'default_tax_rates'?: Record<string, any>;
  'description'?: string;
  'discounts'?: Record<string, any>;
  'due_date'?: number;
  'effective_at'?: Record<string, any>;
  'expand'?: string[];
  'footer'?: string;
  'issuer'?: {
    'account'?: string;
    'type': string;
  };
  'metadata'?: Record<string, any>;
  'number'?: Record<string, any>;
  'on_behalf_of'?: Record<string, any>;
  'payment_settings'?: {
    'default_mandate'?: Record<string, any>;
    'payment_method_options'?: {
      'acss_debit'?: Record<string, any>;
      'bancontact'?: Record<string, any>;
      'card'?: Record<string, any>;
      'customer_balance'?: Record<string, any>;
      'konbini'?: Record<string, any>;
      'payto'?: Record<string, any>;
      'pix'?: Record<string, any>;
      'sepa_debit'?: Record<string, any>;
      'upi'?: Record<string, any>;
      'us_bank_account'?: Record<string, any>;
    };
    'payment_method_types'?: Record<string, any>;
  };
  'rendering'?: {
    'amount_tax_display'?: string;
    'pdf'?: {
      'page_size'?: string;
    };
    'template'?: string;
    'template_version'?: Record<string, any>;
  };
  'shipping_cost'?: Record<string, any>;
  'shipping_details'?: Record<string, any>;
  'statement_descriptor'?: string;
  'transfer_data'?: Record<string, any>;
  headers?: Record<string, string>;
  _credentials?: Record<string, string>;
  fused?: FusedExecutionOptions;
}
export type PostInvoicesInvoiceSuccessResult = Invoice;
export type PostInvoicesInvoiceErrorResult = Error;
export type PostInvoicesInvoiceResponse =
  | { ok: true; status: number; data: PostInvoicesInvoiceSuccessResult; error: null }
  | { ok: false; status: number; data: null; error: PostInvoicesInvoiceErrorResult };

export interface PostPricesOptions {
  'active'?: boolean;
  'billing_scheme'?: string;
  'currency': string;
  'currency_options'?: Record<string, any>;
  'custom_unit_amount'?: {
    'enabled': boolean;
    'maximum'?: number;
    'minimum'?: number;
    'preset'?: number;
  };
  'expand'?: string[];
  'lookup_key'?: string;
  'metadata'?: Record<string, any>;
  'nickname'?: string;
  'product'?: string;
  'product_data'?: {
    'active'?: boolean;
    'id'?: string;
    'metadata'?: Record<string, any>;
    'name': string;
    'statement_descriptor'?: string;
    'tax_code'?: string;
    'unit_label'?: string;
  };
  'recurring'?: {
    'interval': string;
    'interval_count'?: number;
    'meter'?: string;
    'usage_type'?: string;
  };
  'tax_behavior'?: string;
  'tiers'?: {
    'flat_amount'?: number;
    'flat_amount_decimal'?: string;
    'unit_amount'?: number;
    'unit_amount_decimal'?: string;
    'up_to': Record<string, any>;
  }[];
  'tiers_mode'?: string;
  'transfer_lookup_key'?: boolean;
  'transform_quantity'?: {
    'divide_by': number;
    'round': string;
  };
  'unit_amount'?: number;
  'unit_amount_decimal'?: string;
  headers?: Record<string, string>;
  _credentials?: Record<string, string>;
  fused?: FusedExecutionOptions;
}
export type PostPricesSuccessResult = Price;
export type PostPricesErrorResult = Error;
export type PostPricesResponse =
  | { ok: true; status: number; data: PostPricesSuccessResult; error: null }
  | { ok: false; status: number; data: null; error: PostPricesErrorResult };

export interface PostPricesPriceOptions {
  'price': string;
  'active'?: boolean;
  'currency_options'?: Record<string, any>;
  'expand'?: string[];
  'lookup_key'?: string;
  'metadata'?: Record<string, any>;
  'nickname'?: string;
  'tax_behavior'?: string;
  'transfer_lookup_key'?: boolean;
  headers?: Record<string, string>;
  _credentials?: Record<string, string>;
  fused?: FusedExecutionOptions;
}
export type PostPricesPriceSuccessResult = Price;
export type PostPricesPriceErrorResult = Error;
export type PostPricesPriceResponse =
  | { ok: true; status: number; data: PostPricesPriceSuccessResult; error: null }
  | { ok: false; status: number; data: null; error: PostPricesPriceErrorResult };

export interface PostProductsOptions {
  'active'?: boolean;
  'default_price_data'?: {
    'currency': string;
    'currency_options'?: Record<string, any>;
    'custom_unit_amount'?: {
      'enabled': boolean;
      'maximum'?: number;
      'minimum'?: number;
      'preset'?: number;
    };
    'metadata'?: Record<string, any>;
    'recurring'?: {
      'interval': string;
      'interval_count'?: number;
    };
    'tax_behavior'?: string;
    'unit_amount'?: number;
    'unit_amount_decimal'?: string;
  };
  'description'?: string;
  'expand'?: string[];
  'id'?: string;
  'images'?: string[];
  'marketing_features'?: {
    'name': string;
  }[];
  'metadata'?: Record<string, any>;
  'name': string;
  'package_dimensions'?: {
    'height': number;
    'length': number;
    'weight': number;
    'width': number;
  };
  'shippable'?: boolean;
  'statement_descriptor'?: string;
  'tax_code'?: string;
  'unit_label'?: string;
  'url'?: string;
  headers?: Record<string, string>;
  _credentials?: Record<string, string>;
  fused?: FusedExecutionOptions;
}
export type PostProductsSuccessResult = Product;
export type PostProductsErrorResult = Error;
export type PostProductsResponse =
  | { ok: true; status: number; data: PostProductsSuccessResult; error: null }
  | { ok: false; status: number; data: null; error: PostProductsErrorResult };

export interface PostProductsIdOptions {
  'id': string;
  'active'?: boolean;
  'default_price'?: string;
  'description'?: Record<string, any>;
  'expand'?: string[];
  'images'?: Record<string, any>;
  'marketing_features'?: Record<string, any>;
  'metadata'?: Record<string, any>;
  'name'?: string;
  'package_dimensions'?: Record<string, any>;
  'shippable'?: boolean;
  'statement_descriptor'?: string;
  'tax_code'?: Record<string, any>;
  'unit_label'?: Record<string, any>;
  'url'?: Record<string, any>;
  headers?: Record<string, string>;
  _credentials?: Record<string, string>;
  fused?: FusedExecutionOptions;
}
export type PostProductsIdSuccessResult = Product;
export type PostProductsIdErrorResult = Error;
export type PostProductsIdResponse =
  | { ok: true; status: number; data: PostProductsIdSuccessResult; error: null }
  | { ok: false; status: number; data: null; error: PostProductsIdErrorResult };

export interface PostSubscriptionsOptions {
  'add_invoice_items'?: {
    'discountable'?: boolean;
    'discounts'?: {
      'coupon'?: string;
      'discount'?: string;
      'promotion_code'?: string;
    }[];
    'metadata'?: Record<string, any>;
    'period'?: {
      'end': {
        'timestamp'?: number;
        'type': string;
      };
      'start': {
        'timestamp'?: number;
        'type': string;
      };
    };
    'price'?: string;
    'price_data'?: {
      'currency': string;
      'product': string;
      'tax_behavior'?: string;
      'unit_amount'?: number;
      'unit_amount_decimal'?: string;
    };
    'quantity'?: number;
    'tax_rates'?: Record<string, any>;
  }[];
  'application_fee_percent'?: Record<string, any>;
  'automatic_tax'?: {
    'enabled': boolean;
    'liability'?: {
      'account'?: string;
      'type': string;
    };
  };
  'backdate_start_date'?: number;
  'billing_cycle_anchor'?: number;
  'billing_cycle_anchor_config'?: {
    'day_of_month': number;
    'hour'?: number;
    'minute'?: number;
    'month'?: number;
    'second'?: number;
  };
  'billing_mode'?: {
    'flexible'?: {
      'proration_discounts'?: string;
    };
    'type': string;
  };
  'billing_schedules'?: {
    'applies_to'?: {
      'price'?: string;
      'type': string;
    }[];
    'bill_until': {
      'duration'?: {
        'interval': string;
        'interval_count'?: number;
      };
      'timestamp'?: number;
      'type': string;
    };
    'key'?: string;
  }[];
  'billing_thresholds'?: Record<string, any>;
  'cancel_at'?: Record<string, any>;
  'cancel_at_period_end'?: boolean;
  'collection_method'?: string;
  'currency'?: string;
  'customer'?: string;
  'customer_account'?: string;
  'days_until_due'?: number;
  'default_payment_method'?: string;
  'default_source'?: string;
  'default_tax_rates'?: Record<string, any>;
  'description'?: string;
  'discounts'?: Record<string, any>;
  'expand'?: string[];
  'invoice_settings'?: {
    'account_tax_ids'?: Record<string, any>;
    'custom_fields'?: Record<string, any>;
    'description'?: string;
    'footer'?: string;
    'issuer'?: {
      'account'?: string;
      'type': string;
    };
  };
  'items'?: {
    'billing_thresholds'?: Record<string, any>;
    'discounts'?: Record<string, any>;
    'metadata'?: Record<string, any>;
    'price'?: string;
    'price_data'?: {
      'currency': string;
      'product': string;
      'recurring': {
        'interval': string;
        'interval_count'?: number;
      };
      'tax_behavior'?: string;
      'unit_amount'?: number;
      'unit_amount_decimal'?: string;
    };
    'quantity'?: number;
    'tax_rates'?: Record<string, any>;
  }[];
  'metadata'?: Record<string, any>;
  'off_session'?: boolean;
  'on_behalf_of'?: Record<string, any>;
  'payment_behavior'?: string;
  'payment_settings'?: {
    'payment_method_options'?: {
      'acss_debit'?: Record<string, any>;
      'bancontact'?: Record<string, any>;
      'card'?: Record<string, any>;
      'customer_balance'?: Record<string, any>;
      'konbini'?: Record<string, any>;
      'payto'?: Record<string, any>;
      'pix'?: Record<string, any>;
      'sepa_debit'?: Record<string, any>;
      'upi'?: Record<string, any>;
      'us_bank_account'?: Record<string, any>;
    };
    'payment_method_types'?: Record<string, any>;
    'save_default_payment_method'?: string;
  };
  'pending_invoice_item_interval'?: Record<string, any>;
  'proration_behavior'?: string;
  'transfer_data'?: {
    'amount_percent'?: number;
    'destination': string;
  };
  'trial_end'?: Record<string, any>;
  'trial_from_plan'?: boolean;
  'trial_period_days'?: number;
  'trial_settings'?: {
    'end_behavior': {
      'missing_payment_method': string;
    };
  };
  headers?: Record<string, string>;
  _credentials?: Record<string, string>;
  fused?: FusedExecutionOptions;
}
export type PostSubscriptionsSuccessResult = Subscription;
export type PostSubscriptionsErrorResult = Error;
export type PostSubscriptionsResponse =
  | { ok: true; status: number; data: PostSubscriptionsSuccessResult; error: null }
  | { ok: false; status: number; data: null; error: PostSubscriptionsErrorResult };

export interface PostSubscriptionsSubscriptionExposedIdOptions {
  'subscription_exposed_id': string;
  'add_invoice_items'?: {
    'discountable'?: boolean;
    'discounts'?: {
      'coupon'?: string;
      'discount'?: string;
      'promotion_code'?: string;
    }[];
    'metadata'?: Record<string, any>;
    'period'?: {
      'end': {
        'timestamp'?: number;
        'type': string;
      };
      'start': {
        'timestamp'?: number;
        'type': string;
      };
    };
    'price'?: string;
    'price_data'?: {
      'currency': string;
      'product': string;
      'tax_behavior'?: string;
      'unit_amount'?: number;
      'unit_amount_decimal'?: string;
    };
    'quantity'?: number;
    'tax_rates'?: Record<string, any>;
  }[];
  'application_fee_percent'?: Record<string, any>;
  'automatic_tax'?: {
    'enabled': boolean;
    'liability'?: {
      'account'?: string;
      'type': string;
    };
  };
  'billing_cycle_anchor'?: string;
  'billing_schedules'?: Record<string, any>;
  'billing_thresholds'?: Record<string, any>;
  'cancel_at'?: Record<string, any>;
  'cancel_at_period_end'?: boolean;
  'cancellation_details'?: {
    'comment'?: Record<string, any>;
    'feedback'?: string;
  };
  'collection_method'?: string;
  'days_until_due'?: number;
  'default_payment_method'?: string;
  'default_source'?: Record<string, any>;
  'default_tax_rates'?: Record<string, any>;
  'description'?: Record<string, any>;
  'discounts'?: Record<string, any>;
  'expand'?: string[];
  'invoice_settings'?: {
    'account_tax_ids'?: Record<string, any>;
    'custom_fields'?: Record<string, any>;
    'description'?: Record<string, any>;
    'footer'?: Record<string, any>;
    'issuer'?: {
      'account'?: string;
      'type': string;
    };
  };
  'items'?: {
    'billing_thresholds'?: Record<string, any>;
    'clear_usage'?: boolean;
    'deleted'?: boolean;
    'discounts'?: Record<string, any>;
    'id'?: string;
    'metadata'?: Record<string, any>;
    'price'?: string;
    'price_data'?: {
      'currency': string;
      'product': string;
      'recurring': {
        'interval': string;
        'interval_count'?: number;
      };
      'tax_behavior'?: string;
      'unit_amount'?: number;
      'unit_amount_decimal'?: string;
    };
    'quantity'?: number;
    'tax_rates'?: Record<string, any>;
  }[];
  'metadata'?: Record<string, any>;
  'off_session'?: boolean;
  'on_behalf_of'?: Record<string, any>;
  'pause_collection'?: Record<string, any>;
  'payment_behavior'?: string;
  'payment_settings'?: {
    'payment_method_options'?: {
      'acss_debit'?: Record<string, any>;
      'bancontact'?: Record<string, any>;
      'card'?: Record<string, any>;
      'customer_balance'?: Record<string, any>;
      'konbini'?: Record<string, any>;
      'payto'?: Record<string, any>;
      'pix'?: Record<string, any>;
      'sepa_debit'?: Record<string, any>;
      'upi'?: Record<string, any>;
      'us_bank_account'?: Record<string, any>;
    };
    'payment_method_types'?: Record<string, any>;
    'save_default_payment_method'?: string;
  };
  'pending_invoice_item_interval'?: Record<string, any>;
  'proration_behavior'?: string;
  'proration_date'?: number;
  'transfer_data'?: Record<string, any>;
  'trial_end'?: Record<string, any>;
  'trial_from_plan'?: boolean;
  'trial_settings'?: {
    'end_behavior': {
      'missing_payment_method': string;
    };
  };
  headers?: Record<string, string>;
  _credentials?: Record<string, string>;
  fused?: FusedExecutionOptions;
}
export type PostSubscriptionsSubscriptionExposedIdSuccessResult = Subscription;
export type PostSubscriptionsSubscriptionExposedIdErrorResult = Error;
export type PostSubscriptionsSubscriptionExposedIdResponse =
  | { ok: true; status: number; data: PostSubscriptionsSubscriptionExposedIdSuccessResult; error: null }
  | { ok: false; status: number; data: null; error: PostSubscriptionsSubscriptionExposedIdErrorResult };

export interface StripeIntegrationAuth {
  username?: string;
  password?: string;
  token?: string;
}
export interface StripeIntegrationConfig extends SDKConfig {
  environment?: string;
}

export class StripeClient {
  private _auths: AuthProvider[] = [];

  private readonly _http: BaseClient;
  private readonly _timeoutMs: number;

  constructor(config: StripeIntegrationConfig = {}, client?: any) {

    this._http = new BaseClient('Stripe', client, config.timeoutMs ?? 30000, config.debug ?? false, { ...{}, ...config.headers }, '0a8e9eaf-e4f8-5ed9-8d85-71df6d162fe0', config.token, config.credentials, config.environment, config.streamIdleTimeoutMs, config.maxStreamDurationMs);
    this._timeoutMs = config.timeoutMs ?? 30000;
  }

  public setAuth(credentials: StripeIntegrationAuth) {
    this._auths = [];
    if (credentials.username || credentials.password) { this._auths.push(new HttpProvider('basic', credentials.username || '', credentials.password || '', "basicAuth")); }
    if (credentials.token) { this._auths.push(new HttpProvider("bearer", credentials.token, undefined, "bearerAuth")); }
  }


  private _buildEngineParams(paramValues: Record<string, any>, body: unknown): Record<string, any> {
    const params: Record<string, any> = {};
    for (const [key, value] of Object.entries(paramValues)) {
      if (value !== undefined) {
        params[key] = value;
      }
    }
    // The Engine rebuilds the provider request from params, not the SDK-local
    // URL, so query/path/header values must travel beside body fields.
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      Object.assign(params, body as Record<string, any>);
    } else if (body !== undefined) {
      params.body = body;
    }
    return params;
  }

  private _buildMethodCredentials(fused?: FusedExecutionOptions, credentials?: Record<string, string>): Record<string, string> | undefined {
    const out: Record<string, string> = { ...(credentials ?? {}) };
    if (fused?.endUserRef) {
      // The SDK sends only a stable user reference; the Engine resolves the
      // provider token from the configured bucket during execution.
      out.fused_end_user_ref = fused.endUserRef;
    }
    if (fused?.authType) {
      // Auth type is a stable selector across generated SDKs; provider-specific
      // security scheme names remain an Engine/internal detail.
      out.fused_auth_type = fused.authType;
    }
    if (fused?.authName) {
      // Scheme identity is a selector only; Engine resolves and applies the
      // corresponding credential and strategy from its local connection.
      out.fused_auth_name = fused.authName;
    }
    if (fused?.resourceId) {
      // Resource IDs are opaque Engine identifiers; provider tenant IDs and
      // dynamic URLs never cross the SDK execution boundary.
      out.fused_resource_id = fused.resourceId;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }





  public readonly subscriptions = {

  /**
   * <p>Cancels a customer’s subscription immediately. The customer won’t be charged again for the subscription. After it’s canceled, the subscription is largely immutable. You can still update its <a href="/metadata">metadata</a> and <code>cancellation_details</code>.</p>

<p>Any pending invoice items that you’ve created are still charged at the end of the period, unless manually <a href="/api/invoiceitems/delete">deleted</a>. If you’ve set the subscription to cancel at the end of the period, any pending prorations are also left in place and collected at the end of the period. But if the subscription is set to cancel immediately, pending prorations are removed if <code>invoice_now</code> and <code>prorate</code> are both set to false.</p>

<p>By default, upon subscription cancellation, Stripe stops automatic collection of all finalized invoices for the customer. This is intended to prevent unexpected payment attempts after the customer has canceled a subscription. However, you can resume automatic collection of the invoices manually after subscription cancellation to have us proceed. Or, you could check for unpaid invoices before allowing the customer to cancel the subscription at all.</p>
   */
  deleteSubscriptionsSubscriptionExposedId: async (options: DeleteSubscriptionsSubscriptionExposedIdOptions): Promise<DeleteSubscriptionsSubscriptionExposedIdResponse> => {
        const opts = options || {} as any;
    const { 'subscription_exposed_id': _subscriptionExposedId, 'headers': _headers, '_credentials': _credentials, 'fused': _fused, ...body } = opts;

    const requestHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (_headers) {
      for (const [k, v] of Object.entries(_headers as Record<string, string>)) {
        if (v !== undefined) requestHeaders[k] = String(v);
      }
    }

    let reqObj: HttpRequest = {
      method: "DELETE",
      operationId: 'DeleteSubscriptionsSubscriptionExposedId',
      headers: requestHeaders,
      body: this._buildEngineParams({ ...{ 'subscription_exposed_id': opts['subscription_exposed_id'] }, ...{}, ...{}, ...{} }, body),
      credentials: this._buildMethodCredentials(_fused, _credentials),
      paginationMaxPages: _fused?.pagination?.maxPages,
      timeoutMs: this._timeoutMs
    };

    if (this._auths && this._auths.length > 0) {
      for (const auth of this._auths) {
        reqObj = await auth.apply(reqObj);
      }
    }

    const response = await this._http.request<any>(reqObj);

    if (response.status === 401 || response.status === 403 || response.status === 429) {
      normaliseError('Stripe', 'DeleteSubscriptionsSubscriptionExposedId', response);
    }

if (response.ok) {
      return { ok: true, status: response.status, data: response.body as DeleteSubscriptionsSubscriptionExposedIdSuccessResult, error: null };
    } else {
      return { ok: false, status: response.status, data: null, error: response.body as DeleteSubscriptionsSubscriptionExposedIdErrorResult };
    }
  },

  /**
   * <p>By default, returns a list of subscriptions that have not been canceled. In order to list canceled subscriptions, specify <code>status=canceled</code>.</p>
   */
  getSubscriptions: async (options: GetSubscriptionsOptions): Promise<GetSubscriptionsResponse> => {
        const opts = options || {} as any;
    const { 'automatic_tax': _automaticTax, 'collection_method': _collectionMethod, 'created': _created, 'current_period_end': _currentPeriodEnd, 'current_period_start': _currentPeriodStart, 'customer': _customer, 'customer_account': _customerAccount, 'ending_before': _endingBefore, 'expand': _expand, 'limit': _limit, 'price': _price, 'starting_after': _startingAfter, 'status': _status, 'test_clock': _testClock, 'headers': _headers, '_credentials': _credentials, 'fused': _fused, ...body } = opts;

    const requestHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (_headers) {
      for (const [k, v] of Object.entries(_headers as Record<string, string>)) {
        if (v !== undefined) requestHeaders[k] = String(v);
      }
    }

    let reqObj: HttpRequest = {
      method: "GET",
      operationId: 'GetSubscriptions',
      headers: requestHeaders,
      body: this._buildEngineParams({ ...{}, ...{ 'automatic_tax': opts['automatic_tax'], 'collection_method': opts['collection_method'], 'created': opts['created'], 'current_period_end': opts['current_period_end'], 'current_period_start': opts['current_period_start'], 'customer': opts['customer'], 'customer_account': opts['customer_account'], 'ending_before': opts['ending_before'], 'expand': opts['expand'], 'limit': opts['limit'], 'price': opts['price'], 'starting_after': opts['starting_after'], 'status': opts['status'], 'test_clock': opts['test_clock'] }, ...{}, ...{} }, body),
      credentials: this._buildMethodCredentials(_fused, _credentials),
      paginationMaxPages: _fused?.pagination?.maxPages,
      timeoutMs: this._timeoutMs
    };

    if (this._auths && this._auths.length > 0) {
      for (const auth of this._auths) {
        reqObj = await auth.apply(reqObj);
      }
    }

    const response = await this._http.request<any>(reqObj);

    if (response.status === 401 || response.status === 403 || response.status === 429) {
      normaliseError('Stripe', 'GetSubscriptions', response);
    }

if (response.ok) {
      return { ok: true, status: response.status, data: response.body as GetSubscriptionsSuccessResult, error: null };
    } else {
      return { ok: false, status: response.status, data: null, error: response.body as GetSubscriptionsErrorResult };
    }
  },

  /**
   * <p>Retrieves the subscription with the given ID.</p>
   */
  getSubscriptionsSubscriptionExposedId: async (options: GetSubscriptionsSubscriptionExposedIdOptions): Promise<GetSubscriptionsSubscriptionExposedIdResponse> => {
        const opts = options || {} as any;
    const { 'expand': _expand, 'subscription_exposed_id': _subscriptionExposedId, 'headers': _headers, '_credentials': _credentials, 'fused': _fused, ...body } = opts;

    const requestHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (_headers) {
      for (const [k, v] of Object.entries(_headers as Record<string, string>)) {
        if (v !== undefined) requestHeaders[k] = String(v);
      }
    }

    let reqObj: HttpRequest = {
      method: "GET",
      operationId: 'GetSubscriptionsSubscriptionExposedId',
      headers: requestHeaders,
      body: this._buildEngineParams({ ...{ 'subscription_exposed_id': opts['subscription_exposed_id'] }, ...{ 'expand': opts['expand'] }, ...{}, ...{} }, body),
      credentials: this._buildMethodCredentials(_fused, _credentials),
      paginationMaxPages: _fused?.pagination?.maxPages,
      timeoutMs: this._timeoutMs
    };

    if (this._auths && this._auths.length > 0) {
      for (const auth of this._auths) {
        reqObj = await auth.apply(reqObj);
      }
    }

    const response = await this._http.request<any>(reqObj);

    if (response.status === 401 || response.status === 403 || response.status === 429) {
      normaliseError('Stripe', 'GetSubscriptionsSubscriptionExposedId', response);
    }

if (response.ok) {
      return { ok: true, status: response.status, data: response.body as GetSubscriptionsSubscriptionExposedIdSuccessResult, error: null };
    } else {
      return { ok: false, status: response.status, data: null, error: response.body as GetSubscriptionsSubscriptionExposedIdErrorResult };
    }
  },

  /**
   * <p>Creates a new subscription on an existing customer. Each customer can have up to 500 active or scheduled subscriptions.</p>

<p>When you create a subscription with <code>collection_method=charge_automatically</code>, the first invoice is finalized as part of the request.
The <code>payment_behavior</code> parameter determines the exact behavior of the initial payment.</p>

<p>To start subscriptions where the first invoice always begins in a <code>draft</code> status, use <a href="/docs/billing/subscriptions/subscription-schedules#managing">subscription schedules</a> instead.
Schedules provide the flexibility to model more complex billing configurations that change over time.</p>
   */
  postSubscriptions: async (options?: PostSubscriptionsOptions): Promise<PostSubscriptionsResponse> => {
        const opts = options || {} as any;
    const { 'headers': _headers, '_credentials': _credentials, 'fused': _fused, ...body } = opts;

    const requestHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (_headers) {
      for (const [k, v] of Object.entries(_headers as Record<string, string>)) {
        if (v !== undefined) requestHeaders[k] = String(v);
      }
    }

    let reqObj: HttpRequest = {
      method: "POST",
      operationId: 'PostSubscriptions',
      headers: requestHeaders,
      body: this._buildEngineParams({ ...{}, ...{}, ...{}, ...{} }, body),
      credentials: this._buildMethodCredentials(_fused, _credentials),
      paginationMaxPages: _fused?.pagination?.maxPages,
      timeoutMs: this._timeoutMs
    };

    if (this._auths && this._auths.length > 0) {
      for (const auth of this._auths) {
        reqObj = await auth.apply(reqObj);
      }
    }

    const response = await this._http.request<any>(reqObj);

    if (response.status === 401 || response.status === 403 || response.status === 429) {
      normaliseError('Stripe', 'PostSubscriptions', response);
    }

if (response.ok) {
      return { ok: true, status: response.status, data: response.body as PostSubscriptionsSuccessResult, error: null };
    } else {
      return { ok: false, status: response.status, data: null, error: response.body as PostSubscriptionsErrorResult };
    }
  },

  /**
   * <p>Updates an existing subscription to match the specified parameters.
When changing prices or quantities, we optionally prorate the price we charge next month to make up for any price changes.
To preview how the proration is calculated, use the <a href="/docs/api/invoices/create_preview">create preview</a> endpoint.</p>

<p>By default, we prorate subscription changes. For example, if a customer signs up on May 1 for a <currency>100</currency> price, they’ll be billed <currency>100</currency> immediately. If on May 15 they switch to a <currency>200</currency> price, then on June 1 they’ll be billed <currency>250</currency> (<currency>200</currency> for a renewal of her subscription, plus a <currency>50</currency> prorating adjustment for half of the previous month’s <currency>100</currency> difference). Similarly, a downgrade generates a credit that is applied to the next invoice. We also prorate when you make quantity changes.</p>

<p>Switching prices does not normally change the billing date or generate an immediate charge unless:</p>

<ul>
<li>The billing interval is changed (for example, from monthly to yearly).</li>
<li>The subscription moves from free to paid.</li>
<li>A trial starts or ends.</li>
</ul>

<p>In these cases, we apply a credit for the unused time on the previous price, immediately charge the customer using the new price, and reset the billing date. Learn about how <a href="/docs/billing/subscriptions/upgrade-downgrade#immediate-payment">Stripe immediately attempts payment for subscription changes</a>.</p>

<p>If you want to charge for an upgrade immediately, pass <code>proration_behavior</code> as <code>always_invoice</code> to create prorations, automatically invoice the customer for those proration adjustments, and attempt to collect payment. If you pass <code>create_prorations</code>, the prorations are created but not automatically invoiced. If you want to bill the customer for the prorations before the subscription’s renewal date, you need to manually <a href="/docs/api/invoices/create">invoice the customer</a>.</p>

<p>If you don’t want to prorate, set the <code>proration_behavior</code> option to <code>none</code>. With this option, the customer is billed <currency>100</currency> on May 1 and <currency>200</currency> on June 1. Similarly, if you set <code>proration_behavior</code> to <code>none</code> when switching between different billing intervals (for example, from monthly to yearly), we don’t generate any credits for the old subscription’s unused time. We still reset the billing date and bill immediately for the new subscription.</p>

<p>Updating the quantity on a subscription many times in an hour may result in <a href="/docs/rate-limits">rate limiting</a>. If you need to bill for a frequently changing quantity, consider integrating <a href="/docs/billing/subscriptions/usage-based">usage-based billing</a> instead.</p>
   */
  postSubscriptionsSubscriptionExposedId: async (options: PostSubscriptionsSubscriptionExposedIdOptions): Promise<PostSubscriptionsSubscriptionExposedIdResponse> => {
        const opts = options || {} as any;
    const { 'subscription_exposed_id': _subscriptionExposedId, 'headers': _headers, '_credentials': _credentials, 'fused': _fused, ...body } = opts;

    const requestHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (_headers) {
      for (const [k, v] of Object.entries(_headers as Record<string, string>)) {
        if (v !== undefined) requestHeaders[k] = String(v);
      }
    }

    let reqObj: HttpRequest = {
      method: "POST",
      operationId: 'PostSubscriptionsSubscriptionExposedId',
      headers: requestHeaders,
      body: this._buildEngineParams({ ...{ 'subscription_exposed_id': opts['subscription_exposed_id'] }, ...{}, ...{}, ...{} }, body),
      credentials: this._buildMethodCredentials(_fused, _credentials),
      paginationMaxPages: _fused?.pagination?.maxPages,
      timeoutMs: this._timeoutMs
    };

    if (this._auths && this._auths.length > 0) {
      for (const auth of this._auths) {
        reqObj = await auth.apply(reqObj);
      }
    }

    const response = await this._http.request<any>(reqObj);

    if (response.status === 401 || response.status === 403 || response.status === 429) {
      normaliseError('Stripe', 'PostSubscriptionsSubscriptionExposedId', response);
    }

if (response.ok) {
      return { ok: true, status: response.status, data: response.body as PostSubscriptionsSubscriptionExposedIdSuccessResult, error: null };
    } else {
      return { ok: false, status: response.status, data: null, error: response.body as PostSubscriptionsSubscriptionExposedIdErrorResult };
    }
  }
  };

  public readonly checkout = {

  /**
   * <p>Returns a list of Checkout Sessions.</p>
   */
  getCheckoutSessions: async (options: GetCheckoutSessionsOptions): Promise<GetCheckoutSessionsResponse> => {
        const opts = options || {} as any;
    const { 'created': _created, 'customer': _customer, 'customer_account': _customerAccount, 'customer_details': _customerDetails, 'ending_before': _endingBefore, 'expand': _expand, 'limit': _limit, 'payment_intent': _paymentIntent, 'payment_link': _paymentLink, 'starting_after': _startingAfter, 'status': _status, 'subscription': _subscription, 'headers': _headers, '_credentials': _credentials, 'fused': _fused, ...body } = opts;

    const requestHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (_headers) {
      for (const [k, v] of Object.entries(_headers as Record<string, string>)) {
        if (v !== undefined) requestHeaders[k] = String(v);
      }
    }

    let reqObj: HttpRequest = {
      method: "GET",
      operationId: 'GetCheckoutSessions',
      headers: requestHeaders,
      body: this._buildEngineParams({ ...{}, ...{ 'created': opts['created'], 'customer': opts['customer'], 'customer_account': opts['customer_account'], 'customer_details': opts['customer_details'], 'ending_before': opts['ending_before'], 'expand': opts['expand'], 'limit': opts['limit'], 'payment_intent': opts['payment_intent'], 'payment_link': opts['payment_link'], 'starting_after': opts['starting_after'], 'status': opts['status'], 'subscription': opts['subscription'] }, ...{}, ...{} }, body),
      credentials: this._buildMethodCredentials(_fused, _credentials),
      paginationMaxPages: _fused?.pagination?.maxPages,
      timeoutMs: this._timeoutMs
    };

    if (this._auths && this._auths.length > 0) {
      for (const auth of this._auths) {
        reqObj = await auth.apply(reqObj);
      }
    }

    const response = await this._http.request<any>(reqObj);

    if (response.status === 401 || response.status === 403 || response.status === 429) {
      normaliseError('Stripe', 'GetCheckoutSessions', response);
    }

if (response.ok) {
      return { ok: true, status: response.status, data: response.body as GetCheckoutSessionsSuccessResult, error: null };
    } else {
      return { ok: false, status: response.status, data: null, error: response.body as GetCheckoutSessionsErrorResult };
    }
  },

  /**
   * <p>Retrieves a Checkout Session object.</p>
   */
  getCheckoutSessionsSession: async (options: GetCheckoutSessionsSessionOptions): Promise<GetCheckoutSessionsSessionResponse> => {
        const opts = options || {} as any;
    const { 'expand': _expand, 'session': _session, 'headers': _headers, '_credentials': _credentials, 'fused': _fused, ...body } = opts;

    const requestHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (_headers) {
      for (const [k, v] of Object.entries(_headers as Record<string, string>)) {
        if (v !== undefined) requestHeaders[k] = String(v);
      }
    }

    let reqObj: HttpRequest = {
      method: "GET",
      operationId: 'GetCheckoutSessionsSession',
      headers: requestHeaders,
      body: this._buildEngineParams({ ...{ 'session': opts['session'] }, ...{ 'expand': opts['expand'] }, ...{}, ...{} }, body),
      credentials: this._buildMethodCredentials(_fused, _credentials),
      paginationMaxPages: _fused?.pagination?.maxPages,
      timeoutMs: this._timeoutMs
    };

    if (this._auths && this._auths.length > 0) {
      for (const auth of this._auths) {
        reqObj = await auth.apply(reqObj);
      }
    }

    const response = await this._http.request<any>(reqObj);

    if (response.status === 401 || response.status === 403 || response.status === 429) {
      normaliseError('Stripe', 'GetCheckoutSessionsSession', response);
    }

if (response.ok) {
      return { ok: true, status: response.status, data: response.body as GetCheckoutSessionsSessionSuccessResult, error: null };
    } else {
      return { ok: false, status: response.status, data: null, error: response.body as GetCheckoutSessionsSessionErrorResult };
    }
  },

  /**
   * <p>Creates a Checkout Session object.</p>
   */
  postCheckoutSessions: async (options?: PostCheckoutSessionsOptions): Promise<PostCheckoutSessionsResponse> => {
        const opts = options || {} as any;
    const { 'headers': _headers, '_credentials': _credentials, 'fused': _fused, ...body } = opts;

    const requestHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (_headers) {
      for (const [k, v] of Object.entries(_headers as Record<string, string>)) {
        if (v !== undefined) requestHeaders[k] = String(v);
      }
    }

    let reqObj: HttpRequest = {
      method: "POST",
      operationId: 'PostCheckoutSessions',
      headers: requestHeaders,
      body: this._buildEngineParams({ ...{}, ...{}, ...{}, ...{} }, body),
      credentials: this._buildMethodCredentials(_fused, _credentials),
      paginationMaxPages: _fused?.pagination?.maxPages,
      timeoutMs: this._timeoutMs
    };

    if (this._auths && this._auths.length > 0) {
      for (const auth of this._auths) {
        reqObj = await auth.apply(reqObj);
      }
    }

    const response = await this._http.request<any>(reqObj);

    if (response.status === 401 || response.status === 403 || response.status === 429) {
      normaliseError('Stripe', 'PostCheckoutSessions', response);
    }

if (response.ok) {
      return { ok: true, status: response.status, data: response.body as PostCheckoutSessionsSuccessResult, error: null };
    } else {
      return { ok: false, status: response.status, data: null, error: response.body as PostCheckoutSessionsErrorResult };
    }
  }
  };

  public readonly customers = {

  /**
   * <p>Returns a list of your customers. The customers are returned sorted by creation date, with the most recent customers appearing first.</p>
   */
  getCustomers: async (options: GetCustomersOptions): Promise<GetCustomersResponse> => {
        const opts = options || {} as any;
    const { 'created': _created, 'email': _email, 'ending_before': _endingBefore, 'expand': _expand, 'limit': _limit, 'starting_after': _startingAfter, 'test_clock': _testClock, 'headers': _headers, '_credentials': _credentials, 'fused': _fused, ...body } = opts;

    const requestHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (_headers) {
      for (const [k, v] of Object.entries(_headers as Record<string, string>)) {
        if (v !== undefined) requestHeaders[k] = String(v);
      }
    }

    let reqObj: HttpRequest = {
      method: "GET",
      operationId: 'GetCustomers',
      headers: requestHeaders,
      body: this._buildEngineParams({ ...{}, ...{ 'created': opts['created'], 'email': opts['email'], 'ending_before': opts['ending_before'], 'expand': opts['expand'], 'limit': opts['limit'], 'starting_after': opts['starting_after'], 'test_clock': opts['test_clock'] }, ...{}, ...{} }, body),
      credentials: this._buildMethodCredentials(_fused, _credentials),
      paginationMaxPages: _fused?.pagination?.maxPages,
      timeoutMs: this._timeoutMs
    };

    if (this._auths && this._auths.length > 0) {
      for (const auth of this._auths) {
        reqObj = await auth.apply(reqObj);
      }
    }

    const response = await this._http.request<any>(reqObj);

    if (response.status === 401 || response.status === 403 || response.status === 429) {
      normaliseError('Stripe', 'GetCustomers', response);
    }

if (response.ok) {
      return { ok: true, status: response.status, data: response.body as GetCustomersSuccessResult, error: null };
    } else {
      return { ok: false, status: response.status, data: null, error: response.body as GetCustomersErrorResult };
    }
  },

  /**
   * <p>Search for customers you’ve previously created using Stripe’s <a href="/docs/search#search-query-language">Search Query Language</a>.
Don’t use search in read-after-write flows where strict consistency is necessary. Under normal operating
conditions, data is searchable in less than a minute. Occasionally, propagation of new or updated data can be up
to an hour behind during outages. Search functionality is not available to merchants in India.</p>
   */
  getCustomersSearch: async (options: GetCustomersSearchOptions): Promise<GetCustomersSearchResponse> => {
        const opts = options || {} as any;
    const { 'expand': _expand, 'limit': _limit, 'page': _page, 'query': _query, 'headers': _headers, '_credentials': _credentials, 'fused': _fused, ...body } = opts;

    const requestHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (_headers) {
      for (const [k, v] of Object.entries(_headers as Record<string, string>)) {
        if (v !== undefined) requestHeaders[k] = String(v);
      }
    }

    let reqObj: HttpRequest = {
      method: "GET",
      operationId: 'GetCustomersSearch',
      headers: requestHeaders,
      body: this._buildEngineParams({ ...{}, ...{ 'expand': opts['expand'], 'limit': opts['limit'], 'page': opts['page'], 'query': opts['query'] }, ...{}, ...{} }, body),
      credentials: this._buildMethodCredentials(_fused, _credentials),
      paginationMaxPages: _fused?.pagination?.maxPages,
      timeoutMs: this._timeoutMs
    };

    if (this._auths && this._auths.length > 0) {
      for (const auth of this._auths) {
        reqObj = await auth.apply(reqObj);
      }
    }

    const response = await this._http.request<any>(reqObj);

    if (response.status === 401 || response.status === 403 || response.status === 429) {
      normaliseError('Stripe', 'GetCustomersSearch', response);
    }

if (response.ok) {
      return { ok: true, status: response.status, data: response.body as GetCustomersSearchSuccessResult, error: null };
    } else {
      return { ok: false, status: response.status, data: null, error: response.body as GetCustomersSearchErrorResult };
    }
  },

  /**
   * <p>Retrieves a Customer object.</p>
   */
  getCustomersCustomer: async (options: GetCustomersCustomerOptions): Promise<GetCustomersCustomerResponse> => {
        const opts = options || {} as any;
    const { 'customer': _customer, 'expand': _expand, 'headers': _headers, '_credentials': _credentials, 'fused': _fused, ...body } = opts;

    const requestHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (_headers) {
      for (const [k, v] of Object.entries(_headers as Record<string, string>)) {
        if (v !== undefined) requestHeaders[k] = String(v);
      }
    }

    let reqObj: HttpRequest = {
      method: "GET",
      operationId: 'GetCustomersCustomer',
      headers: requestHeaders,
      body: this._buildEngineParams({ ...{ 'customer': opts['customer'] }, ...{ 'expand': opts['expand'] }, ...{}, ...{} }, body),
      credentials: this._buildMethodCredentials(_fused, _credentials),
      paginationMaxPages: _fused?.pagination?.maxPages,
      timeoutMs: this._timeoutMs
    };

    if (this._auths && this._auths.length > 0) {
      for (const auth of this._auths) {
        reqObj = await auth.apply(reqObj);
      }
    }

    const response = await this._http.request<any>(reqObj);

    if (response.status === 401 || response.status === 403 || response.status === 429) {
      normaliseError('Stripe', 'GetCustomersCustomer', response);
    }

if (response.ok) {
      return { ok: true, status: response.status, data: response.body as GetCustomersCustomerSuccessResult, error: null };
    } else {
      return { ok: false, status: response.status, data: null, error: response.body as GetCustomersCustomerErrorResult };
    }
  },

  /**
   * <p>Creates a new customer object.</p>
   */
  postCustomers: async (options?: PostCustomersOptions): Promise<PostCustomersResponse> => {
        const opts = options || {} as any;
    const { 'headers': _headers, '_credentials': _credentials, 'fused': _fused, ...body } = opts;

    const requestHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (_headers) {
      for (const [k, v] of Object.entries(_headers as Record<string, string>)) {
        if (v !== undefined) requestHeaders[k] = String(v);
      }
    }

    let reqObj: HttpRequest = {
      method: "POST",
      operationId: 'PostCustomers',
      headers: requestHeaders,
      body: this._buildEngineParams({ ...{}, ...{}, ...{}, ...{} }, body),
      credentials: this._buildMethodCredentials(_fused, _credentials),
      paginationMaxPages: _fused?.pagination?.maxPages,
      timeoutMs: this._timeoutMs
    };

    if (this._auths && this._auths.length > 0) {
      for (const auth of this._auths) {
        reqObj = await auth.apply(reqObj);
      }
    }

    const response = await this._http.request<any>(reqObj);

    if (response.status === 401 || response.status === 403 || response.status === 429) {
      normaliseError('Stripe', 'PostCustomers', response);
    }

if (response.ok) {
      return { ok: true, status: response.status, data: response.body as PostCustomersSuccessResult, error: null };
    } else {
      return { ok: false, status: response.status, data: null, error: response.body as PostCustomersErrorResult };
    }
  },

  /**
   * <p>Updates the specified customer by setting the values of the parameters passed. Any parameters not provided are left unchanged. For example, if you pass the <strong>source</strong> parameter, that becomes the customer’s active source (such as a card) to be used for all charges in the future. When you update a customer to a new valid card source by passing the <strong>source</strong> parameter: for each of the customer’s current subscriptions, if the subscription bills automatically and is in the <code>past_due</code> state, then the latest open invoice for the subscription with automatic collection enabled is retried. This retry doesn’t count as an automatic retry, and doesn’t affect the next regularly scheduled payment for the invoice. Changing the <strong>default_source</strong> for a customer doesn’t trigger this behavior.</p>

<p>This request accepts mostly the same arguments as the customer creation call.</p>
   */
  postCustomersCustomer: async (options: PostCustomersCustomerOptions): Promise<PostCustomersCustomerResponse> => {
        const opts = options || {} as any;
    const { 'customer': _customer, 'headers': _headers, '_credentials': _credentials, 'fused': _fused, ...body } = opts;

    const requestHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (_headers) {
      for (const [k, v] of Object.entries(_headers as Record<string, string>)) {
        if (v !== undefined) requestHeaders[k] = String(v);
      }
    }

    let reqObj: HttpRequest = {
      method: "POST",
      operationId: 'PostCustomersCustomer',
      headers: requestHeaders,
      body: this._buildEngineParams({ ...{ 'customer': opts['customer'] }, ...{}, ...{}, ...{} }, body),
      credentials: this._buildMethodCredentials(_fused, _credentials),
      paginationMaxPages: _fused?.pagination?.maxPages,
      timeoutMs: this._timeoutMs
    };

    if (this._auths && this._auths.length > 0) {
      for (const auth of this._auths) {
        reqObj = await auth.apply(reqObj);
      }
    }

    const response = await this._http.request<any>(reqObj);

    if (response.status === 401 || response.status === 403 || response.status === 429) {
      normaliseError('Stripe', 'PostCustomersCustomer', response);
    }

if (response.ok) {
      return { ok: true, status: response.status, data: response.body as PostCustomersCustomerSuccessResult, error: null };
    } else {
      return { ok: false, status: response.status, data: null, error: response.body as PostCustomersCustomerErrorResult };
    }
  }
  };

  public readonly invoices = {

  /**
   * <p>You can list all invoices, or list the invoices for a specific customer. The invoices are returned sorted by creation date, with the most recently created invoices appearing first.</p>
   */
  getInvoices: async (options: GetInvoicesOptions): Promise<GetInvoicesResponse> => {
        const opts = options || {} as any;
    const { 'collection_method': _collectionMethod, 'created': _created, 'customer': _customer, 'customer_account': _customerAccount, 'due_date': _dueDate, 'ending_before': _endingBefore, 'expand': _expand, 'limit': _limit, 'starting_after': _startingAfter, 'status': _status, 'subscription': _subscription, 'headers': _headers, '_credentials': _credentials, 'fused': _fused, ...body } = opts;

    const requestHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (_headers) {
      for (const [k, v] of Object.entries(_headers as Record<string, string>)) {
        if (v !== undefined) requestHeaders[k] = String(v);
      }
    }

    let reqObj: HttpRequest = {
      method: "GET",
      operationId: 'GetInvoices',
      headers: requestHeaders,
      body: this._buildEngineParams({ ...{}, ...{ 'collection_method': opts['collection_method'], 'created': opts['created'], 'customer': opts['customer'], 'customer_account': opts['customer_account'], 'due_date': opts['due_date'], 'ending_before': opts['ending_before'], 'expand': opts['expand'], 'limit': opts['limit'], 'starting_after': opts['starting_after'], 'status': opts['status'], 'subscription': opts['subscription'] }, ...{}, ...{} }, body),
      credentials: this._buildMethodCredentials(_fused, _credentials),
      paginationMaxPages: _fused?.pagination?.maxPages,
      timeoutMs: this._timeoutMs
    };

    if (this._auths && this._auths.length > 0) {
      for (const auth of this._auths) {
        reqObj = await auth.apply(reqObj);
      }
    }

    const response = await this._http.request<any>(reqObj);

    if (response.status === 401 || response.status === 403 || response.status === 429) {
      normaliseError('Stripe', 'GetInvoices', response);
    }

if (response.ok) {
      return { ok: true, status: response.status, data: response.body as GetInvoicesSuccessResult, error: null };
    } else {
      return { ok: false, status: response.status, data: null, error: response.body as GetInvoicesErrorResult };
    }
  },

  /**
   * <p>Retrieves the invoice with the given ID.</p>
   */
  getInvoicesInvoice: async (options: GetInvoicesInvoiceOptions): Promise<GetInvoicesInvoiceResponse> => {
        const opts = options || {} as any;
    const { 'expand': _expand, 'invoice': _invoice, 'headers': _headers, '_credentials': _credentials, 'fused': _fused, ...body } = opts;

    const requestHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (_headers) {
      for (const [k, v] of Object.entries(_headers as Record<string, string>)) {
        if (v !== undefined) requestHeaders[k] = String(v);
      }
    }

    let reqObj: HttpRequest = {
      method: "GET",
      operationId: 'GetInvoicesInvoice',
      headers: requestHeaders,
      body: this._buildEngineParams({ ...{ 'invoice': opts['invoice'] }, ...{ 'expand': opts['expand'] }, ...{}, ...{} }, body),
      credentials: this._buildMethodCredentials(_fused, _credentials),
      paginationMaxPages: _fused?.pagination?.maxPages,
      timeoutMs: this._timeoutMs
    };

    if (this._auths && this._auths.length > 0) {
      for (const auth of this._auths) {
        reqObj = await auth.apply(reqObj);
      }
    }

    const response = await this._http.request<any>(reqObj);

    if (response.status === 401 || response.status === 403 || response.status === 429) {
      normaliseError('Stripe', 'GetInvoicesInvoice', response);
    }

if (response.ok) {
      return { ok: true, status: response.status, data: response.body as GetInvoicesInvoiceSuccessResult, error: null };
    } else {
      return { ok: false, status: response.status, data: null, error: response.body as GetInvoicesInvoiceErrorResult };
    }
  },

  /**
   * <p>When retrieving an invoice, you’ll get a <strong>lines</strong> property containing the total count of line items and the first handful of those items. There is also a URL where you can retrieve the full (paginated) list of line items.</p>
   */
  getInvoicesInvoiceLines: async (options: GetInvoicesInvoiceLinesOptions): Promise<GetInvoicesInvoiceLinesResponse> => {
        const opts = options || {} as any;
    const { 'ending_before': _endingBefore, 'expand': _expand, 'invoice': _invoice, 'limit': _limit, 'starting_after': _startingAfter, 'headers': _headers, '_credentials': _credentials, 'fused': _fused, ...body } = opts;

    const requestHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (_headers) {
      for (const [k, v] of Object.entries(_headers as Record<string, string>)) {
        if (v !== undefined) requestHeaders[k] = String(v);
      }
    }

    let reqObj: HttpRequest = {
      method: "GET",
      operationId: 'GetInvoicesInvoiceLines',
      headers: requestHeaders,
      body: this._buildEngineParams({ ...{ 'invoice': opts['invoice'] }, ...{ 'ending_before': opts['ending_before'], 'expand': opts['expand'], 'limit': opts['limit'], 'starting_after': opts['starting_after'] }, ...{}, ...{} }, body),
      credentials: this._buildMethodCredentials(_fused, _credentials),
      paginationMaxPages: _fused?.pagination?.maxPages,
      timeoutMs: this._timeoutMs
    };

    if (this._auths && this._auths.length > 0) {
      for (const auth of this._auths) {
        reqObj = await auth.apply(reqObj);
      }
    }

    const response = await this._http.request<any>(reqObj);

    if (response.status === 401 || response.status === 403 || response.status === 429) {
      normaliseError('Stripe', 'GetInvoicesInvoiceLines', response);
    }

if (response.ok) {
      return { ok: true, status: response.status, data: response.body as GetInvoicesInvoiceLinesSuccessResult, error: null };
    } else {
      return { ok: false, status: response.status, data: null, error: response.body as GetInvoicesInvoiceLinesErrorResult };
    }
  },

  /**
   * <p>This endpoint creates a draft invoice for a given customer. The invoice remains a draft until you <a href="/api/invoices/finalize">finalize</a> the invoice, which allows you to <a href="/api/invoices/pay">pay</a> or <a href="/api/invoices/send">send</a> the invoice to your customers.</p>
   */
  postInvoices: async (options?: PostInvoicesOptions): Promise<PostInvoicesResponse> => {
        const opts = options || {} as any;
    const { 'headers': _headers, '_credentials': _credentials, 'fused': _fused, ...body } = opts;

    const requestHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (_headers) {
      for (const [k, v] of Object.entries(_headers as Record<string, string>)) {
        if (v !== undefined) requestHeaders[k] = String(v);
      }
    }

    let reqObj: HttpRequest = {
      method: "POST",
      operationId: 'PostInvoices',
      headers: requestHeaders,
      body: this._buildEngineParams({ ...{}, ...{}, ...{}, ...{} }, body),
      credentials: this._buildMethodCredentials(_fused, _credentials),
      paginationMaxPages: _fused?.pagination?.maxPages,
      timeoutMs: this._timeoutMs
    };

    if (this._auths && this._auths.length > 0) {
      for (const auth of this._auths) {
        reqObj = await auth.apply(reqObj);
      }
    }

    const response = await this._http.request<any>(reqObj);

    if (response.status === 401 || response.status === 403 || response.status === 429) {
      normaliseError('Stripe', 'PostInvoices', response);
    }

if (response.ok) {
      return { ok: true, status: response.status, data: response.body as PostInvoicesSuccessResult, error: null };
    } else {
      return { ok: false, status: response.status, data: null, error: response.body as PostInvoicesErrorResult };
    }
  },

  /**
   * <p>At any time, you can preview the upcoming invoice for a subscription or subscription schedule. This will show you all the charges that are pending, including subscription renewal charges, invoice item charges, etc. It will also show you any discounts that are applicable to the invoice.</p>

<p>You can also preview the effects of creating or updating a subscription or subscription schedule, including a preview of any prorations that will take place. To ensure that the actual proration is calculated exactly the same as the previewed proration, you should pass the <code>subscription_details.proration_date</code> parameter when doing the actual subscription update.</p>

<p>The recommended way to get only the prorations being previewed on the invoice is to consider line items where <code>parent.subscription_item_details.proration</code> is <code>true</code>.</p>

<p>Note that when you are viewing an upcoming invoice, you are simply viewing a preview – the invoice has not yet been created. As such, the upcoming invoice will not show up in invoice listing calls, and you cannot use the API to pay or edit the invoice. If you want to change the amount that your customer will be billed, you can add, remove, or update pending invoice items, or update the customer’s discount.</p>

<p>Note: Currency conversion calculations use the latest exchange rates. Exchange rates may vary between the time of the preview and the time of the actual invoice creation. <a href="https://docs.stripe.com/currencies/conversions">Learn more</a></p>
   */
  postInvoicesCreatePreview: async (options?: PostInvoicesCreatePreviewOptions): Promise<PostInvoicesCreatePreviewResponse> => {
        const opts = options || {} as any;
    const { 'headers': _headers, '_credentials': _credentials, 'fused': _fused, ...body } = opts;

    const requestHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (_headers) {
      for (const [k, v] of Object.entries(_headers as Record<string, string>)) {
        if (v !== undefined) requestHeaders[k] = String(v);
      }
    }

    let reqObj: HttpRequest = {
      method: "POST",
      operationId: 'PostInvoicesCreatePreview',
      headers: requestHeaders,
      body: this._buildEngineParams({ ...{}, ...{}, ...{}, ...{} }, body),
      credentials: this._buildMethodCredentials(_fused, _credentials),
      paginationMaxPages: _fused?.pagination?.maxPages,
      timeoutMs: this._timeoutMs
    };

    if (this._auths && this._auths.length > 0) {
      for (const auth of this._auths) {
        reqObj = await auth.apply(reqObj);
      }
    }

    const response = await this._http.request<any>(reqObj);

    if (response.status === 401 || response.status === 403 || response.status === 429) {
      normaliseError('Stripe', 'PostInvoicesCreatePreview', response);
    }

if (response.ok) {
      return { ok: true, status: response.status, data: response.body as PostInvoicesCreatePreviewSuccessResult, error: null };
    } else {
      return { ok: false, status: response.status, data: null, error: response.body as PostInvoicesCreatePreviewErrorResult };
    }
  },

  /**
   * <p>Draft invoices are fully editable. Once an invoice is <a href="/docs/billing/invoices/workflow#finalized">finalized</a>,
monetary values, as well as <code>collection_method</code>, become uneditable.</p>

<p>If you would like to stop the Stripe Billing engine from automatically finalizing, reattempting payments on,
sending reminders for, or <a href="/docs/billing/invoices/reconciliation">automatically reconciling</a> invoices, pass
<code>auto_advance=false</code>.</p>
   */
  postInvoicesInvoice: async (options: PostInvoicesInvoiceOptions): Promise<PostInvoicesInvoiceResponse> => {
        const opts = options || {} as any;
    const { 'invoice': _invoice, 'headers': _headers, '_credentials': _credentials, 'fused': _fused, ...body } = opts;

    const requestHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (_headers) {
      for (const [k, v] of Object.entries(_headers as Record<string, string>)) {
        if (v !== undefined) requestHeaders[k] = String(v);
      }
    }

    let reqObj: HttpRequest = {
      method: "POST",
      operationId: 'PostInvoicesInvoice',
      headers: requestHeaders,
      body: this._buildEngineParams({ ...{ 'invoice': opts['invoice'] }, ...{}, ...{}, ...{} }, body),
      credentials: this._buildMethodCredentials(_fused, _credentials),
      paginationMaxPages: _fused?.pagination?.maxPages,
      timeoutMs: this._timeoutMs
    };

    if (this._auths && this._auths.length > 0) {
      for (const auth of this._auths) {
        reqObj = await auth.apply(reqObj);
      }
    }

    const response = await this._http.request<any>(reqObj);

    if (response.status === 401 || response.status === 403 || response.status === 429) {
      normaliseError('Stripe', 'PostInvoicesInvoice', response);
    }

if (response.ok) {
      return { ok: true, status: response.status, data: response.body as PostInvoicesInvoiceSuccessResult, error: null };
    } else {
      return { ok: false, status: response.status, data: null, error: response.body as PostInvoicesInvoiceErrorResult };
    }
  }
  };

  public readonly prices = {

  /**
   * <p>Returns a list of your active prices, excluding <a href="/docs/products-prices/pricing-models#inline-pricing">inline prices</a>. For the list of inactive prices, set <code>active</code> to false.</p>
   */
  getPrices: async (options: GetPricesOptions): Promise<GetPricesResponse> => {
        const opts = options || {} as any;
    const { 'active': _active, 'created': _created, 'currency': _currency, 'ending_before': _endingBefore, 'expand': _expand, 'limit': _limit, 'lookup_keys': _lookupKeys, 'product': _product, 'recurring': _recurring, 'starting_after': _startingAfter, 'type': _type, 'headers': _headers, '_credentials': _credentials, 'fused': _fused, ...body } = opts;

    const requestHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (_headers) {
      for (const [k, v] of Object.entries(_headers as Record<string, string>)) {
        if (v !== undefined) requestHeaders[k] = String(v);
      }
    }

    let reqObj: HttpRequest = {
      method: "GET",
      operationId: 'GetPrices',
      headers: requestHeaders,
      body: this._buildEngineParams({ ...{}, ...{ 'active': opts['active'], 'created': opts['created'], 'currency': opts['currency'], 'ending_before': opts['ending_before'], 'expand': opts['expand'], 'limit': opts['limit'], 'lookup_keys': opts['lookup_keys'], 'product': opts['product'], 'recurring': opts['recurring'], 'starting_after': opts['starting_after'], 'type': opts['type'] }, ...{}, ...{} }, body),
      credentials: this._buildMethodCredentials(_fused, _credentials),
      paginationMaxPages: _fused?.pagination?.maxPages,
      timeoutMs: this._timeoutMs
    };

    if (this._auths && this._auths.length > 0) {
      for (const auth of this._auths) {
        reqObj = await auth.apply(reqObj);
      }
    }

    const response = await this._http.request<any>(reqObj);

    if (response.status === 401 || response.status === 403 || response.status === 429) {
      normaliseError('Stripe', 'GetPrices', response);
    }

if (response.ok) {
      return { ok: true, status: response.status, data: response.body as GetPricesSuccessResult, error: null };
    } else {
      return { ok: false, status: response.status, data: null, error: response.body as GetPricesErrorResult };
    }
  },

  /**
   * <p>Retrieves the price with the given ID.</p>
   */
  getPricesPrice: async (options: GetPricesPriceOptions): Promise<GetPricesPriceResponse> => {
        const opts = options || {} as any;
    const { 'expand': _expand, 'price': _price, 'headers': _headers, '_credentials': _credentials, 'fused': _fused, ...body } = opts;

    const requestHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (_headers) {
      for (const [k, v] of Object.entries(_headers as Record<string, string>)) {
        if (v !== undefined) requestHeaders[k] = String(v);
      }
    }

    let reqObj: HttpRequest = {
      method: "GET",
      operationId: 'GetPricesPrice',
      headers: requestHeaders,
      body: this._buildEngineParams({ ...{ 'price': opts['price'] }, ...{ 'expand': opts['expand'] }, ...{}, ...{} }, body),
      credentials: this._buildMethodCredentials(_fused, _credentials),
      paginationMaxPages: _fused?.pagination?.maxPages,
      timeoutMs: this._timeoutMs
    };

    if (this._auths && this._auths.length > 0) {
      for (const auth of this._auths) {
        reqObj = await auth.apply(reqObj);
      }
    }

    const response = await this._http.request<any>(reqObj);

    if (response.status === 401 || response.status === 403 || response.status === 429) {
      normaliseError('Stripe', 'GetPricesPrice', response);
    }

if (response.ok) {
      return { ok: true, status: response.status, data: response.body as GetPricesPriceSuccessResult, error: null };
    } else {
      return { ok: false, status: response.status, data: null, error: response.body as GetPricesPriceErrorResult };
    }
  },

  /**
   * <p>Creates a new <a href="https://docs.stripe.com/api/prices">Price</a> for an existing <a href="https://docs.stripe.com/api/products">Product</a>. The Price can be recurring or one-time.</p>
   */
  postPrices: async (options: PostPricesOptions): Promise<PostPricesResponse> => {
        const opts = options || {} as any;
    const { 'headers': _headers, '_credentials': _credentials, 'fused': _fused, ...body } = opts;

    const requestHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (_headers) {
      for (const [k, v] of Object.entries(_headers as Record<string, string>)) {
        if (v !== undefined) requestHeaders[k] = String(v);
      }
    }

    let reqObj: HttpRequest = {
      method: "POST",
      operationId: 'PostPrices',
      headers: requestHeaders,
      body: this._buildEngineParams({ ...{}, ...{}, ...{}, ...{} }, body),
      credentials: this._buildMethodCredentials(_fused, _credentials),
      paginationMaxPages: _fused?.pagination?.maxPages,
      timeoutMs: this._timeoutMs
    };

    if (this._auths && this._auths.length > 0) {
      for (const auth of this._auths) {
        reqObj = await auth.apply(reqObj);
      }
    }

    const response = await this._http.request<any>(reqObj);

    if (response.status === 401 || response.status === 403 || response.status === 429) {
      normaliseError('Stripe', 'PostPrices', response);
    }

if (response.ok) {
      return { ok: true, status: response.status, data: response.body as PostPricesSuccessResult, error: null };
    } else {
      return { ok: false, status: response.status, data: null, error: response.body as PostPricesErrorResult };
    }
  },

  /**
   * <p>Updates the specified price by setting the values of the parameters passed. Any parameters not provided are left unchanged.</p>
   */
  postPricesPrice: async (options: PostPricesPriceOptions): Promise<PostPricesPriceResponse> => {
        const opts = options || {} as any;
    const { 'price': _price, 'headers': _headers, '_credentials': _credentials, 'fused': _fused, ...body } = opts;

    const requestHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (_headers) {
      for (const [k, v] of Object.entries(_headers as Record<string, string>)) {
        if (v !== undefined) requestHeaders[k] = String(v);
      }
    }

    let reqObj: HttpRequest = {
      method: "POST",
      operationId: 'PostPricesPrice',
      headers: requestHeaders,
      body: this._buildEngineParams({ ...{ 'price': opts['price'] }, ...{}, ...{}, ...{} }, body),
      credentials: this._buildMethodCredentials(_fused, _credentials),
      paginationMaxPages: _fused?.pagination?.maxPages,
      timeoutMs: this._timeoutMs
    };

    if (this._auths && this._auths.length > 0) {
      for (const auth of this._auths) {
        reqObj = await auth.apply(reqObj);
      }
    }

    const response = await this._http.request<any>(reqObj);

    if (response.status === 401 || response.status === 403 || response.status === 429) {
      normaliseError('Stripe', 'PostPricesPrice', response);
    }

if (response.ok) {
      return { ok: true, status: response.status, data: response.body as PostPricesPriceSuccessResult, error: null };
    } else {
      return { ok: false, status: response.status, data: null, error: response.body as PostPricesPriceErrorResult };
    }
  }
  };

  public readonly products = {

  /**
   * <p>Returns a list of your products. The products are returned sorted by creation date, with the most recently created products appearing first.</p>
   */
  getProducts: async (options: GetProductsOptions): Promise<GetProductsResponse> => {
        const opts = options || {} as any;
    const { 'active': _active, 'created': _created, 'ending_before': _endingBefore, 'expand': _expand, 'ids': _ids, 'limit': _limit, 'shippable': _shippable, 'starting_after': _startingAfter, 'url': _url, 'headers': _headers, '_credentials': _credentials, 'fused': _fused, ...body } = opts;

    const requestHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (_headers) {
      for (const [k, v] of Object.entries(_headers as Record<string, string>)) {
        if (v !== undefined) requestHeaders[k] = String(v);
      }
    }

    let reqObj: HttpRequest = {
      method: "GET",
      operationId: 'GetProducts',
      headers: requestHeaders,
      body: this._buildEngineParams({ ...{}, ...{ 'active': opts['active'], 'created': opts['created'], 'ending_before': opts['ending_before'], 'expand': opts['expand'], 'ids': opts['ids'], 'limit': opts['limit'], 'shippable': opts['shippable'], 'starting_after': opts['starting_after'], 'url': opts['url'] }, ...{}, ...{} }, body),
      credentials: this._buildMethodCredentials(_fused, _credentials),
      paginationMaxPages: _fused?.pagination?.maxPages,
      timeoutMs: this._timeoutMs
    };

    if (this._auths && this._auths.length > 0) {
      for (const auth of this._auths) {
        reqObj = await auth.apply(reqObj);
      }
    }

    const response = await this._http.request<any>(reqObj);

    if (response.status === 401 || response.status === 403 || response.status === 429) {
      normaliseError('Stripe', 'GetProducts', response);
    }

if (response.ok) {
      return { ok: true, status: response.status, data: response.body as GetProductsSuccessResult, error: null };
    } else {
      return { ok: false, status: response.status, data: null, error: response.body as GetProductsErrorResult };
    }
  },

  /**
   * <p>Retrieves the details of an existing product. Supply the unique product ID from either a product creation request or the product list, and Stripe will return the corresponding product information.</p>
   */
  getProductsId: async (options: GetProductsIdOptions): Promise<GetProductsIdResponse> => {
        const opts = options || {} as any;
    const { 'expand': _expand, 'id': _id, 'headers': _headers, '_credentials': _credentials, 'fused': _fused, ...body } = opts;

    const requestHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (_headers) {
      for (const [k, v] of Object.entries(_headers as Record<string, string>)) {
        if (v !== undefined) requestHeaders[k] = String(v);
      }
    }

    let reqObj: HttpRequest = {
      method: "GET",
      operationId: 'GetProductsId',
      headers: requestHeaders,
      body: this._buildEngineParams({ ...{ 'id': opts['id'] }, ...{ 'expand': opts['expand'] }, ...{}, ...{} }, body),
      credentials: this._buildMethodCredentials(_fused, _credentials),
      paginationMaxPages: _fused?.pagination?.maxPages,
      timeoutMs: this._timeoutMs
    };

    if (this._auths && this._auths.length > 0) {
      for (const auth of this._auths) {
        reqObj = await auth.apply(reqObj);
      }
    }

    const response = await this._http.request<any>(reqObj);

    if (response.status === 401 || response.status === 403 || response.status === 429) {
      normaliseError('Stripe', 'GetProductsId', response);
    }

if (response.ok) {
      return { ok: true, status: response.status, data: response.body as GetProductsIdSuccessResult, error: null };
    } else {
      return { ok: false, status: response.status, data: null, error: response.body as GetProductsIdErrorResult };
    }
  },

  /**
   * <p>Creates a new product object.</p>
   */
  postProducts: async (options: PostProductsOptions): Promise<PostProductsResponse> => {
        const opts = options || {} as any;
    const { 'headers': _headers, '_credentials': _credentials, 'fused': _fused, ...body } = opts;

    const requestHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (_headers) {
      for (const [k, v] of Object.entries(_headers as Record<string, string>)) {
        if (v !== undefined) requestHeaders[k] = String(v);
      }
    }

    let reqObj: HttpRequest = {
      method: "POST",
      operationId: 'PostProducts',
      headers: requestHeaders,
      body: this._buildEngineParams({ ...{}, ...{}, ...{}, ...{} }, body),
      credentials: this._buildMethodCredentials(_fused, _credentials),
      paginationMaxPages: _fused?.pagination?.maxPages,
      timeoutMs: this._timeoutMs
    };

    if (this._auths && this._auths.length > 0) {
      for (const auth of this._auths) {
        reqObj = await auth.apply(reqObj);
      }
    }

    const response = await this._http.request<any>(reqObj);

    if (response.status === 401 || response.status === 403 || response.status === 429) {
      normaliseError('Stripe', 'PostProducts', response);
    }

if (response.ok) {
      return { ok: true, status: response.status, data: response.body as PostProductsSuccessResult, error: null };
    } else {
      return { ok: false, status: response.status, data: null, error: response.body as PostProductsErrorResult };
    }
  },

  /**
   * <p>Updates the specific product by setting the values of the parameters passed. Any parameters not provided will be left unchanged.</p>
   */
  postProductsId: async (options: PostProductsIdOptions): Promise<PostProductsIdResponse> => {
        const opts = options || {} as any;
    const { 'id': _id, 'headers': _headers, '_credentials': _credentials, 'fused': _fused, ...body } = opts;

    const requestHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (_headers) {
      for (const [k, v] of Object.entries(_headers as Record<string, string>)) {
        if (v !== undefined) requestHeaders[k] = String(v);
      }
    }

    let reqObj: HttpRequest = {
      method: "POST",
      operationId: 'PostProductsId',
      headers: requestHeaders,
      body: this._buildEngineParams({ ...{ 'id': opts['id'] }, ...{}, ...{}, ...{} }, body),
      credentials: this._buildMethodCredentials(_fused, _credentials),
      paginationMaxPages: _fused?.pagination?.maxPages,
      timeoutMs: this._timeoutMs
    };

    if (this._auths && this._auths.length > 0) {
      for (const auth of this._auths) {
        reqObj = await auth.apply(reqObj);
      }
    }

    const response = await this._http.request<any>(reqObj);

    if (response.status === 401 || response.status === 403 || response.status === 429) {
      normaliseError('Stripe', 'PostProductsId', response);
    }

if (response.ok) {
      return { ok: true, status: response.status, data: response.body as PostProductsIdSuccessResult, error: null };
    } else {
      return { ok: false, status: response.status, data: null, error: response.body as PostProductsIdErrorResult };
    }
  }
  };
}
