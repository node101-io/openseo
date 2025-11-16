import { Schema, model, Document, Model } from "mongoose";

const MIN_KEYWORD_LENGTH = 2;
const MAX_KEYWORD_LENGTH = 255;

const MIN_KEYWORD_SCORE_VALUE = 0;
const MAX_KEYWORD_SCORE_VALUE = 100;
const DEFAULT_KEYWORD_SCORE_VALUE = MIN_KEYWORD_SCORE_VALUE;

const MAX_PROOF_LENGTH = 10485760; // 10MB in bytes

export interface IKeyword {
  keyword: string;
  score: number;
  proof: string;
}

export interface IWebsite extends Document {
  url: string;
  search_params: IKeyword[];
  createdAt: Date;
  updatedAt: Date;
}

const KeywordSchema = new Schema<IKeyword>({
  keyword: {
    type: String,
    trim: true,
    required: [true, "Keyword is required"],
    minlength: [MIN_KEYWORD_LENGTH, `Keyword must be at least ${MIN_KEYWORD_LENGTH} characters`],
    maxlength: [MAX_KEYWORD_LENGTH, `Keyword cannot exceed ${MAX_KEYWORD_LENGTH} characters`],
    validate: {
      validator: function (v: string): boolean {
        return typeof v === "string" && v.trim().length >= MIN_KEYWORD_LENGTH;
      },
      message: "Keyword must be a valid non-empty string",
    },
  },
  score: {
    type: Number,
    required: [true, "Score is required"],
    default: DEFAULT_KEYWORD_SCORE_VALUE,
    min: [MIN_KEYWORD_SCORE_VALUE, `Score must be at least ${MIN_KEYWORD_SCORE_VALUE}`],
    max: [MAX_KEYWORD_SCORE_VALUE, `Score cannot exceed ${MAX_KEYWORD_SCORE_VALUE}`],
    validate: {
      validator: function (v: number): boolean {
        return Number.isFinite(v);
      },
      message: "Score must be a valid number",
    },
  },
  proof: {
    type: String,
    trim: true,
    required: [true, "Proof is required"],
    maxlength: [MAX_PROOF_LENGTH, `Proof cannot exceed ${MAX_PROOF_LENGTH} bytes (10MB)`],
    validate: {
      validator: function (v: string): boolean {
        return typeof v === "string" && Buffer.byteLength(v, "utf8") <= MAX_PROOF_LENGTH;
      },
      message: `Proof size cannot exceed 10MB`,
    },
  },
});

const WebsiteSchema = new Schema<IWebsite>(
  {
    url: {
      type: String,
      trim: true,
      required: [true, "URL is required"],
      index: true,
      sparse: true,
      unique: true,
      validate: {
        validator: function (v: string): boolean {
          try {
            new URL(v);
            return true;
          } catch {
            return false;
          }
        },
        message: "Invalid URL format",
      },
    },
    search_params: {
      type: [KeywordSchema],
      required: [true, "Search params are required"],
      validate: {
        validator: function (v: IKeyword[]): boolean {
          return Array.isArray(v) && v.length > 0;
        },
        message: "Search params must be a non-empty array",
      },
    },
  },
  {
    timestamps: true,
  }
);

WebsiteSchema.index({ "search_params.keyword": 1 });

WebsiteSchema.statics.createWebsite = async function (url: string, searchParams: IKeyword[]) {
  const website = new Website({
    url,
    search_params: searchParams,
  });

  try {
    await website.validate();
  } catch (validationError: any) {
    if (validationError.errors) {
      const errors = Object.values(validationError.errors)
        .map((err: any) => err.message)
        .join("; ");
      throw new Error(`Validation failed: ${errors}`);
    }
    throw validationError;
  }

  try {
    return await website.save();
  } catch (dbError: any) {
    if (dbError.code === 11000) {
      throw new Error("Website with this URL already exists");
    }

    console.error("[Website.createWebsite] Database error:", {
      name: dbError.name,
      message: dbError.message,
      code: dbError.code,
      stack: dbError.stack,
    });

    throw new Error(`Database error`);
  }
};

export interface IWebsiteModel extends Model<IWebsite> {
  createWebsite(url: string, searchParams: IKeyword[]): Promise<IWebsite>;
}

export const Website = model<IWebsite, IWebsiteModel>("Website", WebsiteSchema);
