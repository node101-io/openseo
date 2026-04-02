import mongoose, { Schema, Document } from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

export interface IZkProofMetadata extends Document {
    keywordScores: any;
    rawKeywordScores: number[];
    cid: string;            
    root: string;         
    keywords: string[];     
    siteUrl: string;        
    proof: string;          
    totalScore?: number;    
    verified: boolean;      
    createdAt: Date;
}

const ZkProofMetadataSchema: Schema = new Schema({
    cid: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    root: {
        type: String,
        required: true,
        index: true
    },
    keywords: {
        type: [String],
        required: true,
        index: true
    },
    keywordScores: [{
        keyword: { type: String, required: true },
        score: { type: Number, required: true }
    }],
    siteUrl: {
        type: String,
        required: true,
        index: true
    },
    proof: {
        type: String,
        required: true
    },
    rawKeywordScores: {
        type: [Number],
        default: []
    },
    totalScore: {
        type: Number,
        default: null
    },
    verified: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

ZkProofMetadataSchema.index({ cid: 1, root: 1 });
ZkProofMetadataSchema.index({ keywords: 1, siteUrl: 1 });

const collectionName = 'proofs';

export const ZkProofMetadata = mongoose.model<IZkProofMetadata>(
  'ZkProofMetadata',
  ZkProofMetadataSchema,
  collectionName
);
