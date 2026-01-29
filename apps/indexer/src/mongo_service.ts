import mongoose from 'mongoose';

export class MongoService {
    private static instance: MongoService;
    private isConnected: boolean = false;
    private constructor() {}

    public static getInstance(): MongoService {
        if (!MongoService.instance) {
            MongoService.instance = new MongoService();
        }
        return MongoService.instance;
    }

    async connect(uri?: string): Promise<boolean> {
        const mongoUri = uri || process.env.MONGODB_URI || '';

        try {
            await mongoose.connect(mongoUri);
            this.isConnected = true;
            return true;
        } catch (error: any) {
            console.error('[MongoDB] Connection error:', error.message);
            return false;
        }
    }

    async disconnect(): Promise<void> {
        if (this.isConnected) {
            await mongoose.disconnect();
            this.isConnected = false;
            console.error('[MongoDB] MongoDB disconnected');
        }
    }
}

export const mongoService = MongoService.getInstance();