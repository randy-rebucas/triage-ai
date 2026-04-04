import mongoose, { Schema, Document, Model } from "mongoose";

// ─────────────────────────────────────────────────────────────────
// Tenant Model
// Each clinic is one tenant. Shared-DB multi-tenant architecture:
// every other collection is filtered by tenantId.
// ─────────────────────────────────────────────────────────────────

const RESERVED_SUBDOMAINS = [
  "www", "api", "admin", "app", "mail", "ftp", "localhost",
  "staging", "dev", "test", "demo", "support", "help", "status",
];

const SUBDOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

export type TenantStatus = "active" | "inactive" | "suspended";
export type SubscriptionStatus = "active" | "cancelled" | "expired";
export type BillingCycle = "monthly" | "yearly";
export type TimeFormat = "12h" | "24h";
export type Language = "en" | "es";
export type CurrencyPosition = "before" | "after";

export interface IPaymentHistoryEntry {
  transactionId: string;
  orderId: string;
  amount: number;
  currency: string;
  payerEmail: string;
  plan: string;
  billingCycle: BillingCycle;
  status: string;
  paidAt: Date;
}

export interface ITenantDocument extends Document {
  name: string;
  subdomain: string;
  displayName?: string;
  email?: string;
  phone?: string;
  address: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
  settings: {
    timezone: string;
    currency: string;
    currencySymbol?: string;
    currencyPosition: CurrencyPosition;
    dateFormat: string;
    timeFormat: TimeFormat;
    language: Language;
    numberFormat: {
      decimalSeparator: string;
      thousandsSeparator: string;
      decimalPlaces: number;
    };
    logo?: string;
    primaryColor?: string;
    secondaryColor?: string;
  };
  status: TenantStatus;
  subscription: {
    plan?: string;
    status: SubscriptionStatus;
    billingCycle?: BillingCycle;
    expiresAt?: Date;
    renewalAt?: Date;
    paypalOrderId?: string;
    paypalSubscriptionId?: string;
    processedWebhookIds: string[];
    paymentHistory: IPaymentHistoryEntry[];
  };
  createdAt: Date;
  updatedAt: Date;
}

interface ITenantModel extends Model<ITenantDocument> {
  findBySubdomain(subdomain: string): Promise<ITenantDocument | null>;
}

const tenantSchema = new Schema<ITenantDocument>(
  {
    name: {
      type: String,
      required: [true, "Clinic name is required"],
      trim: true,
      minlength: [2, "Clinic name must be at least 2 characters"],
      maxlength: [200, "Clinic name cannot exceed 200 characters"],
    },
    subdomain: {
      type: String,
      required: [true, "Subdomain is required"],
      unique: true,
      lowercase: true,
      trim: true,
      minlength: [2, "Subdomain must be at least 2 characters"],
      maxlength: [63, "Subdomain cannot exceed 63 characters"],
    },
    displayName: { type: String, trim: true },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Invalid email format"],
    },
    phone: { type: String, trim: true },
    address: {
      street: { type: String, trim: true },
      city: { type: String, trim: true },
      state: { type: String, trim: true },
      zipCode: { type: String, trim: true },
      country: { type: String, trim: true, default: "Philippines" },
    },
    settings: {
      timezone: { type: String, default: "UTC" },
      currency: { type: String, default: "PHP" },
      currencySymbol: { type: String },
      currencyPosition: {
        type: String,
        enum: ["before", "after"],
        default: "before",
      },
      dateFormat: { type: String, default: "MM/DD/YYYY" },
      timeFormat: { type: String, enum: ["12h", "24h"], default: "12h" },
      language: { type: String, enum: ["en", "es"], default: "en" },
      numberFormat: {
        decimalSeparator: { type: String, default: "." },
        thousandsSeparator: { type: String, default: "," },
        decimalPlaces: { type: Number, default: 2 },
      },
      logo: { type: String },
      primaryColor: { type: String, default: "#3b82f6" },
      secondaryColor: { type: String, default: "#1e3a8a" },
    },
    status: {
      type: String,
      enum: ["active", "inactive", "suspended"],
      default: "active",
    },
    subscription: {
      plan: { type: String },
      status: {
        type: String,
        enum: ["active", "cancelled", "expired"],
        default: "active",
      },
      billingCycle: {
        type: String,
        enum: ["monthly", "yearly"],
      },
      expiresAt: { type: Date },
      renewalAt: { type: Date },
      paypalOrderId: { type: String },
      paypalSubscriptionId: { type: String },
      processedWebhookIds: { type: [String], default: [] },
      paymentHistory: [
        {
          transactionId: String,
          orderId: String,
          amount: Number,
          currency: String,
          payerEmail: String,
          plan: String,
          billingCycle: String,
          status: String,
          paidAt: Date,
        },
      ],
    },
  },
  { timestamps: true }
);

// ─── Subdomain validation in pre-save ────────────────────────────
tenantSchema.pre("save", function (next) {
  if (!this.isModified("subdomain")) return next();

  const sub = this.subdomain;

  if (!SUBDOMAIN_REGEX.test(sub)) {
    return next(
      new Error(
        "Subdomain may only contain lowercase letters, numbers, and hyphens, and must not start or end with a hyphen."
      )
    );
  }

  if (RESERVED_SUBDOMAINS.includes(sub)) {
    return next(new Error(`"${sub}" is a reserved subdomain name.`));
  }

  next();
});

// ─── Static methods ──────────────────────────────────────────────
tenantSchema.statics.findBySubdomain = function (
  subdomain: string
): Promise<ITenantDocument | null> {
  return this.findOne({ subdomain: subdomain.toLowerCase(), status: "active" });
};

// ─── Indexes ─────────────────────────────────────────────────────
tenantSchema.index({ status: 1 });
tenantSchema.index({ "subscription.status": 1 });
tenantSchema.index({ "subscription.paypalOrderId": 1 });
tenantSchema.index({ createdAt: -1 });

const Tenant =
  (mongoose.models.Tenant as ITenantModel) ||
  mongoose.model<ITenantDocument, ITenantModel>("Tenant", tenantSchema);

export default Tenant;
export { RESERVED_SUBDOMAINS, SUBDOMAIN_REGEX };
